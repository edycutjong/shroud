# Shroud ZK Privacy Pool Circuits 👤

This directory contains the Zero-Knowledge (ZK) compliance and privacy circuits for **Shroud**, built using **Circom**. The circuits prove deposit ownership and compliance membership without revealing the depositor's note parameters or wallet address on-chain.

## Circuit Specifications

- **Language:** Circom `2.1.6`
- **Proof System:** Groth16 (compiled with snarkjs and Barretenberg/Noir compatible constraints)
- **Hash Primitive:** Poseidon (for arithmetically efficient hashing over BN254/BabyJubjub fields)
- **Merkle Tree Depth:** 2 (for both deposit and compliance trees)

## Circuits Overview

### 1. `withdraw.circom` (`ShroudWithdraw`)

Proves that a user owns a valid commitment in the deposit tree, and is listed in the compliance (KYC) allowlist, while preventing double-spending and front-running:

- **Commitment Verification:** Proves that the private note commitment ($C = \text{Poseidon}(nullifier, secret)$) matches.
- **Nullifier Correctness:** Proves that the public $nullifier\_hash = \text{Poseidon}(nullifier, 1)$ matches the private nullifier.
- **Deposit Membership:** Verifies that the commitment exists in the deposit Merkle tree root.
- **Compliance Membership:** Verifies that the user's address exists in the compliance (KYC/allowlist) Merkle tree root, proving they are compliant and non-sanctioned.
- **Recipient Binding:** Enforces a math constraint on the public `recipient_address` to prevent transaction front-running/hijacking by relayers.
- **Signature Verification:** Verifies the note owner's EdDSA-Poseidon signature over the `nullifier_hash` using their public key `(ownerAx, ownerAy)`.

#### Signal Map: `withdraw.circom`

| Parameter                    | Type     | Visibility  | Description                                    |
| ---------------------------- | -------- | ----------- | ---------------------------------------------- |
| `deposit_merkle_root`        | `signal` | **Public**  | Current root of the deposit tree               |
| `compliance_merkle_root`     | `signal` | **Public**  | Current root of the compliance tree            |
| `nullifier_hash`             | `signal` | **Public**  | Public identifier marking the note as spent    |
| `recipient_address`          | `signal` | **Public**  | Destination address for the funds              |
| `ownerAx` / `ownerAy`        | `signal` | **Public**  | Note owner's BabyJubjub public key coordinates |
| `nullifier`                  | `signal` | **Private** | Secret value mapping to the nullifier hash     |
| `secret`                     | `signal` | **Private** | Secret value mapping to the commitment         |
| `sigS` / `sigR8x` / `sigR8y` | `signal` | **Private** | EdDSA signature components                     |
| `deposit_merkle_path[2]`     | `signal` | **Private** | Merkle path elements for deposit proof         |
| `deposit_indices[2]`         | `signal` | **Private** | Routing bits for deposit Merkle tree           |
| `compliance_address`         | `signal` | **Private** | User's KYC address                             |
| `compliance_merkle_path[2]`  | `signal` | **Private** | Merkle path elements for compliance proof      |
| `compliance_indices[2]`      | `signal` | **Private** | Routing bits for compliance Merkle tree        |

---

## Development Commands

Run these commands inside the `circuits/` folder:

```bash
# Compile withdraw circuit to R1CS and WASM
circom withdraw.circom --r1cs --wasm --sym --html --output ./build

# Generate proof inputs using snarkjs
snarkjs groth16 setup build/withdraw.r1cs powersOfTau28_hez_final_12.ptau build/withdraw_0000.zkey
```

To run the full end-to-end proving and verification demo, run the following command from the project root:

```bash
npm run prove:demo
```
