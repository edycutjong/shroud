import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use — Shroud",
};

export default function TermsOfUse() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-300 px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="font-mono text-xs tracking-widest text-indigo-400 hover:text-indigo-300 uppercase"
        >
          ← Shroud Protocol
        </Link>
        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white mt-6 mb-2">
          Terms of Use
        </h1>
        <p className="text-zinc-500 text-sm mb-10">
          Last updated: July 1, 2026
        </p>

        <div className="space-y-8 leading-relaxed text-zinc-400">
          <p>
            By using Shroud you agree to these terms. If you do not agree,
            please do not use the app.
          </p>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              Demonstration software
            </h2>
            <p>
              Shroud is an experimental demo built for a hackathon and operates
              on the Stellar test network. It is not a production financial
              product or service.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              Testnet only — no real value
            </h2>
            <p>
              All activity occurs on Stellar Testnet. Tokens and balances have
              no monetary value and cannot be redeemed for anything.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              No warranty
            </h2>
            <p>
              The app is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo;, without warranties of any kind. We do not
              guarantee it is error-free, secure, or continuously available.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              Not financial or legal advice
            </h2>
            <p>
              Nothing here constitutes financial, legal, or compliance advice.
              The compliance features are demonstrations of a technical pattern,
              not a regulated service.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              Your responsibility
            </h2>
            <p>
              You are solely responsible for your wallet, keys, and any
              transactions you sign. To the maximum extent permitted by law, the
              authors are not liable for any damages arising from use of the
              app.
            </p>
          </section>

          <section>
            <h2 className="text-white font-semibold text-lg mb-2">
              Open source
            </h2>
            <p>
              Source code is available in the{" "}
              <a
                href="https://github.com/edycutjong/shroud"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300"
              >
                project repository
              </a>{" "}
              under its stated license.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
