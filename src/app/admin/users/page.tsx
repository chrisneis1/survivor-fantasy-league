import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AdminShell } from "@/components/admin-shell";
import { Card, PageTitle, Pill } from "@/components/ui";
import { store } from "@/server";
import { setUserAdminAction } from "@/server/actions";

export const metadata = { title: "Site accounts" };

export default async function SiteUsers() {
  const users = await store().listUsers();
  return (
    <AdminShell>
      <PageTitle eyebrow="Commissioner" title="Site accounts">
        Everyone who has signed up, across every season. To put someone on a team, go to that season&apos;s Members
        page and assign their username there. <Link href="/admin" className="text-accent hover:underline">← Seasons</Link>
      </PageTitle>
      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Nobody has signed up yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {users.map((u) => (
            <Card key={u.id} className="flex items-center justify-between gap-2 p-4">
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
            </Card>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
