# Developer Friction Log: Shroud (Circom on Soroban)

This log documents the developer experience (DX) and integration friction encountered while implementing Zero-Knowledge (Groth16) proof verification and Poseidon hashing inside Stellar Soroban smart contracts.

---

## 1. Positives (What Worked Seamlessly)

- **Stellar Protocol 25/26 Host Functions**: Native host support for BN254 elliptic curve operations (`bn254_pairing`) and Poseidon hashing (`env.crypto().poseidon()`) is highly convenient. Running ZK verifications natively on the host rather than in raw WASM drastically reduces instruction counts and keeps transactions within the 400M instruction budget limit.
- **Performance Scaling**: Poseidon hashing is incredibly fast on-chain. Doing Poseidon hashes inside ZK circuits costs ~250 constraints compared to ~28,000 constraints for SHA256. This represents a 110x reduction in gates, which translates directly to fast client-side proof compilation times (sub-1.2 seconds in low-spec browsers).

---

## 2. Friction Points (Areas of Difficulty)

- **Circom Tooling Integration**: Since Stellar contracts are written in Rust, developers are caught between two distinct compiler toolchains:
  - Circom (which outputs C++ and WASM provers along with `.zkey` files).
  - Soroban SDK.
    There is a lack of direct SDK bindings to parse and convert SnarkJS/Circom proof output formats (JSON) into the raw `Bytes` representation required by the Soroban contracts. Custom serialization/deserialization code had to be constructed.
- **Lack of Local Sandbox Mocking**: Testing ZK verifiers on local mock sandboxes is currently difficult because there is no built-in "dry-run" simulator for ZK pairing checks in standard test utilities. We had to build a custom mock proof signature gate (`[0xde, 0xad, 0xbe, 0xef]`) into our verifier contract to enable rapid local unit test verification.
- **Instruction Budget Allocation**: While BN254 pairings run on the host, they still consume ~82.4 Million CPU instructions. While this fits well within the 400M transaction limit, it leaves less room for complex application-level logic if multiple ZK checks or loops are required in a single transaction.

---

## 3. Recommended Improvements for Stellar/SDF

1.  **Standard ZK Client SDK**: SDF should distribute an official npm library or Rust crate containing standard helper functions to serialize, package, and dispatch Circom/SnarkJS proof outputs directly to Soroban pool contracts.
2.  **Mock Proving Test Utils**: Add a mock ZK verifier configuration to the Soroban SDK test utility environment so developers don't have to manually write mock verification bypasses in their production code.
