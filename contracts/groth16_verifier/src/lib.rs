#![no_std]
use soroban_sdk::{
    contract, contractimpl, symbol_short, Bytes, BytesN, Env, Vec,
};
use soroban_sdk::crypto::bn254::{Bn254Fr, Bn254G1Affine, Bn254G2Affine};

// Byte layout (soroban bn254, Ethereum-compatible):
//   G1 = 64 bytes  (be(x) || be(y))
//   G2 = 128 bytes (Fp2 X || Fp2 Y, each Fp2 = be(c1) || be(c0))
//   Fr = 32 bytes  (big-endian)
// A serialized proof is a || b || c = 64 + 128 + 64 = 256 bytes.
const G1: u32 = 64;
const G2: u32 = 128;
const PROOF_LEN: u32 = G1 + G2 + G1; // 256

fn g1(env: &Env, b: &Bytes, off: u32) -> Bn254G1Affine {
    let mut buf = [0u8; 64];
    b.slice(off..off + G1).copy_into_slice(&mut buf);
    Bn254G1Affine::from_bytes(BytesN::from_array(env, &buf))
}
fn g2(env: &Env, b: &Bytes, off: u32) -> Bn254G2Affine {
    let mut buf = [0u8; 128];
    b.slice(off..off + G2).copy_into_slice(&mut buf);
    Bn254G2Affine::from_bytes(BytesN::from_array(env, &buf))
}

#[contract]
pub struct Groth16Verifier;

#[contractimpl]
impl Groth16Verifier {
    /// Initialize with the verification key (BN254, Ethereum byte layout). `alpha`
    /// is a 64-byte G1; `beta`, `gamma`, `delta` are 128-byte G2; `ic` is a vector
    /// of 64-byte G1 points (length = number of public inputs + 1).
    pub fn initialize(
        env: Env,
        alpha: Bytes,
        beta: Bytes,
        gamma: Bytes,
        delta: Bytes,
        ic: Vec<Bytes>,
    ) {
        env.storage().instance().set(&symbol_short!("alpha"), &alpha);
        env.storage().instance().set(&symbol_short!("beta"), &beta);
        env.storage().instance().set(&symbol_short!("gamma"), &gamma);
        env.storage().instance().set(&symbol_short!("delta"), &delta);
        env.storage().instance().set(&symbol_short!("ic"), &ic);
    }

    /// Verify a Groth16 proof over BN254.
    /// `proof` = a(64) || b(128) || c(64). `public_inputs` = vector of 32-byte
    /// big-endian field elements. Returns true iff the pairing check holds.
    pub fn verify_proof(env: Env, proof: Bytes, public_inputs: Vec<Bytes>) -> bool {
        if proof.len() != PROOF_LEN {
            return false;
        }
        let st = env.storage().instance();
        let alpha_b: Bytes = match st.get(&symbol_short!("alpha")) {
            Some(v) => v,
            None => return false,
        };
        let beta_b: Bytes = st.get(&symbol_short!("beta")).unwrap();
        let gamma_b: Bytes = st.get(&symbol_short!("gamma")).unwrap();
        let delta_b: Bytes = st.get(&symbol_short!("delta")).unwrap();
        let ic_b: Vec<Bytes> = st.get(&symbol_short!("ic")).unwrap();

        // ic length must equal public_inputs + 1
        if ic_b.len() != public_inputs.len() + 1 {
            return false;
        }

        let bn = env.crypto().bn254();

        // Parse proof
        let a = g1(&env, &proof, 0);
        let b = g2(&env, &proof, G1);
        let c = g1(&env, &proof, G1 + G2);

        // Parse VK
        let alpha = g1(&env, &alpha_b, 0);
        let beta = g2(&env, &beta_b, 0);
        let gamma = g2(&env, &gamma_b, 0);
        let delta = g2(&env, &delta_b, 0);

        // vk_x = ic[0] + sum_i ( public_input_i * ic[i+1] )
        let ic0_b = ic_b.get(0).unwrap();
        let mut vk_x = g1(&env, &ic0_b, 0);
        for i in 0..public_inputs.len() {
            let pi = public_inputs.get(i).unwrap();
            let mut frb = [0u8; 32];
            pi.copy_into_slice(&mut frb);
            let s = Bn254Fr::from_bytes(BytesN::from_array(&env, &frb));
            let ici_b = ic_b.get(i + 1).unwrap();
            let ici = g1(&env, &ici_b, 0);
            let prod = bn.g1_mul(&ici, &s);
            vk_x = bn.g1_add(&vk_x, &prod);
        }

        // e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
        let neg_a = -a;
        bn.pairing_check(
            soroban_sdk::vec![&env, neg_a, alpha, vk_x, c],
            soroban_sdk::vec![&env, b, beta, gamma, delta],
        )
    }
}

#[cfg(test)]
mod zk_fixture;

#[cfg(test)]
#[path = "crosspool_fixture.rs"]
mod crosspool_fixture;

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{Bytes, Env, Vec};

    fn hexval(c: u8) -> u8 {
        match c {
            b'0'..=b'9' => c - b'0',
            b'a'..=b'f' => c - b'a' + 10,
            b'A'..=b'F' => c - b'A' + 10,
            _ => 0,
        }
    }
    fn hexb(env: &Env, s: &str) -> Bytes {
        let bytes = s.as_bytes();
        let mut out = Bytes::new(env);
        let mut i = 0;
        while i < bytes.len() {
            out.push_back((hexval(bytes[i]) << 4) | hexval(bytes[i + 1]));
            i += 2;
        }
        out
    }

    #[test]
    fn test_real_groth16_verification() {
        use zk_fixture::*;
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let id = env.register(Groth16Verifier, ());
        let client = Groth16VerifierClient::new(&env, &id);

        let mut ic = Vec::new(&env);
        for s in VK_IC.iter() {
            ic.push_back(hexb(&env, s));
        }
        client.initialize(
            &hexb(&env, VK_ALPHA),
            &hexb(&env, VK_BETA),
            &hexb(&env, VK_GAMMA),
            &hexb(&env, VK_DELTA),
            &ic,
        );

        let mut proof = Bytes::new(&env);
        proof.append(&hexb(&env, PROOF_A));
        proof.append(&hexb(&env, PROOF_B));
        proof.append(&hexb(&env, PROOF_C));

        let mut pub_inputs = Vec::new(&env);
        for s in PUB.iter() {
            pub_inputs.push_back(hexb(&env, s));
        }

        assert!(client.verify_proof(&proof, &pub_inputs), "valid proof must verify");

        let mut bad = pub_inputs.clone();
        bad.set(0, hexb(&env, "0000000000000000000000000000000000000000000000000000000000000001"));
        assert!(!client.verify_proof(&proof, &bad), "tampered input must fail");

        let short = Bytes::from_array(&env, &[1u8, 2, 3, 4]);
        assert!(!client.verify_proof(&short, &pub_inputs), "malformed proof must fail");

        // Length mismatch check
        let mut mismatched = pub_inputs.clone();
        mismatched.push_back(Bytes::new(&env));
        assert!(!client.verify_proof(&proof, &mismatched), "mismatched inputs must fail");

        // Uninitialized VK verifier check
        let uninit_id = env.register(Groth16Verifier, ());
        let uninit_client = Groth16VerifierClient::new(&env, &uninit_id);
        assert!(!uninit_client.verify_proof(&proof, &pub_inputs), "uninitialized verifier must fail");
    }

    // ─── v3 cross-pool atomic-swap proof verification ────────────────────────
    #[test]
    fn test_real_crosspool_proof_verification() {
        use crosspool_fixture::*;
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let id = env.register(Groth16Verifier, ());
        let client = Groth16VerifierClient::new(&env, &id);

        // The verifier is circuit-agnostic: initialize with the cross-pool VK
        // (7 IC points for 6 public signals).
        let mut ic = Vec::new(&env);
        for s in VK_IC.iter() {
            ic.push_back(hexb(&env, s));
        }
        client.initialize(
            &hexb(&env, VK_ALPHA),
            &hexb(&env, VK_BETA),
            &hexb(&env, VK_GAMMA),
            &hexb(&env, VK_DELTA),
            &ic,
        );

        let mut proof = Bytes::new(&env);
        proof.append(&hexb(&env, PROOF_A));
        proof.append(&hexb(&env, PROOF_B));
        proof.append(&hexb(&env, PROOF_C));

        // Public signals: [pool_a_nullifier_hash, pool_b_output_commitment,
        //   swap_hash, pool_a_merkle_root, fx_rate_numerator, fx_rate_denominator]
        let mut pub_inputs = Vec::new(&env);
        for s in PUB.iter() {
            pub_inputs.push_back(hexb(&env, s));
        }

        assert!(client.verify_proof(&proof, &pub_inputs), "valid cross-pool proof must verify");

        // Tamper the fx_rate_numerator public input -> must fail.
        let mut bad = pub_inputs.clone();
        bad.set(4, hexb(&env, "0000000000000000000000000000000000000000000000000000000000000001"));
        assert!(!client.verify_proof(&proof, &bad), "tampered cross-pool input must fail");
    }
}
