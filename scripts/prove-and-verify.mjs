// End-to-end REAL proving demo (mirrors the browser path):
//   fresh random inputs -> snarkjs groth16.fullProve (BN254 / bn128)
//   -> convert to soroban byte layout -> invoke the on-chain verifier.
// Proves the JS proving pipeline produces proofs the deployed contract accepts.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import * as snarkjs from "snarkjs";

import { buildEddsa, buildPoseidon } from "circomlibjs";
import {
  rpc,
  TransactionBuilder,
  Networks,
  Contract,
  Address,
  nativeToScVal,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const C = resolve(__dirname, "../circuits/build");
const VERIFIER =
  process.env.VERIFIER_ID ||
  "CAM37IGZ44SKFE6SBWMCIKAGRHU7NCMIBONDZM3QHKIZ5DV4PWAH57GH";

const rndFr = () => BigInt("0x" + randomBytes(31).toString("hex")).toString();
const beHex = (dec, bytes) =>
  BigInt(dec)
    .toString(16)
    .padStart(bytes * 2, "0");
// BN254 (bn128): G1 = be(X)||be(Y) (32+32); G2 Fp2 = be(c1)||be(c0).
const g1 = (p) => beHex(p[0], 32) + beHex(p[1], 32);
const g2 = (p) =>
  beHex(p[0][1], 32) +
  beHex(p[0][0], 32) +
  beHex(p[1][1], 32) +
  beHex(p[1][0], 32);

async function run() {
  const eddsa = await buildEddsa();
  const poseidon = await buildPoseidon();

  // 1) fresh witness inputs
  const nullifier = rndFr(),
    secret = rndFr();
  const dpath = [rndFr(), rndFr()],
    cpath = [rndFr(), rndFr()];
  const caddr = rndFr(),
    recipient = rndFr();

  // 2) derive consistent public signals via the gen circuit witness
  const genInput = { nullifier, secret, dpath, caddr, cpath };
  const { execSync } = await import("node:child_process");
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
  const [, commitment, nullifier_hash, deposit_root, compliance_root] = w; // eslint-disable-line

  // generate owner signature over nullifier_hash
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

  // 3) full withdraw input
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

  // 4) REAL groth16 proof (browser uses the same call)
  console.log(
    "Generating real BN254 Groth16 proof (snarkjs.groth16.fullProve)...",
  );
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    `${C}/withdraw_js/withdraw.wasm`,
    `${C}/wd_final.zkey`,
  );

  // sanity: off-chain verify
  const vk = (await import(`${C}/vk.json`, { with: { type: "json" } })).default;
  const okOff = await snarkjs.groth16.verify(vk, publicSignals, proof);
  console.log("off-chain verify:", okOff);

  // 5) convert to soroban layout
  const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
  const pubHex = publicSignals.map((v) => beHex(v, 32));

  // 6) invoke the deployed verifier (read-only simulation returns the bool)
  console.log("Invoking on-chain verify_proof on", VERIFIER, "...");
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
  let onchain = "false";
  if (rpc.Api.isSimulationSuccess(sim)) {
    onchain = String(scValToNative(sim.result.retval));
  } else {
    console.error("Simulation failed:", sim.error || sim);
  }

  console.log("on-chain verify_proof =>", onchain);
  if (onchain !== "true") process.exit(1);
  console.log("\n✅ JS-generated proof accepted on-chain.");
}
run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
