pragma circom 2.0.0;

/*
 * Component 1 compatible Merkle-membership circuit.
 *
 * Component 1 defines a leaf as SHA-256(candidateId|moduleCode|marks|grade|version)
 * and every internal node as SHA-256(leftHexDigest || rightHexDigest), where each
 * digest is its 64-character lowercase hexadecimal text representation.  The
 * public input is the 256-bit finalized root.  The leaf and sibling hashes are
 * private, so a verifier learns membership in that root but not the academic
 * record, marks, grade, or Merkle path.
 *
 * The Component 4 service independently recomputes the Component 1 leaf from
 * the authoritative API record before this proof is generated.  Thus the
 * deterministic C1 record binding and the ZK membership statement compose into
 * one verification decision without changing Component 1.
 */

include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

template AssertBit() {
    signal input in;
    in * (in - 1) === 0;
}

// Transform a SHA-256 digest bit-string to the 512 ASCII bits used by
// Component 1 when it concatenates hexadecimal hash strings.
template DigestBitsToLowerHexAscii() {
    signal input digest[256];
    signal output asciiBits[512];

    component bitChecks[256];
    component belowTen[64];
    component asciiToBits[64];
    signal nibbleValue[64];
    signal asciiValue[64];

    for (var nibbleIndex = 0; nibbleIndex < 64; nibbleIndex++) {
        for (var bitIndex = 0; bitIndex < 4; bitIndex++) {
            bitChecks[nibbleIndex * 4 + bitIndex] = AssertBit();
            bitChecks[nibbleIndex * 4 + bitIndex].in <== digest[nibbleIndex * 4 + bitIndex];
        }

        // SHA-256 digest order is MSB-first. Convert its 4 bits to 0..15.
        nibbleValue[nibbleIndex] <== digest[nibbleIndex * 4] * 8
                                 + digest[nibbleIndex * 4 + 1] * 4
                                 + digest[nibbleIndex * 4 + 2] * 2
                                 + digest[nibbleIndex * 4 + 3];

        // belowTen=1 for 0..9; a..f are encoded as value + 87, otherwise
        // decimal digits are value + 48.  The expression is ASCII lowercase.
        belowTen[nibbleIndex] = LessThan(4);
        belowTen[nibbleIndex].in[0] <== nibbleValue[nibbleIndex];
        belowTen[nibbleIndex].in[1] <== 10;
        asciiValue[nibbleIndex] <== nibbleValue[nibbleIndex] + 87 - (39 * belowTen[nibbleIndex].out);
        asciiToBits[nibbleIndex] = Num2Bits(8);
        asciiToBits[nibbleIndex].in <== asciiValue[nibbleIndex];

        // Sha256 expects each input byte in MSB-first order.
        for (var asciiBit = 0; asciiBit < 8; asciiBit++) {
            asciiBits[nibbleIndex * 8 + asciiBit] <== asciiToBits[nibbleIndex].out[7 - asciiBit];
        }
    }
}

template Component1MerkleMembership(depth) {
    // Public: the root read from Component 1's blockchain anchor.
    signal input merkleRoot[256];

    // Private witness: Component 1 leaf and Merkle siblings. direction=0 means
    // current hash is the left child; direction=1 means it is the right child.
    signal input leaf[256];
    signal input siblings[depth][256];
    signal input direction[depth];

    signal current[depth + 1][256];
    component currentChecks[depth + 1][256];
    component directionChecks[depth];
    component leftHex[depth];
    component rightHex[depth];
    component parentHash[depth];

    for (var i = 0; i < 256; i++) {
        current[0][i] <== leaf[i];
    }

    for (var level = 0; level < depth; level++) {
        directionChecks[level] = AssertBit();
        directionChecks[level].in <== direction[level];
        leftHex[level] = DigestBitsToLowerHexAscii();
        rightHex[level] = DigestBitsToLowerHexAscii();
        parentHash[level] = Sha256(1024);

        for (var j = 0; j < 256; j++) {
            // Conditional swap without exposing the direction bit.
            leftHex[level].digest[j] <== current[level][j] + direction[level] * (siblings[level][j] - current[level][j]);
            rightHex[level].digest[j] <== siblings[level][j] + direction[level] * (current[level][j] - siblings[level][j]);
        }

        for (var k = 0; k < 512; k++) {
            parentHash[level].in[k] <== leftHex[level].asciiBits[k];
            parentHash[level].in[512 + k] <== rightHex[level].asciiBits[k];
        }
        for (var outputBit = 0; outputBit < 256; outputBit++) {
            current[level + 1][outputBit] <== parentHash[level].out[outputBit];
        }
    }

    for (var rootBit = 0; rootBit < 256; rootBit++) {
        currentChecks[depth][rootBit] = AssertBit();
        currentChecks[depth][rootBit].in <== current[depth][rootBit];
        current[depth][rootBit] === merkleRoot[rootBit];
    }
}

// Depth 8 supports finalized Component 1 datasets of up to 256 leaves.  A
// larger dataset can use a separately audited depth-specific artifact.
component main {public [merkleRoot]} = Component1MerkleMembership(8);
