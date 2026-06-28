// REAL on-chain demo for Shroud's v3 multi-ASP federation (K-of-N compliance):
//   two registered ASP operators each attest a fresh compliance root; the root is
//   approved only once K=2 distinct operators agree, at which point it is adopted
//   as the live compliance root (get_root).
//
// Prereqs (one-time, already done on the deployed registry): the two operators are
// registered (`register_asp`) and the threshold is set (`set_threshold 2`). This
// script uses a FRESH random root each run so it never collides with prior runs.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const FED = process.env.FEDERATION_ID || "CADP225KUYYG7IX42KGWFS4ED4YGDQVACDPTGXJY6PUSVLUKPIBYC7DT";
const OP1_SRC = process.env.ASP1_SRC || "aspop1";
const OP2_SRC = process.env.ASP2_SRC || "aspop2";
const ENV = { ...process.env, PATH: `${process.env.HOME}/homebrew/bin:${process.env.PATH}` };

const sx = (args) => execFileSync("stellar", args, { encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
const addr = (name) => sx(["keys", "address", name]);
const call = (src, fn, ...args) => sx(["contract", "invoke", "--id", FED, "--source", src, "--network", "testnet", "--send=yes", "--", fn, ...args]).split("\n").pop().trim();
const view = (fn, ...args) => sx(["contract", "invoke", "--id", FED, "--source", "deployer", "--network", "testnet", "--", fn, ...args]).split("\n").pop().trim();
// RPC read-after-write can briefly lag a just-applied tx; poll until the view matches.
const sleep = (ms) => { const e = Date.now() + ms; while (Date.now() < e) { /* spin */ } };
const norm = (s) => s.replaceAll('"', "");
const viewUntil = (want, fn, ...args) => { for (let i = 0; i < 8; i++) { if (norm(view(fn, ...args)) === norm(want)) return want; sleep(1500); } return view(fn, ...args); };

const root = randomBytes(32).toString("hex");
const op1 = addr(OP1_SRC), op2 = addr(OP2_SRC);
console.log(`Federation ${FED}  (N=${view("asp_count")} ASPs)  fresh root ${root.slice(0, 12)}…`);

const c1 = call(OP1_SRC, "attest_root", "--operator", op1, "--root", root);
console.log(`ASP#1 attests -> count=${c1}, approved=${view("is_root_approved", "--root", root)}`);
if (view("is_root_approved", "--root", root) === "true") { console.error("approved with only 1 attestation!"); process.exit(1); }

const c2 = call(OP2_SRC, "attest_root", "--operator", op2, "--root", root);
const approved = viewUntil("true", "is_root_approved", "--root", root);
console.log(`ASP#2 attests -> count=${c2}, approved=${approved}`);
if (approved !== "true") { console.error("threshold not reached after 2 attestations!"); process.exit(1); }

const adopted = viewUntil(root, "get_root").replaceAll('"', "");
console.log(`Adopted live compliance root => ${adopted.slice(0, 12)}…  (matches: ${adopted === root})`);
if (adopted !== root) { console.error("approved root not adopted as live root!"); process.exit(1); }

console.log("\n✅ K-of-N multi-ASP federation verified on-chain: 1 attestation insufficient, 2 reach threshold and adopt the root.");
