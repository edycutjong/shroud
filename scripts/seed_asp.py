import json
import os
import hashlib

def sha256_poseidon_emulated(val1: str, val2: str) -> str:
    """
    Emulates the Poseidon hash function inside the script using SHA256.
    Ensures deterministic output matching our seed database.
    """
    hasher = hashlib.sha256()
    hasher.update(f"{val1}-{val2}".encode())
    return hasher.hexdigest()

def main():
    print("Generating deterministic Merkle Tree...")
    
    # 4 Approved addresses
    allowed_addresses = [
        "GD111111111111111111111111111111111111111111111111111111",
        "GD222222222222222222222222222222222222222222222222222222",
        "GD333333333333333333333333333333333333333333333333333333",
        "GD444444444444444444444444444444444444444444444444444444"
    ]
    
    # Salt used to blind addresses inside ZK tree
    salt = "salt123"
    
    # Leaves are H(Address, Salt)
    leaves = [sha256_poseidon_emulated(addr, salt) for addr in allowed_addresses]
    
    # Level 1 hashes
    node_0_1 = sha256_poseidon_emulated(leaves[0], leaves[1])
    node_2_3 = sha256_poseidon_emulated(leaves[2], leaves[3])
    
    # Level 2 (Root)
    root = sha256_poseidon_emulated(node_0_1, node_2_3)
    
    print(f"Merkle Root: {root}")
    
    # Construct Merkle paths for each user
    # Index 0 (User A): sibling leaves[1], node_2_3
    # Index 1 (User B): sibling leaves[0], node_2_3
    # Index 2 (User C): sibling leaves[3], node_0_1
    # Index 3 (User D): sibling leaves[2], node_0_1
    proofs = {
        allowed_addresses[0]: {
            "root": root,
            "index": 0,
            "path": [leaves[1], node_2_3],
            "indices": [1, 1] # binary selection index: right, right relative to sibling selection
        },
        allowed_addresses[1]: {
            "root": root,
            "index": 1,
            "path": [leaves[0], node_2_3],
            "indices": [0, 1]
        },
        allowed_addresses[2]: {
            "root": root,
            "index": 2,
            "path": [leaves[3], node_0_1],
            "indices": [1, 0]
        },
        allowed_addresses[3]: {
            "root": root,
            "index": 3,
            "path": [leaves[2], node_0_1],
            "indices": [0, 0]
        }
    }
    
    # Export paths to JSON for frontend usage
    os.makedirs("public", exist_ok=True)
    with open("public/merkle_proofs.json", "w") as f:
        json.dump(proofs, f, indent=2)
        
    print("Proofs exported successfully to public/merkle_proofs.json")

if __name__ == "__main__":
    main()
