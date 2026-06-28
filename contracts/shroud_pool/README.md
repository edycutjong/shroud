# Shroud Pool Contract 👤

The main privacy pool contract for Shroud compliance-gated privacy pools on Stellar Soroban. This contract processes confidential deposits and withdrawals of USDC token assets, verifying zero-knowledge membership proofs against an Association Set Provider (ASP) compliance registry.

## Architecture & Design

- **Language**: Rust
- **Platform**: Soroban (Stellar Smart Contracts)
- **Toolchain**: Target `wasm32-unknown-unknown` (under workspace root).

## API Endpoints

### `initialize(env: Env, token: Address, verifier: Address, registry: Address)`

Initializes the contract by mapping the USDC stablecoin token address, the `Groth16Verifier` contract address, and the `ASPRegistry` contract address. Prevents re-initialization.

### `deposit(env: Env, depositor: Address, commitment: BytesN<32>, amount: u128)`

Accepts deposits by transferring USDC from the caller into the contract escrow and registering a cryptographic commitment representing the user's note.

### `withdraw(env, proof, public_inputs, recipient, relayer, fee, regulator_encrypted_key, tx_hash)`

Allows a user to withdraw funds to a fresh, clean address by submitting a Groth16 zero-knowledge proof.
The public inputs verify:

1. The note nullifier.
2. The Merkle root of the Association Set.
3. The withdrawal amount and recipient details.
   Checks that the Merkle root is valid according to the compliance registry, checks that the nullifier is unspent, verifies the proof, and transfers the withdrawal amount to the recipient (paying the relayer fee if applicable).

### `get_regulator_key(env: Env, tx_hash: BytesN<32>) -> Option<Bytes>`

Retrieves the ECIES-encrypted view key associated with the transaction for selective regulator auditing.

### `is_spent(env: Env, nullifier: BytesN<32>) -> bool`

Returns `true` if the given nullifier has already been spent.

## Unit Testing

Run contract unit tests from the workspace root or the contract directory:

```bash
cargo test -p shroud_pool
```
