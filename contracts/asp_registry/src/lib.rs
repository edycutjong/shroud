#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Root,
    // ── v3 multi-ASP federation ──
    Threshold,                       // K: attestations required to approve a root
    AspCount,                        // N: number of registered ASP operators
    Asp(Address),                    // is this address a registered ASP operator?
    Attested(BytesN<32>, Address),   // has operator attested this root? (dedupe)
    Approvals(BytesN<32>),           // count of distinct operators that attested a root
    Approved(BytesN<32>),            // has this root reached the K-of-N threshold?
}

#[contract]
pub struct ASPRegistry;

#[contractimpl]
impl ASPRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn set_root(env: Env, new_root: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Root, &new_root);
    }

    pub fn get_root(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::Root)
            .unwrap_or_else(|| BytesN::from_array(&env, &[0u8; 32]))
    }

    // ─────────────────────────── v3 multi-ASP federation ───────────────────────────
    //
    // Instead of a single admin setting the compliance root, a FEDERATION of N
    // registered ASP operators each attest a root; once K of them agree (K-of-N
    // threshold), the root is approved and adopted as the live compliance root.
    // This removes the single-operator trust assumption of `set_root`.

    /// Admin: register an ASP operator into the federation.
    pub fn register_asp(env: Env, operator: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if env.storage().persistent().get(&DataKey::Asp(operator.clone())).unwrap_or(false) {
            panic!("ASP already registered");
        }
        env.storage().persistent().set(&DataKey::Asp(operator), &true);
        let n: u32 = env.storage().instance().get(&DataKey::AspCount).unwrap_or(0);
        env.storage().instance().set(&DataKey::AspCount, &(n + 1));
    }

    /// Admin: set the approval threshold K (must be >= 1 and <= N).
    pub fn set_threshold(env: Env, k: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let n: u32 = env.storage().instance().get(&DataKey::AspCount).unwrap_or(0);
        assert!(k >= 1 && k <= n, "threshold must be in 1..=N registered ASPs");
        env.storage().instance().set(&DataKey::Threshold, &k);
    }

    /// A registered ASP operator attests a compliance root. When the number of
    /// distinct attesting operators reaches the threshold K, the root is approved
    /// and adopted as the live compliance root (`get_root`). Returns the current
    /// approval count for the root.
    pub fn attest_root(env: Env, operator: Address, root: BytesN<32>) -> u32 {
        operator.require_auth();
        if !env.storage().persistent().get(&DataKey::Asp(operator.clone())).unwrap_or(false) {
            panic!("not a registered ASP operator");
        }
        if env.storage().persistent().get(&DataKey::Attested(root.clone(), operator.clone())).unwrap_or(false) {
            panic!("operator already attested this root");
        }
        env.storage().persistent().set(&DataKey::Attested(root.clone(), operator), &true);

        let count: u32 = env.storage().persistent().get(&DataKey::Approvals(root.clone())).unwrap_or(0) + 1;
        env.storage().persistent().set(&DataKey::Approvals(root.clone()), &count);

        let k: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap_or(u32::MAX);
        if count >= k {
            env.storage().persistent().set(&DataKey::Approved(root.clone()), &true);
            // Adopt the federation-approved root as the live compliance root.
            env.storage().instance().set(&DataKey::Root, &root);
        }
        count
    }

    /// Whether a root has reached the K-of-N federation threshold.
    pub fn is_root_approved(env: Env, root: BytesN<32>) -> bool {
        env.storage().persistent().get(&DataKey::Approved(root)).unwrap_or(false)
    }

    /// Number of distinct ASP operators that have attested a root.
    pub fn approval_count(env: Env, root: BytesN<32>) -> u32 {
        env.storage().persistent().get(&DataKey::Approvals(root)).unwrap_or(0)
    }

    /// Number of registered ASP operators (N).
    pub fn asp_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::AspCount).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{Env, Address, BytesN};
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn test_initialize_and_set_root() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);

        let admin = Address::generate(&env);
        client.initialize(&admin);

        assert_eq!(client.get_root(), BytesN::from_array(&env, &[0u8; 32]));

        env.mock_all_auths();
        let new_root = BytesN::from_array(&env, &[1u8; 32]);
        client.set_root(&new_root);
        assert_eq!(client.get_root(), new_root);
    }

    #[test]
    #[should_panic(expected = "already initialized")]
    fn test_double_initialize_fails() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        client.initialize(&admin);
    }

    #[test]
    #[should_panic] // admin require_auth will fail
    fn test_set_root_non_admin_fails() {
        let env = Env::default();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // No mock_all_auths, calling set_root will fail auth check
        let new_root = BytesN::from_array(&env, &[2u8; 32]);
        client.set_root(&new_root);
    }

    // ─────────────── v3 multi-ASP federation tests ───────────────

    #[test]
    fn test_federation_k_of_n_approval() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        // Register 3 ASP operators (N=3), threshold K=2.
        let asp1 = Address::generate(&env);
        let asp2 = Address::generate(&env);
        let asp3 = Address::generate(&env);
        client.register_asp(&asp1);
        client.register_asp(&asp2);
        client.register_asp(&asp3);
        assert_eq!(client.asp_count(), 3);
        client.set_threshold(&2);

        let root = BytesN::from_array(&env, &[7u8; 32]);
        assert!(!client.is_root_approved(&root));

        // First attestation -> below threshold, not approved.
        assert_eq!(client.attest_root(&asp1, &root), 1);
        assert!(!client.is_root_approved(&root));

        // Second distinct operator -> reaches K=2, approved + adopted as live root.
        assert_eq!(client.attest_root(&asp2, &root), 2);
        assert!(client.is_root_approved(&root));
        assert_eq!(client.get_root(), root);
    }

    #[test]
    #[should_panic(expected = "not a registered ASP operator")]
    fn test_federation_unregistered_attest_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let outsider = Address::generate(&env);
        let root = BytesN::from_array(&env, &[8u8; 32]);
        client.attest_root(&outsider, &root);
    }

    #[test]
    #[should_panic(expected = "operator already attested this root")]
    fn test_federation_double_attest_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, ASPRegistry);
        let client = ASPRegistryClient::new(&env, &contract_id);
        let admin = Address::generate(&env);
        client.initialize(&admin);

        let asp1 = Address::generate(&env);
        client.register_asp(&asp1);
        client.set_threshold(&1);
        let root = BytesN::from_array(&env, &[9u8; 32]);
        client.attest_root(&asp1, &root);
        // same operator can't double-count
        client.attest_root(&asp1, &root);
    }
}

