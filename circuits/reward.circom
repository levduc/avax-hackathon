include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/pedersen.circom";
include "merkleTree.circom";

// computes Pedersen(nullifiers + secret)

template CommitmentHasher() {
    signal input w_nullifier;      // withdraw nullifier
    signal input r_nullifier;      // reward nullifer 
    signal input secret;           // r value
    signal output commitment;      // H(kr||kd||r)
    signal output w_nullifierHash; // withdraw nullifier hash
    signal output r_nullifierHash; // reward nullfiier hash

    component commitmentHasher = Pedersen(744);

    component w_nullifierHasher = Pedersen(248);
    component r_nullifierHasher = Pedersen(248);

    component w_nullifierBits = Num2Bits(248);
    component r_nullifierBits = Num2Bits(248);

    component secretBits = Num2Bits(248);

    w_nullifierBits.in <== w_nullifier;
    r_nullifierBits.in <== r_nullifier;

    secretBits.in <== secret;

    for (var i = 0; i < 248; i++) {
        w_nullifierHasher.in[i] <== w_nullifierBits.out[i];
        r_nullifierHasher.in[i] <== r_nullifierBits.out[i];

        commitmentHasher.in[i] <== w_nullifierBits.out[i];
        commitmentHasher.in[i+248] <== r_nullifierBits.out[i];
        commitmentHasher.in[i+496] <== secretBits.out[i];
    }

    commitment <== commitmentHasher.out[0];
    r_nullifierHash <== r_nullifierHasher.out[0];
    w_nullifierHash <== w_nullifierHasher.out[0];
}

// Verifies that commitment that corresponds to given secret and nullifier is included in the merkle tree of deposits
template Reward(levels) {
    // PUBLIC
    signal input root;
    signal input r_nullifierHash;
    signal input recipient; // not taking part in any computations
    signal input relayer;  // not taking part in any computations
    signal input fee;      // not taking part in any computations
    signal input refund;   // not taking part in any computations

    // PRIVATE
    signal private input w_nullifierHash;
    signal private input w_nullifier;
    signal private input r_nullifier;
    signal private input secret;
    signal private input pathElements[levels];
    signal private input pathIndices[levels];

    // hash 
    component hasher = CommitmentHasher();
    hasher.w_nullifier <== w_nullifier;
    hasher.r_nullifier <== r_nullifier;

    hasher.secret <== secret;

    hasher.w_nullifierHash === w_nullifierHash;
    hasher.r_nullifierHash === r_nullifierHash;

    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
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

component main = Reward(30);
