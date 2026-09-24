import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { SiteShell } from "@/components/shell";
import { btnGhostCls, inputCls } from "@/components/styles";
import { Card, PageHeader, SectionHeader } from "@/components/ui";
import { changeMyPasswordAction, userSignOutAction } from "@/server/actions";
import { getUser } from "@/server/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/session";

export const metadata = { title: "Your account" };

/** The signed-in account's own settings, reached from the account menu: out of the way of the league pages. */
export default async function Account() {
  const user = await getUser();
  if (!user) redirect("/login?next=/account");

  return (
    <SiteShell narrow>
      <PageHeader eyebrow="Your account" title={user.username}>
        {user.isAdmin ? "Site admin." : null}
      </PageHeader>

      <section aria-labelledby="password-title">
        <SectionHeader id="password-title">Change password</SectionHeader>
        <Card tone="raised" className="p-5">
          <p className="mb-4 text-sm text-muted">If the commissioner gave you a temporary password, change it here. Any other device signed in as you will be signed out; this one stays signed in.</p>
          <ActionForm action={changeMyPasswordAction} submit="Change password" resetOnSuccess>
            <Field label="Current password">
              <input name="current" type="password" autoComplete="current-password" required className={inputCls} />
            </Field>
            <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
              <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputCls} />
            </Field>
            <Field label="New password again">
              <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputCls} />
            </Field>
          </ActionForm>
        </Card>
      </section>

      <form action={userSignOutAction} className="mt-8">
        <button className={btnGhostCls}>Sign out</button>
      </form>
    </SiteShell>
  );
}
