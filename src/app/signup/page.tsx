import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { Card, PageTitle } from "@/components/ui";
import { signUpAction } from "@/server/actions";
import { getUser } from "@/server/auth";

export const metadata = { title: "Create an account" };

export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  if (await getUser()) redirect(next || "/");

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-16">
      <PageTitle eyebrow="Survivor Fantasy League" title="Create an account" />
      <Card className="p-5">
        <ActionForm action={signUpAction} submit="Create account">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label="Your first name">
            <input name="username" autoComplete="username" required autoFocus className={inputCls} />
          </Field>
          <Field label="Password" hint="At least 4 characters.">
            <input name="password" type="password" autoComplete="new-password" minLength={4} required className={inputCls} />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        This creates your account, but no team yet — tell your commissioner your name and they&apos;ll assign you to your team from Setup.
      </p>
      <p className="mt-2 text-center text-sm text-muted">
        Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">Sign in</Link>.
      </p>
    </div>
  );
}
