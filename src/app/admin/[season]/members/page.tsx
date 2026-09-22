import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getSeason } from "@/data";
import { store } from "@/server";
import { createInviteAction, setCommissionerAction } from "@/server/actions";
import { getAccess } from "@/server/auth";

export const metadata = { title: "Members" };

export default async function Members({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const access = await getAccess(season.id);
  const [invited, wagered, commissioners] = await Promise.all([
    store().invitedTeams(season.id),
    season.wagerState !== "OFF" ? store().wagerPlacedBy(season.id) : Promise.resolve(new Set<string>()),
    store().commissioners(season.id),
  ]);

  return (
    <AdminShell season={season} active="/members">
      <PageTitle eyebrow="Commissioner" title="Members">
        Each team owner signs in with a personal link. Create one, copy it or click Email it to send it from your own email app; the site sends nothing itself.
      </PageTitle>
      {season.teams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Add teams in Setup first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {season.teams.map((t) => (
            <Card key={t.id} className="p-4">
              <p className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{t.member}</span>
                  <span className="block text-sm text-muted">{t.name}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Pill tone={invited.has(t.id) ? "good" : "neutral"}>{invited.has(t.id) ? "Link issued" : "No link yet"}</Pill>
                  {commissioners.has(t.id) ? <Pill tone="accent">Commissioner</Pill> : null}
                  {season.wagerState !== "OFF" ? <Pill tone={wagered.has(t.id) ? "good" : "neutral"}>{wagered.has(t.id) ? "Wager placed" : "No wager yet"}</Pill> : null}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm
                  action={createInviteAction}
                  submit={invited.has(t.id) ? "Make a new link" : "Create link"}
                  ghost={invited.has(t.id)}
                  confirm={invited.has(t.id) ? `Make a new link for ${t.member}? Their current link and any device signed in with it will stop working.` : undefined}
                  className="contents"
                >
                  <input type="hidden" name="seasonId" value={season.id} />
                  <input type="hidden" name="teamId" value={t.id} />
                </ActionForm>
                {access?.kind === "admin" ? (
                  <ActionForm
                    action={setCommissionerAction}
                    submit={commissioners.has(t.id) ? "Remove commissioner access" : "Make commissioner"}
                    ghost
                    className="contents"
                    confirm={
                      commissioners.has(t.id)
                        ? `Remove ${t.member}'s commissioner access?`
                        : `Give ${t.member} commissioner access? They'll be able to run this whole season — scoring, setup, everyone's links — from their own personal link.`
                    }
                  >
                    <input type="hidden" name="seasonId" value={season.id} />
                    <input type="hidden" name="teamId" value={t.id} />
                    <input type="hidden" name="on" value={commissioners.has(t.id) ? "false" : "true"} />
                  </ActionForm>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">
        A link signs someone in as that team on their device for about six months. Making a new link revokes the old one immediately. The link is shown only once and only its fingerprint is stored, so if it&apos;s lost, make a new one.
        {access?.kind === "admin" ? " Only the admin login can grant or remove commissioner access." : ""}
      </p>
    </AdminShell>
  );
}
