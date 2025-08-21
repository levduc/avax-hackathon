include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/pedersen.circom";
include "merkleTree.circom";

// computes Pedersen(nullifier + secret)
template WithdrawCommitmentHasher() {
    signal input w_nullifier;      // withdraw nullifier
    signal input r_nullifier;      // reward nullifer 
    signal input secret;           // r value
    signal output commitment;      // H(kr||kd||r)
    signal output w_nullifierHash; // withdraw nullifier hash

    component commitmentHasher = Pedersen(744);
    component w_nullifierHasher = Pedersen(248);
    component w_nullifierBits = Num2Bits(248);
    component r_nullifierBits = Num2Bits(248);
    component secretBits = Num2Bits(248);

    w_nullifierBits.in <== w_nullifier;
    r_nullifierBits.in <== r_nullifier;

    secretBits.in <== secret;

    for (var i = 0; i < 248; i++) {
        w_nullifierHasher.in[i] <== w_nullifierBits.out[i];
        commitmentHasher.in[i] <== w_nullifierBits.out[i];
        commitmentHasher.in[i+248] <== r_nullifierBits.out[i];
        commitmentHasher.in[i+496] <== secretBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
    w_nullifierHash <== w_nullifierHasher.out[0];
}

template RewardCommitmentHasher() {
    signal input w_nullifier;      // withdraw nullifier
    signal input r_nullifier;      // reward nullifer 
    signal input secret;           // r value
    signal output commitment;      // H(kr||kd||r)
    signal output r_nullifierHash; // reward nullfiier hash

    component commitmentHasher = Pedersen(744);
    component r_nullifierHasher = Pedersen(248);
    component w_nullifierBits = Num2Bits(248);
    component r_nullifierBits = Num2Bits(248);
    component secretBits = Num2Bits(248);

    w_nullifierBits.in <== w_nullifier;
    r_nullifierBits.in <== r_nullifier;
    secretBits.in <== secret;
    for (var i = 0; i < 248; i++) {
        r_nullifierHasher.in[i] <== r_nullifierBits.out[i];
        commitmentHasher.in[i] <== w_nullifierBits.out[i];
        commitmentHasher.in[i+248] <== r_nullifierBits.out[i];
        commitmentHasher.in[i+496] <== secretBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
    r_nullifierHash <== r_nullifierHasher.out[0];
}

// Verifies that commitment that corresponds to given secret and nullifier is included in the merkle tree of deposits
template Withdraw(levels) {
    // PUBLIC
    signal input root;
    // contains two nullifier hashes
    signal input w_nullifierHash_0;
    signal input r_nullifierHash_1;

    signal input recipient; // not taking part in any computations
    signal input relayer;  // not taking part in any computations
    signal input fee;      // not taking part in any computations
    signal input refund;   // not taking part in any computations
    // PRIVATE
    // two other nullifier hashes
    signal private input w_nullifier_0;
    signal private input r_nullifier_0;
    signal private input secret_0;

    signal private input w_nullifier_1;
    signal private input r_nullifier_1;
    signal private input secret_1;
    // withdraw path
    signal private input w_pathElements[levels];
    signal private input w_pathIndices[levels];
    // reward path
    signal private input r_pathElements[levels];
    signal private input r_pathIndices[levels];
    // deposit 
    component hasher = WithdrawCommitmentHasher();
    hasher.w_nullifier <== w_nullifier_0;
    hasher.r_nullifier <== r_nullifier_0;
    hasher.secret <== secret_0;
    hasher.w_nullifierHash === w_nullifierHash_0;
    // tree
    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== w_pathElements[i];
        tree.pathIndices[i] <== w_pathIndices[i];
    }

    // reward 
    component hasher_1 = RewardCommitmentHasher();
    hasher_1.w_nullifier <== w_nullifier_1;
    hasher_1.r_nullifier <== r_nullifier_1;
    hasher_1.secret <== secret_1;
    hasher_1.r_nullifierHash === r_nullifierHash_1;

    // same tree
    component tree_1= MerkleTreeChecker(levels);
    tree_1.leaf <== hasher_1.commitment;
    tree_1.root <== root;
    for (var i = 0; i < levels; i++) {
        tree_1.pathElements[i] <== r_pathElements[i];
        tree_1.pathIndices[i] <== r_pathIndices[i];
    }

    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;
    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

component main = Withdraw(30);
