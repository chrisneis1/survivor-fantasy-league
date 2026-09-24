import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { SiteShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { signInAction } from "@/server/actions";
import { isAdmin, usingDefaultPasscode } from "@/server/auth";

export const metadata = { title: "Commissioner sign-in" };

// Reachable without any account: this is where roles get set up in the first place.
export default async function Login() {
  if (await isAdmin()) redirect("/admin");
  return (
    <SiteShell narrow>
      <PageHeader eyebrow="Commissioner" title="Sign in" />
      <Card tone="raised" className="p-5 sm:p-6">
        <ActionForm action={signInAction} submit="Sign in">
          <Field label="Admin password">
            <input name="password" type="password" autoComplete="current-password" required autoFocus className={inputCls} />
          </Field>
        </ActionForm>
        {usingDefaultPasscode() ? (
          <p className="mt-4 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
            No <code>COMMISSIONER_PASSCODE</code> is set, so the password is <strong>Password</strong>. Set it in the environment before this site is public.
          </p>
        ) : null}
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Everyone else can browse the public site without signing in. A league member with the commissioner role signs in with their own username and password instead of here.
      </p>
    </SiteShell>
  );
}
