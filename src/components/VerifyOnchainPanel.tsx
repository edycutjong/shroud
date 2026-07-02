"use client";

import { useState } from "react";

type Result = {
  valid_proof: boolean;
  tampered_proof: boolean;
  verifier: string;
  explorer: string;
} | null;

export default function VerifyOnchainPanel() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result>(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const r = await fetch("/api/verify-onchain");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "verification failed");
      setRes(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-6 mb-4 relative z-10">
      <div className="border border-indigo-500/30 bg-indigo-500/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="font-mono text-xs text-indigo-300 font-bold uppercase tracking-wider mb-1">
            Real on-chain ZK — no wallet needed
          </p>
          <p className="text-zinc-400 text-sm">
            Re-verify a real BN254 Groth16 proof against the deployed Soroban
            verifier, live on Testnet.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="font-mono text-xs font-bold tracking-widest px-4 py-2.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          {loading ? "VERIFYING ON-CHAIN…" : "🔬 VERIFY A REAL PROOF ON-CHAIN"}
        </button>
      </div>

      {res && (
        <div className="mt-2 border border-zinc-800 bg-zinc-900/50 rounded-xl p-4 font-mono text-xs text-zinc-400 space-y-1">
          <p>
            <span className="text-zinc-500">real proof → verify_proof = </span>
            <span
              className={res.valid_proof ? "text-emerald-400" : "text-red-400"}
            >
              {String(res.valid_proof)}
            </span>
          </p>
          <p>
            <span className="text-zinc-500">
              tampered inputs → verify_proof ={" "}
            </span>
            <span
              className={
                res.tampered_proof ? "text-red-400" : "text-emerald-400"
              }
            >
              {String(res.tampered_proof)}
            </span>
          </p>
          <a
            href={res.explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-1 text-indigo-400 hover:text-indigo-300"
          >
            View verifier {res.verifier.slice(0, 6)}…{res.verifier.slice(-4)} on
            stellar.expert →
          </a>
        </div>
      )}
      {err && (
        <p className="mt-2 font-mono text-xs text-red-400">Error: {err}</p>
      )}
    </div>
  );
}
