import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const salt = "salt123";

// Poseidon emulated hash matching the seed generator
function poseidonHash(val1: string, val2: string): string {
  const hasher = crypto.createHash("sha256");
  hasher.update(`${val1}-${val2}`);
  return hasher.digest("hex");
}

// Rebuilds Merkle tree of dynamic size and returns root + proof for the target index
function buildMerkleTree(allowedList: string[], targetIndex: number) {
  // Compute leaf hashes: H(Address, Salt)
  const leaves = allowedList.map((addr) => poseidonHash(addr, salt));

  // Padding to power of 2 is handled by duplication
  const tree = [leaves];
  while (tree[tree.length - 1].length > 1) {
    const currentLevel = tree[tree.length - 1];
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(poseidonHash(left, right));
    }
    tree.push(nextLevel);
  }

  const root = tree[tree.length - 1][0];
  const pathNodes: string[] = [];
  const indices: number[] = [];

  let currentIndex = targetIndex;
  for (let level = 0; level < tree.length - 1; level++) {
    const currentLevel = tree[level];
    const isRight = currentIndex % 2 === 1;
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;

    const sibling =
      siblingIndex < currentLevel.length
        ? currentLevel[siblingIndex]
        : currentLevel[currentIndex];
    pathNodes.push(sibling);
    indices.push(isRight ? 0 : 1);

    currentIndex = Math.floor(currentIndex / 2);
  }

  return { root, path: pathNodes, indices };
}

function getJsonFiles() {
  const allowedPath = path.join(
    process.cwd(),
    "public",
    "allowed_addresses.json",
  );
  const revokedPath = path.join(
    process.cwd(),
    "public",
    "revoked_addresses.json",
  );

  let allowed: string[] = [];
  let revoked: string[] = [];

  if (fs.existsSync(allowedPath)) {
    try {
      allowed = JSON.parse(fs.readFileSync(allowedPath, "utf-8"));
    } catch {}
  } else {
    allowed = [
      "GD111111111111111111111111111111111111111111111111111111",
      "GD222222222222222222222222222222222222222222222222222222",
      "GD333333333333333333333333333333333333333333333333333333",
      "GD444444444444444444444444444444444444444444444444444444",
    ];
    fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
  }

  if (fs.existsSync(revokedPath)) {
    try {
      revoked = JSON.parse(fs.readFileSync(revokedPath, "utf-8"));
    } catch {}
  } else {
    revoked = ["GD555555555555555555555555555555555555555555555555555555"];
    fs.writeFileSync(revokedPath, JSON.stringify(revoked, null, 2));
  }

  return { allowed, revoked, allowedPath, revokedPath };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (address === "list") {
    const { allowed, revoked } = getJsonFiles();
    let root =
      "f4219057fcb8d33f59222dae6fb2a5375df0227ea18c788e80be14f1b0ca9468";
    if (allowed.length > 0) {
      const proof = buildMerkleTree(allowed, 0);
      root = proof.root;
    }
    return NextResponse.json({ allowed, revoked, root });
  }

  if (!address) {
    return NextResponse.json(
      { error: "Missing address parameter" },
      { status: 400 },
    );
  }

  const { allowed, revoked, allowedPath } = getJsonFiles();

  // Revocation list check
  if (
    revoked.includes(address) ||
    address === "GD555555555555555555555555555555555555555555555555555555"
  ) {
    return NextResponse.json(
      { error: "BLOCK: Address is sanctioned/revoked" },
      { status: 403 },
    );
  }

  // If a valid address format but not in allowlist, dynamically enroll it!
  const isStellarAddress = /^G[A-D2-7][A-Z2-7]{54}$/.test(address);
  if (!allowed.includes(address) && isStellarAddress) {
    allowed.push(address);
    fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
  }

  // Double check inclusion
  const index = allowed.indexOf(address);
  if (index === -1) {
    return NextResponse.json(
      { error: "Address not found in allowlist registry" },
      { status: 404 },
    );
  }

  try {
    // Dynamically calculate proof
    const proof = buildMerkleTree(allowed, index);

    // Write out merkle_proofs.json map for references
    const proofsMap: Record<string, unknown> = {};
    allowed.forEach((addr, i) => {
      proofsMap[addr] = {
        index: i,
        ...buildMerkleTree(allowed, i),
      };
    });
    const proofsPath = path.join(process.cwd(), "public", "merkle_proofs.json");
    fs.writeFileSync(proofsPath, JSON.stringify(proofsMap, null, 2));

    return NextResponse.json({
      root: proof.root,
      index,
      path: proof.path,
      indices: proof.indices,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to build Merkle proof: " + String(err) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { address, action } = await request.json();
    if (!address) {
      return NextResponse.json(
        { error: "Missing address parameter" },
        { status: 400 },
      );
    }

    const { allowed, revoked, allowedPath, revokedPath } = getJsonFiles();

    if (action === "allow") {
      // Add to allowed, remove from revoked
      if (!allowed.includes(address)) {
        allowed.push(address);
        fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
      }
      const revIndex = revoked.indexOf(address);
      if (revIndex !== -1) {
        revoked.splice(revIndex, 1);
        fs.writeFileSync(revokedPath, JSON.stringify(revoked, null, 2));
      }
    } else if (action === "revoke") {
      // Add to revoked, remove from allowed
      if (!revoked.includes(address)) {
        revoked.push(address);
        fs.writeFileSync(revokedPath, JSON.stringify(revoked, null, 2));
      }
      const allowedIndex = allowed.indexOf(address);
      if (allowedIndex !== -1) {
        allowed.splice(allowedIndex, 1);
        fs.writeFileSync(allowedPath, JSON.stringify(allowed, null, 2));
      }
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Recalculate tree root
    let newRoot =
      "f4219057fcb8d33f59222dae6fb2a5375df0227ea18c788e80be14f1b0ca9468";
    if (allowed.length > 0) {
      const proof = buildMerkleTree(allowed, 0);
      newRoot = proof.root;

      // Update merkle_proofs.json map
      const proofsMap: Record<string, unknown> = {};
      allowed.forEach((addr, i) => {
        proofsMap[addr] = {
          index: i,
          ...buildMerkleTree(allowed, i),
        };
      });
      const proofsPath = path.join(
        process.cwd(),
        "public",
        "merkle_proofs.json",
      );
      fs.writeFileSync(proofsPath, JSON.stringify(proofsMap, null, 2));
    }

    return NextResponse.json({
      success: true,
      root: newRoot,
      allowed,
      revoked,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
