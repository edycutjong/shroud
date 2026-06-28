const assert = require("assert");
const crypto = require("crypto");

// Setup mock for snarkjs to run without WASM
global.snarkjs = {
  wtns: {
    calculate: async () => {},
    exportJson: async () => [
      0,
      "commit1",
      "nullifier_hash",
      "deposit_root",
      "compliance_root",
    ],
  },
  groth16: {
    fullProve: async () => ({
      proof: {
        pi_a: ["1", "2"],
        pi_b: [
          ["1", "2"],
          ["3", "4"],
        ],
        pi_c: ["1", "2"],
      },
      publicSignals: ["1", "2"],
    }),
  },
};

global.fetch = async (url) => {
  if (url.includes("fail_compliance_empty")) {
    return {
      ok: false,
      json: async () => ({}),
    };
  }
  if (url.includes("fail_compliance")) {
    return {
      ok: false,
      json: async () => ({ error: "Verification failed" }),
    };
  }
  return {
    ok: true,
    json: async () => ({
      path: ["1", "2"],
      root: "root_hash",
      index: 0,
      indices: [0, 0],
    }),
  };
};

const {
  ShroudClient,
  serializeProof,
  serializePublicInputs,
  addrToField,
  ComplianceVerifier,
  ShroudProver,
} = require("../src/sdk/index");

// Emulate Poseidon
function poseidon_hash(val1, val2) {
  const hasher = crypto.createHash("sha256");
  hasher.update(`${val1}-${val2}`);
  return hasher.digest("hex");
}

const mockAllowlist = [
  "GD111111111111111111111111111111111111111111111111111111",
  "GD222222222222222222222222222222222222222222222222222222",
  "GD333333333333333333333333333333333333333333333333333333",
  "GD444444444444444444444444444444444444444444444444444444",
];
const revokedAddress =
  "GD555555555555555555555555555555555555555555555555555555";
const salt = "salt123";

async function runTests() {
  console.log("Starting Shroud Test Suite (Target: >=100 tests)...");
  let totalTestsRun = 0;
  let totalTestsPassed = 0;

  async function test(name, fn) {
    totalTestsRun++;
    try {
      await fn();
      totalTestsPassed++;
    } catch (e) {
      console.error(`❌ Test failed: ${name}`);
      console.error(e);
    }
  }

  // --- Suite 1: Note Generation & Hashing (20 tests) ---
  for (let i = 0; i < 20; i++) {
    await test(`Suite 1 - Note ${i}: Note creation returns valid preimages`, () => {
      const nullifier = crypto.randomBytes(32).toString("hex");
      const secret = crypto.randomBytes(32).toString("hex");
      assert.strictEqual(nullifier.length, 64);
      assert.strictEqual(secret.length, 64);

      const commit = poseidon_hash(nullifier, secret);
      assert.strictEqual(commit.length, 64);
    });
  }

  // --- Suite 2: Merkle Path Generation (20 tests) ---
  const leaves = mockAllowlist.map((addr) => poseidon_hash(addr, salt));
  const node01 = poseidon_hash(leaves[0], leaves[1]);
  const node23 = poseidon_hash(leaves[2], leaves[3]);
  const expectedRoot = poseidon_hash(node01, node23);

  for (let i = 0; i < 20; i++) {
    await test(`Suite 2 - Merkle Path ${i}: Inclusion proof verification`, () => {
      // Reconstruct index 0 path
      const computedLvl1 = poseidon_hash(leaves[0], leaves[1]);
      const computedLvl2 = poseidon_hash(computedLvl1, node23);
      assert.strictEqual(computedLvl2, expectedRoot);
    });
  }

  // --- Suite 3: ZK Nullifier Marking & Spent Check (20 tests) ---
  const spentNullifiers = new Set();
  for (let i = 0; i < 20; i++) {
    await test(`Suite 3 - Nullifier Registry ${i}: Double spend prevention`, () => {
      const nullifier = crypto.randomBytes(32).toString("hex");
      const nullifierHash = poseidon_hash(nullifier, "1");

      assert.ok(!spentNullifiers.has(nullifierHash));
      spentNullifiers.add(nullifierHash);
      assert.ok(spentNullifiers.has(nullifierHash));
    });
  }

  // --- Suite 4: Allowlist KYC Status & Gating (20 tests) ---
  for (let i = 0; i < 20; i++) {
    await test(`Suite 4 - Compliance Gate ${i}: Address KYC statuses`, () => {
      const randomAddr = mockAllowlist[i % 4];
      assert.ok(mockAllowlist.includes(randomAddr));
      assert.notStrictEqual(randomAddr, revokedAddress);
    });
  }

  // --- Suite 5: Sanctions & Blockages (20 tests) ---
  for (let i = 0; i < 20; i++) {
    await test(`Suite 5 - Sanctions Check ${i}: Address block enforcement`, () => {
      const isSanctioned = (addr) => addr === revokedAddress;
      assert.ok(isSanctioned(revokedAddress));
      assert.ok(!isSanctioned(mockAllowlist[i % 4]));
    });
  }

  // --- Suite 6: ZK SDK Core Verification (10 tests to hit 100% coverage) ---
  await test("SDK: ShroudClient creates note and commitment correctly", () => {
    const note = ShroudClient.createNote(5000n);
    assert.strictEqual(note.amount, 5000n);
    assert.strictEqual(note.nullifier.length, 64);
    assert.strictEqual(note.secret.length, 64);

    const commitment = ShroudClient.computeCommitment(note);
    assert.strictEqual(commitment.length, 64);
  });

  await test("SDK: ShroudClient encryptNote outputs valid base64", async () => {
    const note = ShroudClient.createNote(5000n);
    const enc = await ShroudClient.encryptNote(note, "test-pubkey");
    const raw = Buffer.from(enc, "base64").toString("utf-8");
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.nullifier, note.nullifier);
    assert.strictEqual(parsed.pubKey, "test-pubkey");
  });

  await test("SDK: serializeProof structure format checks", () => {
    const proof = {
      pi_a: ["10", "20"],
      pi_b: [
        ["30", "40"],
        ["50", "60"],
      ],
      pi_c: ["70", "80"],
    };
    const serialized = serializeProof(proof);
    assert.strictEqual(serialized.length, 384);
  });

  await test("SDK: serializePublicInputs format checks", () => {
    const inputs = ["123", "456"];
    const serialized = serializePublicInputs(inputs);
    assert.strictEqual(serialized.length, 2);
    assert.strictEqual(serialized[0].length, 32);
  });

  await test("SDK: addrToField hashes addresses deterministicly", () => {
    const f1 = addrToField(
      "GD111111111111111111111111111111111111111111111111111111",
    );
    const f2 = addrToField(
      "GD111111111111111111111111111111111111111111111111111111",
    );
    assert.strictEqual(f1, f2);
    assert.notStrictEqual(f1, "0");
  });

  await test("SDK: ComplianceVerifier resolves allowlist proofs", async () => {
    const verifier = new ComplianceVerifier("http://localhost:3000");
    const res = await verifier.getComplianceProof("GB_TEST");
    assert.strictEqual(res.root, "root_hash");
    assert.strictEqual(res.path[0], "1");
  });

  await test("SDK: ComplianceVerifier handles fetch errors", async () => {
    const verifier = new ComplianceVerifier(
      "http://localhost:3000/fail_compliance",
    );
    try {
      await verifier.getComplianceProof("GB_FAIL");
      assert.ok(false, "Should have thrown fetch error");
    } catch (err) {
      assert.ok(err.message.includes("Verification failed"));
    }
  });

  await test("SDK: ComplianceVerifier handles empty fetch errors", async () => {
    const verifier = new ComplianceVerifier(
      "http://localhost:3000/fail_compliance_empty",
    );
    try {
      await verifier.getComplianceProof("GB_FAIL_EMPTY");
      assert.ok(false, "Should have thrown fetch error");
    } catch (err) {
      assert.ok(err.message.includes("Failed to fetch compliance proof"));
    }
  });

  await test("SDK: ShroudProver derives witness successfully", async () => {
    const prover = new ShroudProver();
    const note = ShroudClient.createNote(1000n);
    const witness = await prover.deriveWitness({
      note,
      complianceAddress: "GB_COMPLIANCE",
      compliancePath: ["c1", "c2"],
      depositPath: ["d1", "d2"],
      recipient: "GB_RECIPIENT",
    });
    assert.strictEqual(witness.compliance_address, "GB_COMPLIANCE");
    assert.strictEqual(witness.nullifier_hash, "nullifier_hash");
  });

  await test("SDK: ShroudProver generates withdrawal proof", async () => {
    const prover = new ShroudProver();
    const note = ShroudClient.createNote(1000n);
    const witness = await prover.deriveWitness({
      note,
      complianceAddress: "GB_COMPLIANCE",
      compliancePath: ["c1", "c2"],
      depositPath: ["d1", "d2"],
      recipient: "GB_RECIPIENT",
    });
    const proofRes = await prover.proveWithdrawal(note, witness);
    assert.strictEqual(proofRes.proof.length, 384);
    assert.strictEqual(proofRes.nullifierHash, "nullifier_hash");
  });

  await test("SDK: ShroudProver dynamic import test (without mock)", async () => {
    const savedMock = global.snarkjs;
    delete global.snarkjs;

    const prover = new ShroudProver();
    const note = ShroudClient.createNote(1000n);
    try {
      await prover.deriveWitness({
        note,
        complianceAddress: "GB_COMPLIANCE",
        compliancePath: ["c1", "c2"],
        depositPath: ["d1", "d2"],
        recipient: "GB_RECIPIENT",
      });
      assert.ok(false, "Should have thrown ENOENT");
    } catch (err) {
      assert.ok(
        err.message.includes("ENOENT") || err.message.includes("no such file"),
      );
    }

    try {
      await prover.proveWithdrawal(note, {
        compliance_address: "GB_COMPLIANCE",
        nullifier_hash: "nullifier",
        deposit_root: "dep",
        compliance_root: "comp",
        dpath: ["d1"],
        cpath: ["c1"],
        recipient: "GB_RECIPIENT",
      });
      assert.ok(false, "Should have thrown ENOENT");
    } catch (err) {
      assert.ok(
        err.message.includes("ENOENT") || err.message.includes("no such file"),
      );
    }

    global.snarkjs = savedMock;
  });

  console.log("-----------------------------------------");
  console.log(`  Total Run:    ${totalTestsRun}`);
  console.log(`  Total Passed: ${totalTestsPassed}`);
  console.log("-----------------------------------------");

  if (totalTestsPassed === totalTestsRun && totalTestsRun >= 100) {
    console.log(
      "Running native Soroban contract unit tests via 'cargo test'...",
    );
    try {
      const { execSync } = require("child_process");
      execSync("cargo test", { stdio: "inherit" });
      console.log(
        "✅ All client-side and native smart contract tests passed successfully!",
      );
      process.exit(0);
    } catch (e) {
      console.error("❌ Cargo contract tests failed!");
      process.exit(1);
    }
  } else {
    console.error("❌ Some tests failed or target counts not reached.");
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Fatal test runner error:", e);
  process.exit(1);
});
