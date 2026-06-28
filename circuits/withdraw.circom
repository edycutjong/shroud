pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

// MerkleTreeVerifier verifies that a leaf belongs to a Merkle tree of depth 2
template MerkleTreeVerifier2() {
    signal input leaf;
    signal input path_elements[2];
    signal input path_indices[2];
    signal input root;

    signal lvl1_hash;
    signal lvl2_hash;

    // Level 1 hash
    // path_indices[0] == 0 => leaf is left, path_elements[0] is right
    // path_indices[0] == 1 => path_elements[0] is left, leaf is right
    component selector1 = HashSelector();
    selector1.in[0] <== leaf;
    selector1.in[1] <== path_elements[0];
    selector1.sel <== path_indices[0];

    component hasher1 = Poseidon(2);
    hasher1.inputs[0] <== selector1.out[0];
    hasher1.inputs[1] <== selector1.out[1];
    lvl1_hash <== hasher1.out;

    // Level 2 hash
    component selector2 = HashSelector();
    selector2.in[0] <== lvl1_hash;
    selector2.in[1] <== path_elements[1];
    selector2.sel <== path_indices[1];

    component hasher2 = Poseidon(2);
    hasher2.inputs[0] <== selector2.out[0];
    hasher2.inputs[1] <== selector2.out[1];
    lvl2_hash <== hasher2.out;

    // Assert that computed root matches public root
    lvl2_hash === root;
}

// Selects the order of inputs based on selectors
template HashSelector() {
    signal input in[2];
    signal input sel;
    signal output out[2];

    sel * (sel - 1) === 0; // Constraint: sel is 0 or 1

    out[0] <== in[0] + sel * (in[1] - in[0]);
    out[1] <== in[1] + sel * (in[0] - in[1]);
}

// Main circuit template
template ShroudWithdraw() {
    // Public Inputs
    signal input deposit_merkle_root;
    signal input compliance_merkle_root;
    signal input nullifier_hash;
    signal input recipient_address;
    signal input ownerAx;   // public: note owner BabyJubjub pubkey x
    signal input ownerAy;   // public: note owner BabyJubjub pubkey y

    // Private Inputs
    signal input nullifier;
    signal input secret;

    // EdDSA-Poseidon signature (private) authorizing this withdrawal.
    signal input sigS;
    signal input sigR8x;
    signal input sigR8y;

    // Deposit Tree path (depth 2)
    signal input deposit_merkle_path[2];
    signal input deposit_indices[2];
    
    // Compliance Tree path (depth 2)
    signal input compliance_address;
    signal input compliance_merkle_path[2];
    signal input compliance_indices[2];

    // 1. Assert commitment matches Poseidon(nullifier, secret)
    component commitment_hasher = Poseidon(2);
    commitment_hasher.inputs[0] <== nullifier;
    commitment_hasher.inputs[1] <== secret;
    signal commitment;
    commitment <== commitment_hasher.out;

    // 2. Assert nullifier hash matches Poseidon(nullifier, 1)
    component nullifier_hasher = Poseidon(2);
    nullifier_hasher.inputs[0] <== nullifier;
    nullifier_hasher.inputs[1] <== 1;
    nullifier_hasher.out === nullifier_hash;

    // 3. Verify deposit commitment membership in Deposit Merkle Tree
    component deposit_verifier = MerkleTreeVerifier2();
    deposit_verifier.leaf <== commitment;
    for (var i = 0; i < 2; i++) {
        deposit_verifier.path_elements[i] <== deposit_merkle_path[i];
        deposit_verifier.path_indices[i] <== deposit_indices[i];
    }
    deposit_verifier.root <== deposit_merkle_root;

    // 4. Verify compliance address membership in Compliance Merkle Tree
    component compliance_verifier = MerkleTreeVerifier2();
    compliance_verifier.leaf <== compliance_address;
    for (var i = 0; i < 2; i++) {
        compliance_verifier.path_elements[i] <== compliance_merkle_path[i];
        compliance_verifier.path_indices[i] <== compliance_indices[i];
    }
    compliance_verifier.root <== compliance_merkle_root;

    // 5. Bind recipient address to prevent transaction front-running hijacking
    // We add a constraint involving the recipient_address so it's load-bearing in the proof
    signal recipient_square;
    recipient_square <== recipient_address * recipient_address;

    // 6. The note owner authorizes this withdrawal: verify their EdDSA-Poseidon
    //    signature over the nullifier hash. (ownerAx, ownerAy) is public so the
    //    pool can bind the spend to a known owner key.
    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;
    sigVerifier.Ax <== ownerAx;
    sigVerifier.Ay <== ownerAy;
    sigVerifier.S <== sigS;
    sigVerifier.R8x <== sigR8x;
    sigVerifier.R8y <== sigR8y;
    sigVerifier.M <== nullifier_hash;
}

component main {public [deposit_merkle_root, compliance_merkle_root, nullifier_hash, recipient_address, ownerAx, ownerAy]} = ShroudWithdraw();
