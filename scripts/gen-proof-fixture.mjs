// Generates a REAL BN254 Groth16 withdrawal proof (identical pipeline to
// prove-and-verify.mjs), confirms it verifies TRUE on the deployed verifier,
// then writes it as a static fixture the web app re-verifies on-chain live.
// This is the "one I prepared earlier" proof — real snarkjs output, checked by
// the real contract; the app's /api/verify-onchain replays the on-chain check.
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { buildEddsa } from "circomlibjs";
import {
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
  nativeToScVal,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const C = resolve(__dirname, "../circuits/build");
const OUT = resolve(__dirname, "../src/app/api/verify-onchain/proof.json");
const VERIFIER =
  process.env.VERIFIER_ID ||
  "CAM37IGZ44SKFE6SBWMCIKAGRHU7NCMIBONDZM3QHKIZ5DV4PWAH57GH";

const rndFr = () => BigInt("0x" + randomBytes(31).toString("hex")).toString();
const beHex = (dec, bytes) =>
  BigInt(dec)
    .toString(16)
    .padStart(bytes * 2, "0");
const g1 = (p) => beHex(p[0], 32) + beHex(p[1], 32);
const g2 = (p) =>
  beHex(p[0][1], 32) +
  beHex(p[0][0], 32) +
  beHex(p[1][1], 32) +
  beHex(p[1][0], 32);

async function run() {
  const eddsa = await buildEddsa();
  const nullifier = rndFr(),
    secret = rndFr();
  const dpath = [rndFr(), rndFr()],
    cpath = [rndFr(), rndFr()];
  const caddr = rndFr(),
    recipient = rndFr();

  const genInput = { nullifier, secret, dpath, caddr, cpath };
  execFileSync(
    "node",
    [
      `${C}/gen_js/generate_witness.js`,
      `${C}/gen_js/gen.wasm`,
      "/dev/stdin",
      `${C}/_gen.wtns`,
    ],
    { input: JSON.stringify(genInput) },
  );
  execSync(`npx snarkjs wtns export json ${C}/_gen.wtns ${C}/_gen.json`, {
    stdio: "ignore",
  });
  const w = (await import(`${C}/_gen.json`, { with: { type: "json" } }))
    .default;
  const [, , nullifier_hash, deposit_root, compliance_root] = w;

  const prvKey = Buffer.from(
    "0001020304050607080900010203040506070809000102030405060708090001",
    "hex",
  );
  const pubKey = eddsa.prv2pub(prvKey);
  const ownerAx = eddsa.F.toObject(pubKey[0]).toString();
  const ownerAy = eddsa.F.toObject(pubKey[1]).toString();
  const sig = eddsa.signPoseidon(prvKey, eddsa.F.e(nullifier_hash));
  const sigS = sig.S.toString();
  const sigR8x = eddsa.F.toObject(sig.R8[0]).toString();
  const sigR8y = eddsa.F.toObject(sig.R8[1]).toString();

  const input = {
    deposit_merkle_root: deposit_root,
    compliance_merkle_root: compliance_root,
    nullifier_hash,
    recipient_address: recipient,
    nullifier,
    secret,
    deposit_merkle_path: dpath,
    deposit_indices: ["0", "0"],
    compliance_address: caddr,
    compliance_merkle_path: cpath,
    compliance_indices: ["0", "0"],
    ownerAx,
    ownerAy,
    sigS,
    sigR8x,
    sigR8y,
  };

  console.log("Generating real BN254 Groth16 proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    `${C}/withdraw_js/withdraw.wasm`,
    `${C}/wd_final.zkey`,
  );

  const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
  const pubHex = publicSignals.map((v) => beHex(v, 32));

  // Confirm TRUE on-chain before writing the fixture.
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const contract = new Contract(VERIFIER);
  const call = contract.call(
    "verify_proof",
    nativeToScVal(Buffer.from(proofHex, "hex")),
    nativeToScVal(pubHex.map((p) => Buffer.from(p, "hex"))),
  );
  const source = "GAZV4ZZRKEWHOHWSVKLX7VZVDGJ6GAVSPHMFDBYMS6WQ74DBYP3FOMMX";
  const tx = new TransactionBuilder(new Account(source, "0"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(call)
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  const onchain =
    rpc.Api.isSimulationSuccess(sim) &&
    String(scValToNative(sim.result.retval)) === "true";
  console.log("on-chain verify_proof =>", onchain);
  if (!onchain) throw new Error("fixture proof did not verify true on-chain");

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _comment:
          "Real BN254 Groth16 withdrawal proof (snarkjs). Re-verified live on-chain by /api/verify-onchain.",
        verifier: VERIFIER,
        proofHex,
        publicInputsHex: pubHex,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Wrote fixture ->", OUT);
}
run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
