# Shroud Association Set Provider (ASP) Registry Contract 👤

The compliance registry contract for Shroud privacy pools on Stellar Soroban. This contract manages the Merkle root of the validated, clean Association Set (representing clean KYC-compliant depositors).

## Architecture & Design

- **Language**: Rust
- **Platform**: Soroban (Stellar Smart Contracts)
- **Toolchain**: Target `wasm32-unknown-unknown` (under workspace root).

## API Endpoints

### `initialize(env: Env, admin: Address)`

Initializes the contract by setting the administrator address. Prevents re-initialization.

### `set_root(env: Env, new_root: BytesN<32>)`

Updates the verified Merkle root of the Association Set. Restricted to the contract administrator.

### `get_root(env: Env) -> BytesN<32>`

Returns the current active Merkle root of the Association Set. Falls back to a zero-filled array if not set.

## Unit Testing

Run contract unit tests from the workspace root or the contract directory:

```bash
cargo test -p asp_registry
```
