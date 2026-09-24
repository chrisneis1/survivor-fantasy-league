import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getSeason } from "@/data";

// Checked here, outside the loading.tsx boundary, so an unknown season gets a real 404 status. A page's own
// notFound() runs after the loading skeleton has started streaming, when the status is already 200.
export default async function SeasonLayout({ children, params }: { children: ReactNode; params: Promise<{ season: string }> }) {
  if (!(await getSeason((await params).season))) notFound();
  return children;
}
