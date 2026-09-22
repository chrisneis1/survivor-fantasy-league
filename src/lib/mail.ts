import { headers } from "next/headers";

/** This site's public address, from the request, for links inside emails. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * A "mail to" link for the commissioner to click. It opens their own email app with the message written and the
 * recipient blank; nothing is sent by the site. Reminders are optional.
 */
export function mailto(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const reminderMailto = (opts: { member: string; seasonName: string; what: string; url: string }) =>
  mailto(
    `${opts.seasonName}: it's your turn to pick`,
    `Hi ${opts.member},\n\nIt's your turn to ${opts.what} in ${opts.seasonName}. There's no deadline, but everyone after you is waiting.\n\nOpen your personal link, or go here once you're signed in:\n${opts.url}\n\nThanks!`,
  );
