import { NextResponse } from "next/server";
import { rpc } from "@stellar/stellar-sdk";

// Live status endpoint. Reads the real Soroban testnet RPC and reports the
// deployed Shroud contract IDs — no hardcoded roots or mock counts. The real
// Groth16 (BLS12-381) proof verification is reproduced by `npm run prove:demo`,
// which submits a snarkjs-generated proof to verify_proof on the verifier.

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ||
  "https://soroban-testnet.stellar.org";

export async function GET() {
  const contracts = {
    shroud_pool: process.env.NEXT_PUBLIC_SHROUD_POOL_ID || null,
    asp_registry: process.env.NEXT_PUBLIC_ASP_REGISTRY_ID || null,
    groth16_verifier: process.env.NEXT_PUBLIC_GROTH16_VERIFIER_ID || null,
  };
  try {
    const server = new rpc.Server(RPC_URL, {
      allowHttp: RPC_URL.startsWith("http://"),
    });
    const [health, latestLedger] = await Promise.all([
      server.getHealth(),
      server.getLatestLedger(),
    ]);
    return NextResponse.json({
      status: health.status === "healthy" ? "connected" : health.status,
      network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
      rpc_url: RPC_URL,
      contracts,
      latest_ledger: latestLedger.sequence,
      protocol_version: latestLedger.protocolVersion,
      verify_entrypoint: "verify_proof",
      note: "Real Groth16/BLS12-381 verification is reproduced via `npm run prove:demo`.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "rpc_unreachable",
        network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet",
        contracts,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    );
  }
}
