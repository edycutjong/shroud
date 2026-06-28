# Shroud Groth16 Verifier Contract 👤

A zero-knowledge proof verification contract optimized for the BN254 pairing curve, built for Stellar Soroban. This contract processes cryptographic zk-SNARK verification checks for note ownership and compliance verification for the Shroud Pool.

## Architecture & Design

- **Language**: Rust
- **Platform**: Soroban (Stellar Smart Contracts)
- **Toolchain**: Target `wasm32-unknown-unknown` (under workspace root).

## API Endpoints

### `initialize(env, alpha, beta, gamma, delta, ic)`

Stores the parameters of the Groth16 verification key (VK) in contract instance storage:

- `alpha`: 64-byte G1 point.
- `beta`: 128-byte G2 point.
- `gamma`: 128-byte G2 point.
- `delta`: 128-byte G2 point.
- `ic`: A vector of 64-byte G1 points (length = public inputs + 1).

### `verify_proof(env, proof, public_inputs) -> bool`

Performs an on-chain pairing verification of the provided 256-byte Groth16 proof (comprising G1 element A, G2 element B, and G1 element C) against the stored verification key and public inputs. Returns `true` if valid, `false` otherwise.

## Unit Testing

Run contract unit tests from the workspace root or the contract directory:

```bash
cargo test -p groth16_verifier
```
