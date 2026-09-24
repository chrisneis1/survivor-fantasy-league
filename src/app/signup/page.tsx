import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { SiteShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { signUpAction } from "@/server/actions";
import { getUser } from "@/server/auth";
import { MIN_PASSWORD_LENGTH } from "@/server/session";

export const metadata = { title: "Create an account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  if (await getUser()) redirect(next || "/");

  return (
    <SiteShell narrow>
      <PageHeader eyebrow="Survivor Fantasy League" title="Create an account" />
      <Card tone="raised" className="p-5 sm:p-6">
        <ActionForm action={signUpAction} submit="Create account">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label="Your first name">
            <input name="username" autoComplete="username" required autoFocus className={inputCls} />
          </Field>
          <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
            <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required className={inputCls} />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        This creates your account, but no team yet — tell your commissioner your name and they&apos;ll assign you to your team from Setup.
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-accent hover:underline">Sign in</Link>.
      </p>
    </SiteShell>
  );
}
