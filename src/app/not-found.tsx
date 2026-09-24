import Link from "next/link";
import { TorchMark } from "@/components/icons";
import { btnCls } from "@/components/styles";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-24 text-center">
      <TorchMark size={56} className="grayscale" />
      <p className="display mt-5 text-6xl font-extrabold uppercase text-accent">Snuffed.</p>
      <p className="mt-2 text-ink-2">That page isn&apos;t part of this season — the tribe has spoken.</p>
      <Link href="/" className={`${btnCls} mt-6`}>Back to the league</Link>
    </main>
  );
}
