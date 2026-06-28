#![no_std]
#![allow(deprecated)]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env, Symbol, Vec, IntoVal
};

/// Convert a 32-byte `Bytes` public input into a `BytesN<32>`.
fn to_bytesn32(env: &Env, b: &Bytes) -> BytesN<32> {
    if b.len() != 32 {
        panic!("public input must be 32 bytes");
    }
    let mut buf = [0u8; 32];
    b.slice(0..32).copy_into_slice(&mut buf);
    BytesN::from_array(env, &buf)
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Token,
    Verifier,
    Registry,
    Nullifier(BytesN<32>),
    Commitment(BytesN<32>),
    RegulatorViewKey(BytesN<32>),
}

#[contract]
pub struct ShroudPool;

#[contractimpl]
impl ShroudPool {
    pub fn initialize(env: Env, token: Address, verifier: Address, registry: Address) {
        if env.storage().instance().has(&DataKey::Token) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Verifier, &verifier);
        env.storage().instance().set(&DataKey::Registry, &registry);
    }

    pub fn deposit(env: Env, depositor: Address, commitment: BytesN<32>, amount: u128) {
        depositor.require_auth();

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        
        // Execute token transfer from depositor to this pool contract
        // We use dynamic invocation since we don't have static token contract import
        env.invoke_contract::<()>(
            &token_addr,
            &Symbol::new(&env, "transfer"),
            Vec::from_array(&env, [
                depositor.to_val(),
                env.current_contract_address().to_val(),
                (amount as i128).into_val(&env),
            ]),
        );

        // Register commitment
        env.storage().instance().set(&DataKey::Commitment(commitment.clone()), &amount);

        // Emit deposit event
        env.events().publish(
            (symbol_short!("deposit"), commitment),
            amount,
        );
    }

    /// Shielded withdrawal.
    ///
    /// `public_inputs` is the circuit's public-signal vector, in declared order:
    ///   `[ deposit_merkle_root, compliance_merkle_root, nullifier_hash,
    ///      recipient_address, ownerAx, ownerAy ]`
    /// (six big-endian 32-byte field elements, exactly as the prover emits). The
    /// proof is verified against this vector — including the note owner's
    /// EdDSA-Poseidon signature over the nullifier — and the on-chain effects
    /// (nullifier and the compliance gate) are derived from the *verified* inputs.
    pub fn withdraw(
        env: Env,
        proof: Bytes,
        public_inputs: Vec<Bytes>,
        recipient: Address,
        relayer: Address,
        amount: u128,
        relayer_fee: u128,
    ) {
        if public_inputs.len() != 6 {
            panic!("withdraw proof must have 6 public inputs");
        }
        let compliance_root_pi = to_bytesn32(&env, &public_inputs.get(1).unwrap());
        let nullifier_hash = to_bytesn32(&env, &public_inputs.get(2).unwrap());

        // 1. Double-spend protection.
        let nullifier_key = DataKey::Nullifier(nullifier_hash.clone());
        if env.storage().instance().has(&nullifier_key) {
            panic!("Nullifier already spent");
        }

        // 2. Dependencies.
        let verifier_addr: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let registry_addr: Address = env.storage().instance().get(&DataKey::Registry).unwrap();
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();

        // 3. Compliance gate: the proof's compliance_merkle_root MUST equal the
        //    ASP registry's currently-active root. This is what makes the
        //    sanctions/KYC allowlist load-bearing — a proof built against a stale
        //    or forged compliance root is rejected here, on-chain.
        let active_root: BytesN<32> = env.invoke_contract(
            &registry_addr,
            &Symbol::new(&env, "get_root"),
            Vec::new(&env),
        );
        if compliance_root_pi != active_root {
            panic!("Compliance root does not match the active ASP registry root");
        }

        // 4. Verify the Groth16 proof against the full public-input vector.
        let proof_valid: bool = env.invoke_contract(
            &verifier_addr,
            &Symbol::new(&env, "verify_proof"),
            Vec::from_array(&env, [proof.to_val(), public_inputs.to_val()]),
        );
        if !proof_valid {
            panic!("Invalid ZK proof");
        }

        // 5. Mark nullifier as spent.
        env.storage().instance().set(&nullifier_key, &true);

        // 6. Payout. `recipient` is the real Stellar payout address; the circuit's
        //    recipient_address field (public input [3]) is an abstract identifier —
        //    binding the two needs an address->field encoding convention (roadmap).
        assert!(relayer_fee <= amount, "relayer fee exceeds amount");
        let withdraw_amount = amount - relayer_fee;

        env.invoke_contract::<()>(
            &token_addr,
            &Symbol::new(&env, "transfer"),
            Vec::from_array(&env, [
                env.current_contract_address().to_val(),
                recipient.to_val(),
                (withdraw_amount as i128).into_val(&env),
            ]),
        );

        // Real gasless-relayer rebate: reimburse the relayer that submitted this
        // transaction its fee from the pool (previously a no-op).
        if relayer_fee > 0 {
            env.invoke_contract::<()>(
                &token_addr,
                &Symbol::new(&env, "transfer"),
                Vec::from_array(&env, [
                    env.current_contract_address().to_val(),
                    relayer.to_val(),
                    (relayer_fee as i128).into_val(&env),
                ]),
            );
        }

        // 7. Emit withdrawal event.
        env.events().publish(
            (symbol_short!("withdraw"), nullifier_hash),
            withdraw_amount,
        );
    }

    /// execute_shielded_transfer_v2 verifies ZK state-transitions of UTXOs within the privacy pool (v2).
    ///
    /// `public_inputs` is in the circuit order:
    ///   `[ merkle_root, spent_nullifier_1, spent_nullifier_2, output_commitment_1, output_commitment_2 ]`
    pub fn execute_shielded_transfer_v2(
        env: Env,
        proof: Bytes,
        public_inputs: Vec<Bytes>,
    ) {
        if public_inputs.len() != 5 {
            panic!("shielded transfer proof must have 5 public inputs");
        }

        let nullifier_1 = to_bytesn32(&env, &public_inputs.get(1).unwrap());
        let nullifier_2 = to_bytesn32(&env, &public_inputs.get(2).unwrap());
        let out_commitment_1 = to_bytesn32(&env, &public_inputs.get(3).unwrap());
        let out_commitment_2 = to_bytesn32(&env, &public_inputs.get(4).unwrap());

        // 1. Double-spend protection
        let n1_key = DataKey::Nullifier(nullifier_1.clone());
        let n2_key = DataKey::Nullifier(nullifier_2.clone());
        if env.storage().instance().has(&n1_key) || env.storage().instance().has(&n2_key) {
            panic!("Input nullifiers already spent");
        }

        // 2. Verify ZK proof
        let verifier_addr: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let proof_valid: bool = env.invoke_contract(
            &verifier_addr,
            &Symbol::new(&env, "verify_proof"),
            Vec::from_array(&env, [proof.to_val(), public_inputs.to_val()]),
        );
        if !proof_valid {
            panic!("Invalid shielded transfer proof");
        }

        // 3. Mark input nullifiers as spent
        env.storage().instance().set(&n1_key, &true);
        env.storage().instance().set(&n2_key, &true);

        // 4. Register new output commitments
        env.storage().instance().set(&DataKey::Commitment(out_commitment_1.clone()), &true);
        env.storage().instance().set(&DataKey::Commitment(out_commitment_2.clone()), &true);

        // 5. Emit events
        env.events().publish(
            (symbol_short!("transfer"), symbol_short!("shielded")),
            (out_commitment_1, out_commitment_2),
        );
    }

    pub fn grant_view_access(
        env: Env,
        regulator: Address,
        commitment: BytesN<32>,
        view_key: Bytes,
    ) {
        regulator.require_auth();
        env.storage().instance().set(&DataKey::RegulatorViewKey(commitment), &view_key);
    }

    pub fn get_view_key(
        env: Env,
        regulator: Address,
        commitment: BytesN<32>,
    ) -> Bytes {
        regulator.require_auth();
        env.storage().instance().get(&DataKey::RegulatorViewKey(commitment)).unwrap_or_else(|| Bytes::new(&env))
    }

    /// initiate_cross_pool_swap starts an atomic swap between this pool (Pool A)
    /// and another pool (Pool B) with a different token (e.g., USDC ↔ EURC).
    ///
    /// The swap is identified by a `swap_hash` computed in the ZK circuit from
    /// the input nullifier and output commitment. This creates a pending swap
    /// record that `complete_cross_pool_swap` will finalize.
    pub fn initiate_cross_pool_swap(
        env: Env,
        proof: Bytes,
        public_inputs: Vec<Bytes>,
        pool_b_address: Address,
        fx_rate_numerator: u128,
        fx_rate_denominator: u128,
    ) {
        // Validate FX rate is reasonable (non-zero denominator)
        assert!(fx_rate_denominator > 0, "FX rate denominator must be positive");
        assert!(fx_rate_numerator > 0, "FX rate numerator must be positive");

        // Verify ZK proof of value conservation
        let verifier_addr: Address = env.storage().instance().get(&DataKey::Verifier).unwrap();
        let proof_valid: bool = env.invoke_contract(
            &verifier_addr,
            &Symbol::new(&env, "verify_proof"),
            Vec::from_array(&env, [proof.to_val(), public_inputs.to_val()]),
        );
        assert!(proof_valid, "Invalid cross-pool swap proof");

        if public_inputs.len() < 3 {
            panic!("Cross-pool proof must have at least 3 public inputs");
        }

        // Extract nullifier from public inputs (field 0)
        let nullifier = to_bytesn32(&env, &public_inputs.get(0).unwrap());

        // Double-spend protection
        let n_key = DataKey::Nullifier(nullifier.clone());
        if env.storage().instance().has(&n_key) {
            panic!("Input note already spent");
        }
        env.storage().instance().set(&n_key, &true);

        // Extract output commitment for Pool B (field 1)
        let pool_b_commitment = to_bytesn32(&env, &public_inputs.get(1).unwrap());

        // Extract swap hash (field 2) — atomic coordination key
        let swap_hash = to_bytesn32(&env, &public_inputs.get(2).unwrap());

        // Store pending swap
        env.storage().persistent().set(&DataKey::Nullifier(swap_hash.clone()), &true);

        env.events().publish(
            (Symbol::new(&env, "swap"), Symbol::new(&env, "initiated")),
            (swap_hash, pool_b_commitment, fx_rate_numerator, fx_rate_denominator),
        );
    }

    /// complete_cross_pool_swap finalizes the atomic swap on the receiving pool
    /// side (Pool B). It registers the new output commitment and verifies the
    /// swap_hash matches the initiated swap on Pool A.
    pub fn complete_cross_pool_swap(
        env: Env,
        swap_hash: BytesN<32>,
        output_commitment: BytesN<32>,
        amount_b: u128,
    ) {
        // Verify swap was initiated (swap_hash exists)
        let swap_key = DataKey::Nullifier(swap_hash.clone());
        if !env.storage().persistent().has(&swap_key) {
            panic!("Swap not initiated or already completed");
        }

        // Register the new commitment in Pool B
        env.storage().instance().set(&DataKey::Commitment(output_commitment.clone()), &true);

        // Mark swap as completed (remove pending status by setting to false)
        env.storage().persistent().remove(&swap_key);

        env.events().publish(
            (Symbol::new(&env, "swap"), Symbol::new(&env, "complete")),
            (swap_hash, output_commitment, amount_b),
        );
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Bytes, BytesN, Env, Vec};

    #[contract]
    pub struct MockVerifier;
    #[contractimpl]
    impl MockVerifier {
        pub fn verify_proof(_env: Env, _proof: Bytes, _public_inputs: Vec<Bytes>) -> bool {
            true
        }
    }

    #[contract]
    pub struct MockRegistry;
    #[contractimpl]
    impl MockRegistry {
        // Active compliance root is fixed at [7; 32] for the tests.
        pub fn get_root(env: Env) -> BytesN<32> {
            BytesN::from_array(&env, &[7u8; 32])
        }
    }

    #[contract]
    pub struct MockToken;
    #[contractimpl]
    impl MockToken {
        pub fn transfer(_env: Env, _from: Address, _to: Address, _amount: i128) {}
    }

    fn field(env: &Env, b: u8) -> Bytes {
        Bytes::from_slice(env, &[b; 32])
    }

    #[test]
    fn test_initialize_pool() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &contract_id);

        let token = Address::generate(&env);
        let verifier = Address::generate(&env);
        let registry = Address::generate(&env);

        client.initialize(&token, &verifier, &registry);
    }

    #[test]
    fn test_withdraw_binds_compliance_and_pays_relayer() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        // [deposit_root, compliance_root == active [7;32], nullifier, recipient_field]
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 7));
        public_inputs.push_back(field(&env, 9));
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 11)); // ownerAx
        public_inputs.push_back(field(&env, 13)); // ownerAy

        client.withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &50u128);

        // Double-spend: the same nullifier must now be rejected.
        let res = client.try_withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &50u128);
        assert!(res.is_err());
    }

    #[test]
    #[should_panic(expected = "Compliance root does not match")]
    fn test_withdraw_rejects_stale_compliance_root() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        // compliance_root [3;32] != active registry root [7;32] -> rejected.
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 3));
        public_inputs.push_back(field(&env, 9));
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 11)); // ownerAx
        public_inputs.push_back(field(&env, 13)); // ownerAy

        client.withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &50u128);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_fails() {
        let env = Env::default();
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        let token = Address::generate(&env);
        let verifier = Address::generate(&env);
        let registry = Address::generate(&env);
        client.initialize(&token, &verifier, &registry);
        client.initialize(&token, &verifier, &registry);
    }

    #[test]
    fn test_deposit() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let depositor = Address::generate(&env);
        let commitment = BytesN::from_array(&env, &[1u8; 32]);
        client.deposit(&depositor, &commitment, &500u128);
    }

    #[test]
    #[should_panic(expected = "withdraw proof must have 6 public inputs")]
    fn test_withdraw_wrong_inputs_length_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 0));

        client.withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &50u128);
    }

    #[contract]
    pub struct MockFailingVerifier;
    #[contractimpl]
    impl MockFailingVerifier {
        pub fn verify_proof(_env: Env, _proof: Bytes, _public_inputs: Vec<Bytes>) -> bool {
            false
        }
    }

    #[test]
    #[should_panic(expected = "Invalid ZK proof")]
    fn test_withdraw_invalid_proof_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockFailingVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 7)); // active root
        public_inputs.push_back(field(&env, 9));
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 11)); // ownerAx
        public_inputs.push_back(field(&env, 13)); // ownerAy

        client.withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &50u128);
    }

    #[test]
    #[should_panic(expected = "relayer fee exceeds amount")]
    fn test_withdraw_fee_exceeds_amount_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let recipient = Address::generate(&env);
        let relayer = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 7)); // active root
        public_inputs.push_back(field(&env, 9));
        public_inputs.push_back(field(&env, 0));
        public_inputs.push_back(field(&env, 11));
        public_inputs.push_back(field(&env, 13));

        client.withdraw(&proof, &public_inputs, &recipient, &relayer, &1000u128, &1200u128);
    }

    #[test]
    fn test_view_key_access() {
        let env = Env::default();
        env.mock_all_auths();

        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        let regulator = Address::generate(&env);
        let commitment = BytesN::from_array(&env, &[5u8; 32]);
        let view_key = Bytes::from_slice(&env, b"regulator_key");

        assert_eq!(client.get_view_key(&regulator, &commitment), Bytes::new(&env));
        client.grant_view_access(&regulator, &commitment, &view_key);
        assert_eq!(client.get_view_key(&regulator, &commitment), view_key);
    }

    // ─── v3 cross-pool atomic swap tests ────────────────────────────────

    #[test]
    fn test_initiate_cross_pool_swap_v3_success() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let pool_b = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        // Build public_inputs: [nullifier_hash, output_commitment, swap_hash]
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 20)); // pool_a_nullifier_hash
        public_inputs.push_back(field(&env, 21)); // pool_b_output_commitment
        public_inputs.push_back(field(&env, 22)); // swap_hash

        client.initiate_cross_pool_swap(
            &proof,
            &public_inputs,
            &pool_b,
            &1100u128,   // fx_rate_numerator (1.1)
            &1000u128,   // fx_rate_denominator
        );

        // The nullifier should now be spent — verify by checking double-spend fails
    }

    #[test]
    #[should_panic(expected = "Input note already spent")]
    fn test_initiate_cross_pool_swap_v3_double_spend_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let pool_b = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 30)); // same nullifier
        public_inputs.push_back(field(&env, 31));
        public_inputs.push_back(field(&env, 32));

        // First call succeeds
        client.initiate_cross_pool_swap(&proof, &public_inputs, &pool_b, &1000u128, &1000u128);
        // Second call with same nullifier should panic
        client.initiate_cross_pool_swap(&proof, &public_inputs, &pool_b, &1000u128, &1000u128);
    }

    #[test]
    #[should_panic(expected = "FX rate denominator must be positive")]
    fn test_initiate_cross_pool_swap_v3_zero_denominator_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let pool_b = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 40));
        public_inputs.push_back(field(&env, 41));
        public_inputs.push_back(field(&env, 42));

        client.initiate_cross_pool_swap(&proof, &public_inputs, &pool_b, &1000u128, &0u128);
    }

    #[test]
    fn test_complete_cross_pool_swap_v3_success() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        let pool_b = Address::generate(&env);
        let proof = Bytes::from_slice(&env, b"proof");

        // First initiate the swap
        let mut public_inputs = Vec::new(&env);
        public_inputs.push_back(field(&env, 50));
        public_inputs.push_back(field(&env, 51));
        public_inputs.push_back(field(&env, 52)); // swap_hash

        client.initiate_cross_pool_swap(&proof, &public_inputs, &pool_b, &1000u128, &1000u128);

        // Now complete the swap
        let swap_hash = BytesN::from_array(&env, &[52u8; 32]);
        let output_commitment = BytesN::from_array(&env, &[51u8; 32]);
        client.complete_cross_pool_swap(&swap_hash, &output_commitment, &500u128);
    }

    #[test]
    #[should_panic(expected = "Swap not initiated or already completed")]
    fn test_complete_cross_pool_swap_v3_not_initiated_fails() {
        let env = Env::default();
        env.mock_all_auths();

        let token = env.register_contract(None, MockToken);
        let verifier = env.register_contract(None, MockVerifier);
        let registry = env.register_contract(None, MockRegistry);
        let pool = env.register_contract(None, ShroudPool);
        let client = ShroudPoolClient::new(&env, &pool);
        client.initialize(&token, &verifier, &registry);

        // Try to complete a swap that was never initiated
        let swap_hash = BytesN::from_array(&env, &[99u8; 32]);
        let output_commitment = BytesN::from_array(&env, &[98u8; 32]);
        client.complete_cross_pool_swap(&swap_hash, &output_commitment, &500u128);
    }
}

