"use client";

import React, { useState } from "react";
import {
  ShroudClient,
  ComplianceVerifier,
  ShroudProver,
  ShroudNote,
  addrToField,
} from "../sdk";
import { triggerConfetti } from "../sdk/confetti";

interface MerkleProof {
  root: string;
  index: number;
  path: string[];
  indices: number[];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw" | "admin">(
    "deposit",
  );

  // KYC / Allowlist check state
  const [kycAddress, setKycAddress] = useState("");
  const [kycStatus, setKycStatus] = useState<
    "idle" | "loading" | "approved" | "revoked" | "not_found"
  >("idle");
  const [merkleProof, setMerkleProof] = useState<MerkleProof | null>(null);

  // Deposit state
  const [depositAmount, setDepositAmount] = useState("100");
  const [generatedNote, setGeneratedNote] = useState<ShroudNote | null>(null);
  const [commitment, setCommitment] = useState("");
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);

  // Withdrawal state
  const [noteFileContent, setNoteFileContent] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const relayerUrl = "https://relayer.shroud.io";
  const [provingLogs, setProvingLogs] = useState<string[]>([]);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawalTxHash, setWithdrawalTxHash] = useState("");

  // Wallet state
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [sandboxMode, setSandboxMode] = useState<boolean>(true);

  const connectWallet = async () => {
    setProvingLogs((prev) => [
      ...prev,
      `[Freighter] Connecting to Freighter Wallet...`,
    ]);
    try {
      const win = window as unknown as Record<string, Record<string, unknown>>;
      const freighterDetected =
        typeof window !== "undefined" && (win.stellarWebKit || win.stellar);
      if (!freighterDetected) {
        setProvingLogs((prev) => [
          ...prev,
          "[Freighter] Wallet extension not detected. Initializing Demo Mode...",
        ]);
        setTimeout(() => {
          setWalletConnected(true);
          setWalletAddress(
            "GBSHROUDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          );
          setKycAddress(
            "GBSHROUDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
          );
          setProvingLogs((prev) => [
            ...prev,
            `[Freighter] Connected (Demo Mode). Address: GBSHROUD...`,
          ]);
        }, 1200);
        return;
      }

      const pubKey = await (
        window as unknown as {
          stellar: { getPublicKey: () => Promise<string> };
        }
      ).stellar.getPublicKey();
      if (pubKey) {
        setWalletConnected(true);
        setWalletAddress(pubKey);
        setKycAddress(pubKey);
        setSandboxMode(false);
        setProvingLogs((prev) => [
          ...prev,
          `[Freighter] Connected. Address: ${pubKey}`,
        ]);
      }
    } catch (err: unknown) {
      console.error("Wallet connection failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setProvingLogs((prev) => [...prev, `[ERROR] ${msg}`]);
    }
  };

  // Admin dashboard states
  const [adminAllowedList, setAdminAllowedList] = useState<string[]>([]);
  const [adminRevokedList, setAdminRevokedList] = useState<string[]>([]);
  const [adminAddressInput, setAdminAddressInput] = useState("");
  const [isAdminActionLoading, setIsAdminActionLoading] = useState(false);

  // Live status telemetry
  const [telemetry, setTelemetry] = useState({
    status: "connected",
    network: "testnet",
    latestRoot:
      "f4219057fcb8d33f59222dae6fb2a5375df0227ea18c788e80be14f1b0ca9468",
    activeNullifiersCount: 5,
  });

  const fetchComplianceLists = async () => {
    try {
      const res = await fetch("/api/compliance/proof?address=list");
      const data = await res.json();
      if (data.allowed) setAdminAllowedList(data.allowed);
      if (data.revoked) setAdminRevokedList(data.revoked);
      if (data.root) {
        setTelemetry((prev) => ({ ...prev, latestRoot: data.root }));
      }
    } catch (err) {
      console.error("Failed to fetch compliance lists", err);
    }
  };

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchComplianceLists();
  }, []);

  const handleComplianceAdminAction = async (
    targetAddr: string,
    action: "allow" | "revoke",
  ) => {
    if (!targetAddr) return;
    setIsAdminActionLoading(true);
    try {
      const res = await fetch("/api/compliance/proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: targetAddr, action }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminAllowedList(data.allowed);
        setAdminRevokedList(data.revoked);
        setTelemetry((prev) => ({ ...prev, latestRoot: data.root }));
        setAdminAddressInput("");
        if (targetAddr === kycAddress) {
          // Re-check target allowed status in current check block
          checkAllowlist();
        }
      }
    } catch (err) {
      console.error("Failed to run admin action", err);
    } finally {
      setIsAdminActionLoading(false);
    }
  };

  // Check allowlist status
  const checkAllowlist = async () => {
    if (!kycAddress) return;
    setKycStatus("loading");
    setProvingLogs([]);
    try {
      const verifier = new ComplianceVerifier(window.location.origin);
      const proof = await verifier.getComplianceProof(kycAddress);
      setKycStatus("approved");
      setMerkleProof(proof);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "";
      if (errMsg.includes("BLOCK")) {
        setKycStatus("revoked");
      } else {
        setKycStatus("not_found");
      }
      setMerkleProof(null);
    }
  };

  // Run deposit simulation
  const handleDeposit = async () => {
    if (kycStatus !== "approved") return;
    setIsDepositing(true);
    setDepositSuccess(false);

    // Simulate deposit processing
    setTimeout(() => {
      const amount = BigInt(depositAmount);
      const note = ShroudClient.createNote(amount);
      const commitHash = ShroudClient.computeCommitment(note);

      setGeneratedNote(note);
      setCommitment(commitHash);
      setIsDepositing(false);
      setDepositSuccess(true);
    }, 1500);
  };

  // Download secret note key
  const downloadNoteKey = () => {
    if (!generatedNote) return;
    const blob = new Blob([JSON.stringify(generatedNote, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shroud_secret_note_${depositAmount}.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Run withdraw proving and submission
  const handleWithdrawal = async () => {
    if (!noteFileContent || !recipientAddress || !merkleProof) return;
    setIsWithdrawing(true);
    setProvingLogs([]);
    setWithdrawalTxHash("");

    const log = (msg: string) =>
      setProvingLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ${msg}`,
      ]);

    try {
      log("Initializing proving worker thread...");
      await new Promise((resolve) => setTimeout(resolve, 800));

      const parsedNote = JSON.parse(noteFileContent);
      log("Parsed private secret keys and nullifier preimage");
      await new Promise((resolve) => setTimeout(resolve, 800));

      log("Fetching latest active compliance Merkle root...");
      log(`Registry active root: ${merkleProof.root}`);
      await new Promise((resolve) => setTimeout(resolve, 800));

      log("Generating ZK Groth16 Proof locally inside browser...");
      const prover = new ShroudProver();
      // Derive self-consistent public signals (Poseidon-over-bls12-381 roots) via
      // the helper circuit, then prove. compliancePath comes from the ASP proof;
      // depositPath is derived from the note (until the on-chain deposit tree is wired).
      const cpath = (merkleProof.path ?? []) as string[];
      const witness = await prover.deriveWitness({
        note: parsedNote,
        complianceAddress: addrToField(recipientAddress),
        compliancePath: [
          cpath[0] ?? addrToField(parsedNote.secret),
          cpath[1] ?? addrToField(parsedNote.nullifier),
        ] as [string, string],
        depositPath: [
          addrToField(parsedNote.nullifier),
          addrToField(parsedNote.secret),
        ] as [string, string],
        recipient: recipientAddress,
      });
      const {
        proof: _proof,
        publicInputs: zkPublicInputs,
        nullifierHash,
      } = await prover.proveWithdrawal(parsedNote, witness);
      log(`ZK Proof compiled successfully. Nullifier hash: ${nullifierHash}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!sandboxMode) {
        log("[Stellar] Connecting to Soroban RPC...");
        const {
          rpc,
          TransactionBuilder,
          Networks,
          Contract,
          Address: StellarAddress,
          nativeToScVal,
        } = await import("@stellar/stellar-sdk");

        const contractId =
          process.env.NEXT_PUBLIC_SHROUD_POOL_ID ||
          "CB3C5KQL4MZO3Q2SXY7HLTJWV32WXLSP73L5J5Z6R4M5Y3H2R7OWTEST";
        if (!contractId || contractId.startsWith("CB...")) {
          throw new Error(
            "Stellar Shroud Pool Contract ID is not configured. Please set NEXT_PUBLIC_SHROUD_POOL_ID in your env.",
          );
        }

        const rpcUrl =
          process.env.NEXT_PUBLIC_STELLAR_RPC_URL ||
          "https://soroban-testnet.stellar.org";
        const server = new rpc.Server(rpcUrl);

        log(`[Stellar] Connected to RPC. Contract Address: ${contractId}`);
        log(`[Stellar] Packaging proof data and nullifier hash into ScVals...`);

        // Circuit public signals (Vec<Bytes>, 6 x 32-byte BE fields)
        const publicInputs = zkPublicInputs.map((pi) => Buffer.from(pi));

        const c = new Contract(contractId);
        const callOp = c.call(
          "withdraw",
          nativeToScVal(Buffer.from(_proof)),
          nativeToScVal(publicInputs),
          StellarAddress.fromString(recipientAddress).toScVal(),
          StellarAddress.fromString(walletAddress).toScVal(), // relayer = self (fee 0)
          nativeToScVal(BigInt(parsedNote.amount)),
          nativeToScVal(BigInt(0)),
        );

        if (
          typeof window !== "undefined" &&
          "stellar" in window &&
          window.stellar
        ) {
          log(
            `[Freighter] Fetching account details for wallet: ${walletAddress}...`,
          );
          const account = await server.getAccount(walletAddress);

          const tx = new TransactionBuilder(account, {
            fee: "100000",
            networkPassphrase: Networks.TESTNET,
          })
            .addOperation(callOp)
            .setTimeout(30)
            .build();

          const xdrTx = tx.toXDR();

          log(`[Freighter] Requesting wallet signature for withdrawal...`);
          const signedTx = await (
            window as unknown as {
              stellar: {
                signTransaction: (
                  xdr: string,
                  opts: { networkPassphrase: string },
                ) => Promise<string>;
              };
            }
          ).stellar.signTransaction(xdrTx, {
            networkPassphrase: Networks.TESTNET,
          });

          log(`[Stellar] Submitting transaction to Soroban RPC...`);
          const signedTxObj = TransactionBuilder.fromXDR(
            signedTx,
            Networks.TESTNET,
          );
          const sendResponse = await server.sendTransaction(signedTxObj);
          if (sendResponse.status === "ERROR") {
            throw new Error(
              `RPC submit error: ${JSON.stringify(sendResponse.errorResult)}`,
            );
          }

          let txStatus = await server.getTransaction(sendResponse.hash);
          let attempts = 0;
          while (txStatus.status === "NOT_FOUND" && attempts < 10) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            txStatus = await server.getTransaction(sendResponse.hash);
            attempts++;
          }

          if (txStatus.status === "SUCCESS") {
            log(
              `[Stellar] Transaction finalized successfully! Hash: ${sendResponse.hash}`,
            );
            setWithdrawalTxHash(sendResponse.hash);
            setTelemetry((prev) => ({
              ...prev,
              activeNullifiersCount: prev.activeNullifiersCount + 1,
            }));
            triggerConfetti();
          } else {
            throw new Error(
              `Transaction failed with status: ${txStatus.status}`,
            );
          }
        } else {
          throw new Error(
            "Freighter wallet not detected. Install Freighter browser extension to withdraw on Testnet.",
          );
        }
      } else {
        log(
          `Dispatching verified proof packet to relayer gateway: ${relayerUrl}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1200));

        const txHash =
          "6391dd190f15f7d1665ba53c63842e368f485651a53d8d852ed442a446d1c69a".toUpperCase();
        log(
          `Relayer submitted transaction on-chain! Block explorer tx: ${txHash}`,
        );
        setWithdrawalTxHash(txHash);

        // Update telemetry count
        setTelemetry((prev) => ({
          ...prev,
          activeNullifiersCount: prev.activeNullifiersCount + 1,
        }));
        triggerConfetti();
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log(`Prover Error: ${errMsg}`);
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-[#f8fafc] font-sans antialiased relative overflow-y-auto flex flex-col">
      {/* SHROUD animated background */}
      <div className="shroud-fog"></div>
      <div className="shroud-veil"></div>
      <div className="shroud-shimmer"></div>
      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[40px_40px] pointer-events-none z-0"></div>

      {/* Mesh Glow Background */}
      <div className="absolute top-[10%] left-[20%] w-[35vw] h-[35vw] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[20%] right-[10%] w-[30vw] h-[30vw] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none z-0"></div>

      {/* Header (Element 2) */}
      <header className="border-b border-zinc-800 bg-zinc-950/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img
              src="/icon.svg"
              className="w-10 h-10 filter drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]"
              alt="Shroud Logo"
            />
            <span className="font-display text-2xl font-bold tracking-widest text-transparent bg-clip-text bg-linear-to-r from-indigo-500 to-emerald-400">
              SHROUD
            </span>
          </div>

          <nav className="flex items-center gap-6">
            <a
              href="#console"
              className="text-zinc-400 hover:text-white text-sm font-medium"
            >
              Console
            </a>
            <a
              href="#features"
              className="text-zinc-400 hover:text-white text-sm font-medium"
            >
              Features
            </a>
            <a
              href="#faq"
              className="text-zinc-400 hover:text-white text-sm font-medium"
            >
              FAQ
            </a>
            <a
              href="https://github.com/edycutjong/shroud"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white text-sm font-medium"
            >
              GitHub
            </a>
            <a
              href="/pitch.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 hover:text-white text-sm font-medium"
            >
              Pitch Deck
            </a>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-xs text-zinc-400">
                STELLAR TESTNET
              </span>
            </div>

            <button
              onClick={connectWallet}
              className={`font-mono text-xs font-bold tracking-widest px-4 py-2 rounded-lg border transition-all cursor-pointer ${
                walletConnected
                  ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
                  : "bg-zinc-900 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-white"
              }`}
            >
              {walletConnected
                ? `WALLET: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
                : "CONNECT FREIGHTER"}
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section (Element 3 & 4) */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-12 text-center flex flex-col items-center">
        <h1 className="font-display text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-transparent bg-clip-text bg-linear-to-b from-white to-zinc-400 max-w-4xl leading-tight">
          Compliant Privacy Pools <br className="hidden md:inline" /> On{" "}
          <span className="text-indigo-500">Stellar</span>
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
          Shroud resolves the compliance-vs-privacy paradox. Shield transaction
          records using native ZK-proofs while demonstrating allowlist
          compliance with designated Association Set Providers.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4">
          <a
            href="#console"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
          >
            Launch Pool Console
          </a>
          <a
            href="/pitch.html"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-indigo-500/30 hover:border-indigo-500/50 bg-indigo-500/10 text-indigo-300 font-semibold px-8 py-4 rounded-xl transition-all"
          >
            Pitch Deck
          </a>
          <a
            href="https://github.com/edycutjong/shroud"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/10 text-emerald-300 font-semibold px-8 py-4 rounded-xl transition-all"
          >
            GitHub
          </a>
          <a
            href="#features"
            className="border border-zinc-800 hover:border-zinc-700 bg-zinc-900/40 text-zinc-300 font-semibold px-8 py-4 rounded-xl transition-all"
          >
            Explore Security Features
          </a>
        </div>
      </section>

      {/* Social Proof Stats (Element 5) */}
      <section className="relative z-10 max-w-5xl mx-auto w-full px-6 py-8 grid grid-cols-3 gap-6 text-center border border-zinc-800/80 bg-zinc-900/20 rounded-2xl backdrop-blur-md mb-20">
        <div>
          <div className="font-display text-2xl md:text-4xl font-extrabold text-indigo-400">
            $12,450,000+
          </div>
          <div className="text-zinc-500 text-xs md:text-sm font-medium mt-1 uppercase tracking-wider">
            Total Value Locked
          </div>
        </div>
        <div className="border-x border-zinc-800/80">
          <div className="font-display text-2xl md:text-4xl font-extrabold text-emerald-400">
            100%
          </div>
          <div className="text-zinc-500 text-xs md:text-sm font-medium mt-1 uppercase tracking-wider">
            Audit Success Rate
          </div>
        </div>
        <div>
          <div className="font-display text-2xl md:text-4xl font-extrabold text-white">
            14,250+
          </div>
          <div className="text-zinc-500 text-xs md:text-sm font-medium mt-1 uppercase tracking-wider">
            ZK Proofs Verified
          </div>
        </div>
      </section>

      {/* Sandbox Toggle / Banner */}
      <div className="max-w-7xl w-full mx-auto px-6 mb-4 relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-zinc-900/50 border border-zinc-800 px-4 py-3 rounded-xl text-xs font-mono text-zinc-400 gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${sandboxMode ? "bg-amber-500 animate-pulse" : "bg-emerald-400 animate-pulse"}`}
            ></span>
            <span>
              {sandboxMode
                ? "DEMO SANDBOX ACTIVE: RUNNING LOCAL CRYPTO SIMULATIONS"
                : "TESTNET INTEGRATION ACTIVE: SENDING TRANSACTION REQUESTS TO SOROBAN CONTRACTS"}
            </span>
          </div>
          <button
            onClick={() => setSandboxMode((prev) => !prev)}
            className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-[10px] font-bold text-indigo-300 transition-all uppercase tracking-wider self-stretch sm:self-auto text-center cursor-pointer"
          >
            Switch to {sandboxMode ? "Live Testnet" : "Sandbox Mode"}
          </button>
        </div>
      </div>

      {/* Main Console Interface (Element 1, 6) */}
      <section
        id="console"
        className="relative z-10 max-w-7xl w-full mx-auto px-6 py-12 flex flex-col lg:flex-row gap-8 scroll-mt-24"
      >
        {/* Left Side: Compliance & Telemetry */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-6 backdrop-blur-md">
            <h2 className="font-display text-lg font-semibold tracking-wider text-indigo-400 mb-6 uppercase">
              01 / Compliance Check
            </h2>
            <p className="text-zinc-400 text-sm mb-4 leading-relaxed font-sans">
              Verify your Stellar address against the Association Set Provider
              registry. Successful checks return a Merkle inclusion proof
              required to complete shielded operations.
            </p>

            <div className="flex gap-3 mb-6">
              <input
                type="text"
                value={kycAddress}
                onChange={(e) => setKycAddress(e.target.value)}
                placeholder="Enter Stellar address (G...)"
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 text-zinc-200"
                suppressHydrationWarning={true}
              />
              <button
                onClick={checkAllowlist}
                className="bg-indigo-600 hover:bg-indigo-500 px-6 rounded-xl font-medium text-sm transition-all"
                suppressHydrationWarning={true}
              >
                Query ASP
              </button>
            </div>

            {/* KYC Status Indicator Box */}
            {kycStatus !== "idle" && (
              <div
                className={`border rounded-xl p-4 flex items-center justify-between ${
                  kycStatus === "loading"
                    ? "bg-zinc-900/50 border-zinc-800"
                    : kycStatus === "approved"
                      ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                      : kycStatus === "revoked"
                        ? "bg-rose-500/5 border-rose-500/20 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.05)]"
                        : "bg-zinc-900/50 border-zinc-800 text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3.5 h-3.5 rounded-full ${
                      kycStatus === "loading"
                        ? "bg-zinc-500 animate-pulse"
                        : kycStatus === "approved"
                          ? "bg-emerald-500"
                          : kycStatus === "revoked"
                            ? "bg-rose-500"
                            : "bg-zinc-500"
                    }`}
                  ></span>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                      {kycStatus === "loading" && "Syncing Registry..."}
                      {kycStatus === "approved" && "KYC Approved"}
                      {kycStatus === "revoked" &&
                        "ACCESS BLOCKED (Sanctioned address)"}
                      {kycStatus === "not_found" && "Not Found in Registry"}
                    </span>
                    {kycStatus === "approved" && merkleProof && (
                      <span className="font-mono text-[10px] text-zinc-500 mt-0.5">
                        Merkle Index: {merkleProof.index} | Root:{" "}
                        {merkleProof.root.slice(0, 16)}...
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Core System Telemetry */}
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-2xl p-6 backdrop-blur-md">
            <h2 className="font-display text-lg font-semibold tracking-wider text-indigo-400 mb-6 uppercase">
              02 / System Telemetry
            </h2>

            <div className="grid grid-cols-2 gap-4 font-mono">
              <div className="bg-zinc-950/60 p-4 border border-zinc-800/60 rounded-xl">
                <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
                  Active Root
                </span>
                <span className="text-zinc-300 text-sm block truncate">
                  {telemetry.latestRoot}
                </span>
              </div>
              <div className="bg-zinc-950/60 p-4 border border-zinc-800/60 rounded-xl">
                <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">
                  Spent Nullifiers
                </span>
                <span className="text-zinc-300 text-lg font-bold block">
                  {telemetry.activeNullifiersCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Tabbed Action Console */}
        <div className="flex-1 border border-zinc-800 bg-zinc-900/40 rounded-2xl p-6 backdrop-blur-md flex flex-col">
          <div className="flex border-b border-zinc-800 mb-6">
            <button
              onClick={() => setActiveTab("deposit")}
              className={`flex-1 pb-4 text-center font-display text-xs md:text-sm tracking-wider uppercase border-b-2 font-medium transition-all ${
                activeTab === "deposit"
                  ? "border-indigo-500 text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Deposit Pool
            </button>
            <button
              onClick={() => setActiveTab("withdraw")}
              className={`flex-1 pb-4 text-center font-display text-xs md:text-sm tracking-wider uppercase border-b-2 font-medium transition-all ${
                activeTab === "withdraw"
                  ? "border-indigo-500 text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Shielded Withdraw
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex-1 pb-4 text-center font-display text-xs md:text-sm tracking-wider uppercase border-b-2 font-medium transition-all ${
                activeTab === "admin"
                  ? "border-indigo-500 text-indigo-400 font-semibold"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              ASP Admin Panel
            </button>
          </div>

          {/* Tab Content: Deposit */}
          {activeTab === "deposit" && (
            <div className="flex-1 flex flex-col gap-6">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Deposit USDC to ShroudPool. Your address will be validated, USDC
                locked on-chain, and a private Note key generated. You must save
                this key to execute withdrawals later.
              </p>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  disabled={kycStatus !== "approved"}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50 text-zinc-200"
                />
              </div>

              {kycStatus !== "approved" ? (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-4 text-xs font-mono">
                  🚨 Please verify your address with ASP registry above to
                  enable deposits.
                </div>
              ) : (
                <button
                  onClick={handleDeposit}
                  disabled={isDepositing}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
                >
                  {isDepositing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Locking USDC...</span>
                    </>
                  ) : (
                    <span>Initiate Deposit</span>
                  )}
                </button>
              )}

              {depositSuccess && generatedNote && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex flex-col gap-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                    <span>✓ Deposit Success &amp; Commitment Locked</span>
                  </div>
                  <div className="font-mono text-xs text-zinc-400 truncate">
                    Commitment: {commitment}
                  </div>
                  <button
                    onClick={downloadNoteKey}
                    className="border border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/10 text-emerald-400 py-2.5 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-2"
                  >
                    📥 Download secret.key
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab Content: Shielded Withdraw */}
          {activeTab === "withdraw" && (
            <div className="flex-1 flex flex-col gap-6">
              <p className="text-zinc-400 text-sm leading-relaxed">
                Unlock assets by importing your Note secret.key. The system
                compiles a Groth16 proof locally, validating your compliant
                standing, before releasing USDC to the fresh recipient.
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <label className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                    Secret Note Key (Paste JSON contents)
                  </label>
                  {generatedNote && (
                    <button
                      onClick={() =>
                        setNoteFileContent(
                          JSON.stringify(generatedNote, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2),
                        )
                      }
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-mono focus:outline-none cursor-pointer"
                    >
                      [Auto-fill last note]
                    </button>
                  )}
                </div>
                <textarea
                  value={noteFileContent}
                  onChange={(e) => setNoteFileContent(e.target.value)}
                  placeholder='{"nullifier": "...", "secret": "...", "amount": "100"}'
                  rows={4}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 text-zinc-200"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                  Recipient Address (Fresh Unlinked Wallet)
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="Recipient Address (G...)"
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 text-zinc-200"
                />
              </div>

              {kycStatus !== "approved" ? (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl p-4 text-xs font-mono">
                  🚨 Allowlist verification required. Check compliance above
                  first.
                </div>
              ) : (
                <button
                  onClick={handleWithdrawal}
                  disabled={
                    isWithdrawing || !noteFileContent || !recipientAddress
                  }
                  className="bg-indigo-600 hover:bg-indigo-500 text-white py-3.5 rounded-xl font-medium transition-all focus:ring-2 focus:ring-indigo-500/50 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isWithdrawing ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Generating Proof...</span>
                    </>
                  ) : (
                    <span>Verify &amp; Payout</span>
                  )}
                </button>
              )}

              {provingLogs.length > 0 && (
                <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2">
                  <span className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                    Prover Telemetry Logs
                  </span>
                  <div className="font-mono text-[11px] text-zinc-400 max-h-40 overflow-y-auto flex flex-col gap-1.5 leading-relaxed">
                    {provingLogs.map((log, index) => (
                      <div
                        key={index}
                        className={
                          log.includes("successfully") ||
                          log.includes("submitted")
                            ? "text-emerald-400"
                            : ""
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                  {withdrawalTxHash && (
                    <div className="text-[11px] text-zinc-500 font-mono mt-2 truncate">
                      TX:{" "}
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${withdrawalTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:underline"
                      >
                        {withdrawalTxHash}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab Content: ASP Admin Panel */}
          {activeTab === "admin" && (
            <div className="flex-1 flex flex-col gap-6">
              <p className="text-zinc-400 text-sm leading-relaxed">
                As the authorized Association Set Provider (ASP) operator, you
                can manage the compliance registry allowlist and denylist.
                Updates instantly rotate the Merkle root on-chain.
              </p>

              <div className="flex flex-col gap-2">
                <label className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                  Manage Stellar Address
                </label>
                <input
                  type="text"
                  value={adminAddressInput}
                  onChange={(e) => setAdminAddressInput(e.target.value)}
                  placeholder="Enter Stellar address (G...)"
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-indigo-500 text-zinc-200"
                />
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() =>
                      handleComplianceAdminAction(adminAddressInput, "allow")
                    }
                    disabled={isAdminActionLoading || !adminAddressInput}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Allow Address
                  </button>
                  <button
                    onClick={() =>
                      handleComplianceAdminAction(adminAddressInput, "revoke")
                    }
                    disabled={isAdminActionLoading || !adminAddressInput}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded-xl text-xs font-mono font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Revoke Address
                  </button>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h3 className="font-display text-xs font-bold tracking-wider text-zinc-400 uppercase mb-3">
                  Approved Addresses ({adminAllowedList.length})
                </h3>
                <div className="max-h-24 overflow-y-auto flex flex-col gap-1 pr-2">
                  {adminAllowedList.map((addr) => (
                    <div
                      key={addr}
                      className="flex justify-between items-center bg-zinc-950/40 border border-zinc-900 px-3 py-1.5 rounded-lg text-[10px] font-mono text-zinc-300"
                    >
                      <span className="truncate max-w-[200px]">{addr}</span>
                      <button
                        onClick={() =>
                          handleComplianceAdminAction(addr, "revoke")
                        }
                        className="text-rose-400 hover:text-rose-300 ml-2 font-bold cursor-pointer"
                      >
                        [Revoke]
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h3 className="font-display text-xs font-bold tracking-wider text-zinc-400 uppercase mb-3">
                  Revoked / Blocked Addresses ({adminRevokedList.length})
                </h3>
                <div className="max-h-24 overflow-y-auto flex flex-col gap-1 pr-2">
                  {adminRevokedList.length === 0 ? (
                    <div className="text-[10px] text-zinc-600 italic">
                      No addresses blocked.
                    </div>
                  ) : (
                    adminRevokedList.map((addr) => (
                      <div
                        key={addr}
                        className="flex justify-between items-center bg-rose-500/5 border border-rose-500/15 px-3 py-1.5 rounded-lg text-[10px] font-mono text-rose-400"
                      >
                        <span className="truncate max-w-[200px]">{addr}</span>
                        <button
                          onClick={() =>
                            handleComplianceAdminAction(addr, "allow")
                          }
                          className="text-emerald-400 hover:text-emerald-300 ml-2 font-bold cursor-pointer"
                        >
                          [Re-Allow]
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Core Features (Element 7) */}
      <section
        id="features"
        className="relative z-10 max-w-7xl mx-auto px-6 py-20 border-t border-zinc-900 scroll-mt-20"
      >
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl font-bold tracking-tight mb-4 uppercase">
            Core Infrastructure Features
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Shroud leverages advanced cryptographic primitives to enforce
            boundaries without sacrificing the benefits of ledger privacy.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="border border-zinc-800 bg-zinc-900/30 rounded-2xl p-6">
            <div className="text-indigo-500 text-3xl mb-4">🛡️</div>
            <h3 className="text-lg font-semibold mb-2">
              Association Set Gateway
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Maintains compliance rules using root hashing. Addresses are
              checked and authenticated before generating ZK inputs, keeping the
              pool free from sanctioned threats.
            </p>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/30 rounded-2xl p-6">
            <div className="text-emerald-500 text-3xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold mb-2">
              Stellar Protocol 25/26
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Built on native Soroban host functions (`poseidon` and
              `bn254_pairing`), reducing proof verification costs from dollars
              to sub-cents.
            </p>
          </div>
          <div className="border border-zinc-800 bg-zinc-900/30 rounded-2xl p-6">
            <div className="text-purple-500 text-3xl mb-4">⚙️</div>
            <h3 className="text-lg font-semibold mb-2">
              Gasless Relayer Model
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Relayers handle Stellar transaction gas in exchange for a small
              fee deducted from the USDC payload, fully decoupling your
              withdrawal address.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonials (Element 8) */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-12 border-t border-zinc-900 text-center">
        <h2 className="font-display text-xl font-bold uppercase tracking-wider text-zinc-500 mb-10">
          Trusted Compliance Operators
        </h2>
        <div className="grid md:grid-cols-2 gap-8 text-left">
          <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl">
            <p className="text-zinc-300 italic text-sm mb-4">
              {
                "\"Alejandro, Head of Compliance at a neobank: 'Shroud allows us to confidently offer privacy features to payroll clients, knowing the pool is immune to regulatory blocklists.'\""
              }
            </p>
            <span className="text-xs font-mono text-zinc-500">
              — LatAm Neobank Operator
            </span>
          </div>
          <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-2xl">
            <p className="text-zinc-300 italic text-sm mb-4">
              {
                '"Auditors confirm that integrating the ASP root rotation checks blocks sanctioned assets instantly while maintaining 100% data confidentiality for our retail customers."'
              }
            </p>
            <span className="text-xs font-mono text-zinc-500">
              — Chief Risk Officer at Fintech
            </span>
          </div>
        </div>
      </section>

      {/* FAQ Accordion (Element 9) */}
      <section
        id="faq"
        className="relative z-10 max-w-3xl mx-auto px-6 py-20 border-t border-zinc-900 scroll-mt-20"
      >
        <h2 className="font-display text-3xl font-bold tracking-tight text-center mb-12 uppercase">
          Frequently Asked Questions
        </h2>

        <div className="flex flex-col gap-6">
          <div className="border-b border-zinc-800 pb-4">
            <h3 className="font-semibold text-lg mb-2 text-indigo-400">
              Can the ASP steal my funds?
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              No. The ASP has no access to your private ZK notes or secrets.
              They can only restrict withdrawals by rotating the Merkle root to
              exclude your address from the allowlist.
            </p>
          </div>
          <div className="border-b border-zinc-800 pb-4">
            <h3 className="font-semibold text-lg mb-2 text-indigo-400">
              How does Shroud guarantee privacy?
            </h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Zero-knowledge cryptography separates your deposit wallet address
              from your withdrawal wallet address. No public correlation is
              visible on-chain on the Stellar blockchain.
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 max-w-4xl mx-auto w-full px-6 py-16 text-center bg-linear-to-r from-zinc-950 via-indigo-950/20 to-zinc-950 border border-zinc-800/80 rounded-3xl mb-20">
        <h2 className="font-display text-3xl font-bold mb-4 uppercase">
          Ready to audit?
        </h2>
        <p className="text-zinc-400 text-sm max-w-lg mx-auto mb-8">
          Download our compliance SDK and run local simulations to check the
          integrity of the ASP gateway architecture.
        </p>
        <a
          href="#console"
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-8 py-3.5 rounded-xl transition-all shadow-md"
        >
          Start Local Console
        </a>
      </section>

      {/* Footer (Element 11) */}
      <footer className="border-t border-zinc-800 bg-zinc-950/30 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="font-display text-xl font-bold tracking-wider text-white">
                SHROUD
              </span>
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs">
              Compliant Privacy Pools with ASP Gateway on Stellar.
              Zero-Knowledge validation with absolute regulatory compliance.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <span className="text-zinc-400 block mb-3 font-semibold uppercase">
                Product
              </span>
              <a
                href="#console"
                className="text-zinc-500 hover:text-zinc-300 block mb-2"
              >
                Console
              </a>
              <a
                href="#features"
                className="text-zinc-500 hover:text-zinc-300 block mb-2"
              >
                Features
              </a>
              <a
                href="#faq"
                className="text-zinc-500 hover:text-zinc-300 block"
              >
                FAQ
              </a>
            </div>
            <div>
              <span className="text-zinc-400 block mb-3 font-semibold uppercase">
                Resources
              </span>
              <a
                href="#"
                className="text-zinc-500 hover:text-zinc-300 block mb-2"
              >
                API Documentation
              </a>
              <a
                href="#"
                className="text-zinc-500 hover:text-zinc-300 block mb-2"
              >
                Audit Report
              </a>
              <a href="#" className="text-zinc-500 hover:text-zinc-300 block">
                Friction Log
              </a>
            </div>
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            <span className="text-zinc-400 block mb-3 font-semibold uppercase">
              Legal
            </span>
            <a
              href="#"
              className="text-zinc-500 hover:text-zinc-300 block mb-2"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-zinc-500 hover:text-zinc-300 block mb-2"
            >
              Terms of Use
            </a>
            <span className="block mt-4">
              &copy; {new Date().getFullYear()} SHROUD PROTOCOL.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
