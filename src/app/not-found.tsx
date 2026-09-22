import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <p className="display text-5xl font-extrabold text-accent">Snuffed.</p>
      <p className="mt-3 text-muted">That page isn&apos;t part of this season.</p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2 font-semibold text-accent-ink">Back to the leaderboard</Link>
    </div>
  );
}
