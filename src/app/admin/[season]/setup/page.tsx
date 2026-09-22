import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { getSeason } from "@/data";
import { SetupBody } from "./setup-body";

export const metadata = { title: "Season setup" };

export default async function Setup({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  return (
    <AdminShell season={season} active="/setup">
      <SetupBody season={season} />
    </AdminShell>
  );
}
