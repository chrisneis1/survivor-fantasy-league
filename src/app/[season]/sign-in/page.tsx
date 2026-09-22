import { notFound, redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/action-form";
import { inputCls } from "@/components/styles";
import { Card, PageTitle } from "@/components/ui";
import { SeasonShell } from "@/components/shell";
import { getSeason } from "@/data";
import { memberSignInAction } from "@/server/actions";
import { getMember } from "@/server/auth";

export const metadata = { title: "Sign in" };

export default async function SignIn({ params }: { params: Promise<{ season: string }> }) {
  const season = await getSeason((await params).season);
  if (!season) notFound();
  if (await getMember(season.id)) redirect(`/${season.id}/my`);

  return (
    <SeasonShell season={season} active="/sign-in">
      <div className="mx-auto w-full max-w-md">
        <PageTitle eyebrow={season.name} title="Sign in" />
        <Card className="p-5">
          <ActionForm action={memberSignInAction} submit="Sign in">
            <input type="hidden" name="seasonId" value={season.id} />
            <Field label="Username">
              <input name="username" autoComplete="username" required autoFocus className={inputCls} />
            </Field>
            <Field label="Password">
              <input name="password" type="password" autoComplete="current-password" required className={inputCls} />
            </Field>
          </ActionForm>
        </Card>
        <p className="mt-4 text-center text-sm text-muted">
          Your username and password come from your commissioner. Lost or forgot it? Ask them to set a new one from Members.
        </p>
      </div>
    </SeasonShell>
  );
}
