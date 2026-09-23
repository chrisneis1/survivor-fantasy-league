import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { inputCls } from "@/components/styles";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getSeason } from "@/data";
import { store } from "@/server";
import { assignUserAction, setCommissionerAction, unassignUserAction } from "@/server/actions";
import { getAccess } from "@/server/auth";

export const metadata = { title: "Members" };

export default async function Members({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const access = await getAccess(season.id);
  const [members, wagered, commissioners] = await Promise.all([
    store().membersOf(season.id),
    season.wagerState !== "OFF" ? store().wagerPlacedBy(season.id) : Promise.resolve(new Set<string>()),
    store().commissioners(season.id),
  ]);

  return (
    <AdminShell season={season} active="/members">
      <PageTitle eyebrow="Commissioner" title="Members">
        Teams are normally added in Setup by picking who&apos;s playing from everyone who has signed up, which signs
        them in as their team right away. Use this page for corrections — reassigning a team to a different account,
        or granting commissioner access.
      </PageTitle>
      {season.teams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Add teams in Setup first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {season.teams.map((t) => {
            const occupant = members.get(t.id);
            return (
              <Card key={t.id} className="p-4">
                <p className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-semibold">{t.member}</span>
                    <span className="block text-sm text-muted">{t.name}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Pill tone={occupant ? "good" : "neutral"}>{occupant ? occupant.username : "Unassigned"}</Pill>
                    {commissioners.has(t.id) ? <Pill tone="accent">Commissioner</Pill> : null}
                    {season.wagerState !== "OFF" ? <Pill tone={wagered.has(t.id) ? "good" : "neutral"}>{wagered.has(t.id) ? "Wager placed" : "No wager yet"}</Pill> : null}
                  </span>
                </p>
                <ActionForm action={assignUserAction} submit={occupant ? "Reassign" : "Assign"} ghost={!!occupant} className="mt-3 flex flex-wrap items-end gap-2" resetOnSuccess>
                  <input type="hidden" name="seasonId" value={season.id} />
                  <input type="hidden" name="teamId" value={t.id} />
                  <Field label="Their first name"><input name="username" placeholder={occupant?.username ?? "e.g. Shane"} required className={`${inputCls} max-w-48`} /></Field>
                </ActionForm>
                {occupant ? (
                  <ActionForm action={unassignUserAction} submit="Unassign" ghost className="mt-2 contents" confirm={`Unassign ${occupant.username} from ${t.member}'s team? They'll no longer be able to sign in as this team.`}>
                    <input type="hidden" name="seasonId" value={season.id} />
                    <input type="hidden" name="teamId" value={t.id} />
                  </ActionForm>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {access?.kind === "admin" ? (
                    <ActionForm
                      action={setCommissionerAction}
                      submit={commissioners.has(t.id) ? "Remove commissioner access" : "Make commissioner"}
                      ghost
                      className="contents"
                      confirm={
                        commissioners.has(t.id)
                          ? `Remove ${t.member}'s commissioner access?`
                          : `Give ${t.member} commissioner access? Whoever is assigned to this team will be able to run this whole season — scoring, setup, assigning everyone else — from their own sign-in.`
                      }
                    >
                      <input type="hidden" name="seasonId" value={season.id} />
                      <input type="hidden" name="teamId" value={t.id} />
                      <input type="hidden" name="on" value={commissioners.has(t.id) ? "false" : "true"} />
                    </ActionForm>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="mt-6 text-sm text-muted">
        Assigning a new account to a team immediately takes over from whoever was there before. An account can only run one team per season, so assigning someone here frees up any other team they held in {season.name}.
        {access?.kind === "admin" ? " Only the admin login can grant or remove commissioner access." : ""}
      </p>
    </AdminShell>
  );
}
