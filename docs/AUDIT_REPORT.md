# Security & Audit Report: Shroud

This report details the protocol invariants, potential threat vectors, and mitigation strategies for **Shroud**, the Compliant Privacy Pool with ASP Gateway on Stellar.

---

## 1. Core Protocol Invariants

### 1.1. Solvency Invariant

The pool contract's token balance must always equal the sum of unspent commitments:
$$\text{Pool USDC Balance} = \sum \text{USDC}(\text{Unspent commitments})$$

- **Audit Check**: The `deposit()` function locks tokens inside the pool contract before creating a commitment leaf. The `withdraw()` function releases USDC only when a valid, unspent nullifier is registered. No methods exist to withdraw USDC from the pool without registering a nullifier or validating the ZK proof.

### 1.2. Double-Spend Invariant

A nullifier hash can never be processed twice:
$$\forall \text{tx}, \text{verify}(\text{nullifier\_hash}) \implies \text{Set}(\text{Nullifiers}[\text{nullifier\_hash}] = \text{true})$$

- **Audit Check**: The `withdraw()` function queries the spent nullifiers map in instance storage. If the nullifier exists, the contract reverts the transaction immediately. The spent nullifier is set to `true` on-chain in the same transaction execution context before releasing any USDC, preventing re-entrancy exploits.

---

## 2. Threat Vector Analysis & Mitigation

### 2.1. ASP Key Leakage / Collusion

- **Threat**: If the private key of the Association Set Provider (ASP) admin is compromised, the attacker can rotate the `compliance_merkle_root` on-chain to insert sanctioned/revoked wallets, allowing them to route illegal funds through the privacy pool.
- **Mitigation**: The update function `ASPRegistry.set_root()` is gated by administrative require_auth checks. Production deployments must transition this admin role to a multi-sig contract managed by a validator committee or decentralized compliance oracle network (e.g., Chainlink / Band Protocol).

### 2.2. Tree Root Timing Lag

- **Threat**: A user generates their ZK withdrawal proof using the active `asp_merkle_root` fetched from the compliance server. If the ASP rotates the root right before the user's transaction is executed on-chain, the verifier contract will reject the proof, causing the transaction to revert and wasting relayer gas.
- **Mitigation**: The verifier contract can store a history of the last 10 valid compliance roots. When checking a proof, it validates it against the active root or any of the historical roots within the last 1 hour, allowing users to withdraw successfully even during high root rotation frequency.

### 2.3. Front-Running Hijacking

- **Threat**: When a withdrawer submits their ZK proof and nullifier hash to a public relayer network, a front-running bot can intercept the transaction, extract the proof, and submit a new transaction replacing the recipient wallet with their own.
- **Mitigation**: The withdrawer binds the `recipient_address` directly as a public input within the ZK proof. The verifier contract asserts that the recipient of the USDC matches the recipient bound inside the public inputs. Any mismatch causes the Groth16 pairing check to fail.
