import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { Card, PageTitle } from "@/components/ui";
import { userSignInAction } from "@/server/actions";
import { getUser } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next;
  if (await getUser()) redirect(next || "/");

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-16">
      <PageTitle eyebrow="Survivor Fantasy League" title="Sign in" />
      <Card className="p-5">
        <ActionForm action={userSignInAction} submit="Sign in">
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Field label="Your first name">
            <input name="username" autoComplete="username" required autoFocus className={inputCls} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required className={inputCls} />
          </Field>
        </ActionForm>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">Create an account</Link>.
        Once you have one, your commissioner assigns it to your team.
      </p>
    </div>
  );
}
