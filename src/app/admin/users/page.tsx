import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { inputCls } from "@/components/styles";
import { Card, PageTitle, Pill } from "@/components/ui";
import { store } from "@/server";
import { resetUserPasswordAction, setUserAdminAction } from "@/server/actions";
import { MIN_PASSWORD_LENGTH } from "@/server/session";

export const metadata = { title: "Site accounts" };

export default async function SiteUsers() {
  const users = await store().listUsers();
  return (
    <AdminShell>
      <PageTitle eyebrow="Commissioner" title="Site accounts">
        Everyone who has signed up, across every season. To put someone on a team, go to that season&apos;s Members
        page and assign their username there. If someone forgets their password, reset it here and give them the
        temporary one. <Link href="/admin" className="text-accent hover:underline">← Seasons</Link>
      </PageTitle>
      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Nobody has signed up yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {users.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold">
                  {u.username}
                  {u.isAdmin ? <Pill tone="accent">Admin</Pill> : null}
                </span>
                <ActionForm
                  action={setUserAdminAction}
                  submit={u.isAdmin ? "Remove admin" : "Make admin"}
                  ghost
                  className="contents"
                  confirm={u.isAdmin ? `Remove ${u.username}'s admin access?` : `Give ${u.username} full admin access? They'll be able to create, edit and delete any season.`}
                >
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="on" value={u.isAdmin ? "false" : "true"} />
                </ActionForm>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-medium text-muted hover:text-ink">Reset password</summary>
                <ActionForm
                  action={resetUserPasswordAction}
                  submit="Reset password"
                  ghost
                  resetOnSuccess
                  className="mt-2 grid gap-2"
                  confirm={`Reset ${u.username}'s password? They'll be signed out on every device until they sign in with the new one.`}
                >
                  <input type="hidden" name="userId" value={u.id} />
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                    placeholder={`New temporary password (at least ${MIN_PASSWORD_LENGTH} characters)`}
                    aria-label={`New temporary password for ${u.username}`}
                    className={inputCls}
                  />
                </ActionForm>
              </details>
            </Card>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
