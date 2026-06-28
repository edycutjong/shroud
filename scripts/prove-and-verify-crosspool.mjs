// End-to-end REAL proving demo for Shroud's v3 cross-pool atomic swap:
//   cross_pool circuit (value conservation at a proven FX rate + Poseidon Merkle
//   membership in Pool A + output commitment + swap hash) -> snarkjs
//   groth16.fullProve (bn128) -> soroban bytes -> on-chain verify_proof on the
//   dedicated cross-pool verifier. Tampered public inputs are rejected.
//
// publicSignals order (snarkjs: outputs first, then public inputs):
//   [ pool_a_nullifier_hash, pool_b_output_commitment, swap_hash,
//     pool_a_merkle_root, fx_rate_numerator, fx_rate_denominator ]
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const C = resolve(__dirname, "../circuits/build");
const VERIFIER = process.env.CROSSPOOL_VERIFIER_ID || "CDEEOEOHKMDVVIIWOKMQ6L4NZCXFAEDKYPCEI3GGRXUQPSOIMQJGQS6R";

const beHex = (dec, bytes) => BigInt(dec).toString(16).padStart(bytes * 2, "0");
const g1 = (p) => beHex(p[0], 32) + beHex(p[1], 32);
const g2 = (p) => beHex(p[0][1], 32) + beHex(p[0][0], 32) + beHex(p[1][1], 32) + beHex(p[1][0], 32);

async function run() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const H = (a, b) => F.toObject(poseidon([BigInt(a), BigInt(b)]));

  // Pool A note + depth-2 Merkle path (both indices 0).
  const input_nullifier = "7", input_secret = "8";
  const path_elements = ["111", "222"], path_indices = ["0", "0"];
  const commitment_a = H(input_nullifier, input_secret);
  const lvl1 = H(commitment_a, BigInt(path_elements[0]));
  const pool_a_merkle_root = H(lvl1, BigInt(path_elements[1])).toString();

  // Value conservation: input_a * fx_num == output_b * fx_den.
  const fx_rate_numerator = "1100", fx_rate_denominator = "1000";
  const input_amount_a = "1000", output_amount_b = "1100", output_secret_b = "999";

  const input = {
    pool_a_merkle_root, fx_rate_numerator, fx_rate_denominator,
    input_amount_a, output_amount_b, input_nullifier, input_secret, output_secret_b,
    path_elements, path_indices,
  };

  console.log("Generating real BN254 Groth16 cross-pool atomic-swap proof...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input, `${C}/cross_pool_js/cross_pool.wasm`, `${C}/cp_final.zkey`);
  const vk = (await import(`${C}/crosspool_vk.json`, { with: { type: "json" } })).default;
  console.log("off-chain verify:", await snarkjs.groth16.verify(vk, publicSignals, proof));

  const proofHex = g1(proof.pi_a) + g2(proof.pi_b) + g1(proof.pi_c);
  const pubHex = publicSignals.map((v) => beHex(v, 32));

  const invoke = (pubs) => execFileSync("stellar", [
    "contract", "invoke", "--id", VERIFIER, "--source", "deployer", "--network", "testnet",
    "--", "verify_proof", "--proof", proofHex, "--public_inputs", JSON.stringify(pubs),
  ], { encoding: "utf8", env: { ...process.env, PATH: `${process.env.HOME}/homebrew/bin:${process.env.PATH}` } }).trim().split("\n").pop().trim();

  console.log("Invoking on-chain verify_proof on", VERIFIER, "...");
  const onchain = invoke(pubHex);
  console.log("on-chain verify_proof =>", onchain);
  if (onchain !== "true") process.exit(1);

  // negative control: tamper fx_rate_numerator (index 4) -> must be rejected
  const bad = [...pubHex];
  bad[4] = "0000000000000000000000000000000000000000000000000000000000000001";
  const tampered = invoke(bad);
  console.log("on-chain verify_proof (tampered) =>", tampered);
  if (tampered === "true") { console.error("tampered proof accepted!"); process.exit(1); }

  console.log("\n✅ Real BN254 Groth16 cross-pool atomic-swap proof verified on-chain; tampered proof rejected.");
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
