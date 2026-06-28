pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

// Helper: derives the public signals (roots + nullifier hash) from the private
// witness so we can produce a self-consistent input for withdraw.circom.
// Uses the same Poseidon(2) over the compiled field, with all path indices = 0
// (leaf always on the left), depth 2.
template Gen() {
    signal input nullifier;
    signal input secret;
    signal input dpath[2];   // deposit merkle path elements
    signal input caddr;      // compliance address (leaf)
    signal input cpath[2];   // compliance merkle path elements

    signal output commitment;
    signal output nullifier_hash;
    signal output deposit_root;
    signal output compliance_root;

    component ch = Poseidon(2);
    ch.inputs[0] <== nullifier;
    ch.inputs[1] <== secret;
    commitment <== ch.out;

    component nh = Poseidon(2);
    nh.inputs[0] <== nullifier;
    nh.inputs[1] <== 1;
    nullifier_hash <== nh.out;

    // deposit tree (indices 0,0): root = P(P(commitment, dpath0), dpath1)
    component d1 = Poseidon(2);
    d1.inputs[0] <== commitment;
    d1.inputs[1] <== dpath[0];
    component d2 = Poseidon(2);
    d2.inputs[0] <== d1.out;
    d2.inputs[1] <== dpath[1];
    deposit_root <== d2.out;

    // compliance tree (indices 0,0): root = P(P(caddr, cpath0), cpath1)
    component c1 = Poseidon(2);
    c1.inputs[0] <== caddr;
    c1.inputs[1] <== cpath[0];
    component c2 = Poseidon(2);
    c2.inputs[0] <== c1.out;
    c2.inputs[1] <== cpath[1];
    compliance_root <== c2.out;
}

component main = Gen();
