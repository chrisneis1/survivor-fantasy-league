import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { getSeason } from "@/data";
import { store } from "@/server";

export const metadata = { title: "Audit log" };

const short = (v: unknown) => {
  if (v === undefined) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};

export default async function Audit({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const rows = await store().audit(season.id);
  return (
    <AdminShell season={season} active="/audit">
      <PageHeader eyebrow="Commissioner" title="Audit log">
        Every setup change, publish, correction and roster entry, newest first. Nothing here can be edited.
      </PageHeader>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Nothing has been logged for this season yet.</p>
      ) : (
        <Card className="overflow-hidden">
          <ol>
            {rows.map((r) => (
              <li key={r.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={r.action === "CORRECT" ? "bad" : r.action === "PUBLISH" ? "good" : "neutral"}>{r.action}</StatusBadge>
                  <span className="font-semibold">{r.entityType} · {r.entityId}</span>
                  <span className="text-xs text-muted">
                    {r.actor} · {new Date(r.at).toLocaleString("en-US", { timeZone: season.config.timezone, dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </div>
                {short(r.before) || short(r.after) ? (
                  <p className="mt-1 break-words text-xs text-muted">
                    {short(r.before) ? <>before: {short(r.before)} </> : null}
                    {short(r.after) ? <>after: {short(r.after)}</> : null}
                  </p>
                ) : null}
                {r.reason ? <p className="mt-1 text-sm">Reason: {r.reason}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </AdminShell>
  );
}
