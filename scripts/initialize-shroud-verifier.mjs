// Initialize Shroud's on-chain verifier contract with the current vk.json/fixture.json:
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "../circuits/build/fixture.json");
const VERIFIER =
  process.env.VERIFIER_ID ||
  "CAM37IGZ44SKFE6SBWMCIKAGRHU7NCMIBONDZM3QHKIZ5DV4PWAH57GH";

if (!fs.existsSync(fixturePath)) {
  console.error("fixture.json not found! Run npm run build first.");
  process.exit(1);
}

const f = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

console.log("Initializing verifier contract", VERIFIER, "on testnet...");

try {
  const out = execFileSync(
    "stellar",
    [
      "contract",
      "invoke",
      "--id",
      VERIFIER,
      "--source",
      "deployer",
      "--network",
      "testnet",
      "--send=yes",
      "--",
      "initialize",
      "--alpha",
      f.vk.alpha,
      "--beta",
      f.vk.beta,
      "--gamma",
      f.vk.gamma,
      "--delta",
      f.vk.delta,
      "--ic",
      JSON.stringify(f.vk.ic),
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${process.env.HOME}/homebrew/bin:${process.env.PATH}`,
      },
    },
  );

  console.log("Initialization successful!");
  console.log(out.trim());
} catch (e) {
  console.error("Initialization failed:", e.message);
  if (e.stdout) console.error(e.stdout);
  if (e.stderr) console.error(e.stderr);
  process.exit(1);
}
