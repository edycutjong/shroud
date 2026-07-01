import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex-1 flex flex-col items-center justify-center bg-zinc-950 text-center px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-indigo-400 mb-6 uppercase">
        Shroud Protocol
      </p>
      <h1 className="font-display text-8xl md:text-9xl font-extrabold text-transparent bg-clip-text bg-linear-to-b from-white to-zinc-600 leading-none">
        404
      </h1>
      <p className="text-zinc-400 mt-6 mb-10 max-w-md">
        This route has been shrouded from view — the page you&rsquo;re looking
        for doesn&rsquo;t exist or has moved.
      </p>
      <Link
        href="/"
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20"
      >
        Return to the Pool Console
      </Link>
    </main>
  );
}
