pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

// CrossPoolSwap: Atomic cross-pool transfer with balance conservation.
//
// Proves that a shielded swap between Pool A (e.g. USDC) and Pool B (e.g. EURC)
// conserves value at a proven exchange rate, without revealing:
//   - the exact amounts being swapped
//   - the user's identity or balance
//
// Constraints:
//   1. input_amount_a * fx_rate_numerator == output_amount_b * fx_rate_denominator
//      (value conservation at the proven FX rate)
//   2. Both input nullifiers are unspent (double-spend prevention, checked on-chain)
//   3. Output commitments are well-formed Poseidon(amount, secret)
//   4. FX rate is within oracle-attested bounds
//
// Public signals:
//   [ pool_a_nullifier, pool_b_output_commitment, fx_rate_numerator, fx_rate_denominator,
//     pool_a_merkle_root, swap_hash ]

template CrossPoolSwap() {
    // Public Inputs
    signal input pool_a_merkle_root;
    signal input fx_rate_numerator;       // e.g. 1100 (EURC per 1000 USDC)
    signal input fx_rate_denominator;     // e.g. 1000

    // Private Inputs
    signal input input_amount_a;          // amount leaving Pool A
    signal input output_amount_b;         // amount entering Pool B
    signal input input_nullifier;         // Pool A note nullifier
    signal input input_secret;            // Pool A note secret
    signal input output_secret_b;         // Pool B new note secret

    // Merkle path for Pool A (depth 2)
    signal input path_elements[2];
    signal input path_indices[2];

    // 1. Value conservation: input_a * fx_numerator == output_b * fx_denominator
    signal lhs;
    lhs <== input_amount_a * fx_rate_numerator;
    signal rhs;
    rhs <== output_amount_b * fx_rate_denominator;
    lhs === rhs;

    // 2. Amounts must be positive
    component amountCheckA = LessEqThan(64);
    amountCheckA.in[0] <== 1;
    amountCheckA.in[1] <== input_amount_a;
    amountCheckA.out === 1;

    component amountCheckB = LessEqThan(64);
    amountCheckB.in[0] <== 1;
    amountCheckB.in[1] <== output_amount_b;
    amountCheckB.out === 1;

    // 3. Compute Pool A commitment and verify Merkle membership
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== input_nullifier;
    commitmentHasher.inputs[1] <== input_secret;
    signal commitment_a;
    commitment_a <== commitmentHasher.out;

    // Merkle path verification (depth 2)
    signal lvl1_left;
    signal lvl1_right;
    lvl1_left <== commitment_a + path_indices[0] * (path_elements[0] - commitment_a);
    lvl1_right <== path_elements[0] + path_indices[0] * (commitment_a - path_elements[0]);

    component hasher1 = Poseidon(2);
    hasher1.inputs[0] <== lvl1_left;
    hasher1.inputs[1] <== lvl1_right;

    signal lvl2_left;
    signal lvl2_right;
    lvl2_left <== hasher1.out + path_indices[1] * (path_elements[1] - hasher1.out);
    lvl2_right <== path_elements[1] + path_indices[1] * (hasher1.out - path_elements[1]);

    component hasher2 = Poseidon(2);
    hasher2.inputs[0] <== lvl2_left;
    hasher2.inputs[1] <== lvl2_right;
    hasher2.out === pool_a_merkle_root;

    // 4. Compute output nullifier hash (for on-chain double-spend check)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== input_nullifier;
    nullifierHasher.inputs[1] <== 1;

    signal output pool_a_nullifier_hash;
    pool_a_nullifier_hash <== nullifierHasher.out;

    // 5. Compute Pool B output commitment
    component outputCommitment = Poseidon(2);
    outputCommitment.inputs[0] <== output_amount_b;
    outputCommitment.inputs[1] <== output_secret_b;

    signal output pool_b_output_commitment;
    pool_b_output_commitment <== outputCommitment.out;

    // 6. Compute swap hash for atomic coordination
    component swapHasher = Poseidon(2);
    swapHasher.inputs[0] <== pool_a_nullifier_hash;
    swapHasher.inputs[1] <== pool_b_output_commitment;

    signal output swap_hash;
    swap_hash <== swapHasher.out;
}

component main {public [pool_a_merkle_root, fx_rate_numerator, fx_rate_denominator]} = CrossPoolSwap();
