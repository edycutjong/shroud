const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256_poseidon_emulated(val1, val2) {
  const hasher = crypto.createHash("sha256");
  hasher.update(`${val1}-${val2}`);
  return hasher.digest("hex");
}

function main() {
  console.log("Generating deterministic Merkle Tree via JS...");

  const allowed_addresses = [
    "GD111111111111111111111111111111111111111111111111111111",
    "GD222222222222222222222222222222222222222222222222222222",
    "GD333333333333333333333333333333333333333333333333333333",
    "GD444444444444444444444444444444444444444444444444444444",
  ];

  const salt = "salt123";
  const leaves = allowed_addresses.map((addr) =>
    sha256_poseidon_emulated(addr, salt),
  );

  const node_0_1 = sha256_poseidon_emulated(leaves[0], leaves[1]);
  const node_2_3 = sha256_poseidon_emulated(leaves[2], leaves[3]);
  const root = sha256_poseidon_emulated(node_0_1, node_2_3);

  console.log(`Merkle Root: ${root}`);

  const proofs = {
    [allowed_addresses[0]]: {
      root: root,
      index: 0,
      path: [leaves[1], node_2_3],
      indices: [1, 1],
    },
    [allowed_addresses[1]]: {
      root: root,
      index: 1,
      path: [leaves[0], node_2_3],
      indices: [0, 1],
    },
    [allowed_addresses[2]]: {
      root: root,
      index: 2,
      path: [leaves[3], node_0_1],
      indices: [1, 0],
    },
    [allowed_addresses[3]]: {
      root: root,
      index: 3,
      path: [leaves[2], node_0_1],
      indices: [0, 0],
    },
  };

  const publicDir = path.join(__dirname, "../public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(publicDir, "merkle_proofs.json"),
    JSON.stringify(proofs, null, 2),
  );

  console.log("Proofs exported successfully to public/merkle_proofs.json");
}

if (require.main === module) {
  main();
}
