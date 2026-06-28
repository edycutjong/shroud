const { execSync } = require("child_process");

console.log("============================================================");
console.log("SHROUD CRYPTOGRAPHIC PROTOCOL TEST SUITE RUNNER");
console.log("============================================================");

try {
  console.log("Executing test-runner.js...");
  execSync("node scripts/test-runner.js", { stdio: "inherit" });
  console.log("============================================================");
  console.log("✅ All Shroud tests passed successfully!");
  console.log("============================================================");
  process.exit(0);
} catch (error) {
  console.error("============================================================");
  console.error("❌ Shroud test suite execution failed!");
  console.error("============================================================");
  process.exit(1);
}
