import { notFound } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { inputCls } from "@/components/styles";
import { Card, PageTitle, Pill } from "@/components/ui";
import { getSeason } from "@/data";
import { slug } from "@/domain/setup";
import { store } from "@/server";
import { setCommissionerAction, setCredentialAction } from "@/server/actions";
import { getAccess } from "@/server/auth";

export const metadata = { title: "Members" };

export default async function Members({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  const access = await getAccess(season.id);
  const [credentials, wagered, commissioners] = await Promise.all([
    store().credentials(season.id),
    season.wagerState !== "OFF" ? store().wagerPlacedBy(season.id) : Promise.resolve(new Set<string>()),
    store().commissioners(season.id),
  ]);

  return (
    <AdminShell season={season} active="/members">
      <PageTitle eyebrow="Commissioner" title="Members">
        Each team owner signs in with a username and password you set here. Set or change one below, then copy it or click Email it to send it from your own email app; the site sends nothing itself.
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
                  <Pill tone={credentials.has(t.id) ? "good" : "neutral"}>{credentials.has(t.id) ? `Login: ${credentials.get(t.id)}` : "No login yet"}</Pill>
                  {commissioners.has(t.id) ? <Pill tone="accent">Commissioner</Pill> : null}
                  {season.wagerState !== "OFF" ? <Pill tone={wagered.has(t.id) ? "good" : "neutral"}>{wagered.has(t.id) ? "Wager placed" : "No wager yet"}</Pill> : null}
                </span>
              </p>
              <ActionForm
                action={setCredentialAction}
                submit={credentials.has(t.id) ? "Change login" : "Set login"}
                ghost={credentials.has(t.id)}
                confirm={credentials.has(t.id) ? `Change ${t.member}'s login? Their current one and any device signed in with it will stop working.` : undefined}
                className="mt-3 grid gap-2"
              >
                <input type="hidden" name="seasonId" value={season.id} />
                <input type="hidden" name="teamId" value={t.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Username"><input name="username" defaultValue={credentials.get(t.id) ?? slug(t.member)} required className={inputCls} /></Field>
                  <Field label="Password" hint="At least 4 characters."><input name="password" type="text" minLength={4} required className={inputCls} /></Field>
                </div>
              </ActionForm>
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
                        : `Give ${t.member} commissioner access? They'll be able to run this whole season — scoring, setup, everyone's logins — from their own sign-in.`
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
        Signing in keeps someone signed in as that team on their device for about six months. Changing a login immediately signs out any device using the old one. Only the password&apos;s hash is stored, so if it&apos;s lost, just set a new one.
        {access?.kind === "admin" ? " Only the admin login can grant or remove commissioner access." : ""}
      </p>
    </AdminShell>
  );
}
