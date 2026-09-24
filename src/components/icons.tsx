// A small inline icon set: 24px grid, stroke-only, currentColor. Decorative by default (aria-hidden); pass `label`
// when an icon carries meaning on its own.
import type { ReactNode, SVGProps } from "react";

type IconProps = { size?: number; label?: string; className?: string } & Omit<SVGProps<SVGSVGElement>, "children">;

function Svg({ size = 18, label, className = "", children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      {...rest}
    >
      {children}
    </svg>
  );
}

const make = (paths: ReactNode) =>
  function Icon(p: IconProps) {
    return <Svg {...p}>{paths}</Svg>;
  };

export const IconStandings = make(<><path d="M5 20V11" /><path d="M12 20V5" /><path d="M19 20v-6" /><path d="M3 20h18" /></>);
export const IconWeek = make(<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9 15 2 2 4-4" /></>);
export const IconTeams = make(<><path d="M12 3 4.5 6v5.5c0 4.3 3.1 7.8 7.5 9.5 4.4-1.7 7.5-5.2 7.5-9.5V6L12 3Z" /><path d="M9 12h6M12 9v6" /></>);
export const IconCastaways = make(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.3.1 3.9 1.6 4.5 4.4" /></>);
export const IconEpisodes = make(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m10 9.5 4.5 2.5-4.5 2.5v-5Z" /></>);
export const IconRules = make(<><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /><path d="M9 7.5h6M9 11h4" /></>);
export const IconArchive = make(<><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></>);
export const IconMyTeam = make(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" /></>);
export const IconMenu = make(<><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></>);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconChevronRight = make(<path d="m9 6 6 6-6 6" />);
export const IconChevronLeft = make(<path d="m15 6-6 6 6 6" />);
export const IconArrowRight = make(<><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>);
export const IconSwap = make(<><path d="M4 8h13l-3-3" /><path d="M20 16H7l3 3" /></>);
export const IconSearch = make(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
export const IconCheck = make(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const IconClock = make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);
export const IconSkip = make(<><path d="m5 6 7 6-7 6V6Z" /><path d="M16 6v12" /></>);
export const IconPass = make(<><path d="M4 14a8 8 0 0 1 14.5-4.6" /><path d="M19 4.5V10h-5.5" /></>);
export const IconPlay = make(<path d="M7 5.5v13l11-6.5-11-6.5Z" />);
export const IconX = make(<><circle cx="12" cy="12" r="8.5" /><path d="m9 9 6 6M15 9l-6 6" /></>);
export const IconShield = make(<><path d="M12 3 5 6v5.5c0 4.2 3 7.8 7 9.5 4-1.7 7-5.3 7-9.5V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>);
export const IconLogout = make(<><path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14" /><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" /></>);
export const IconLogin = make(<><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="m14 7.5 4.5 4.5-4.5 4.5M18.5 12H9" /></>);
export const IconTrophy = make(<><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8.5 20h7M10 17h4" /></>);
export const IconFlame = make(<path d="M12 3c.6 3 4.5 4.6 4.5 9.2A4.5 4.5 0 0 1 12 16.7a4.5 4.5 0 0 1-4.5-4.5c0-1.6.7-2.8 1.6-3.8.3 1.2 1 2 1.8 2.3C10.4 7.6 11 5 12 3Z" />);
export const IconTrendUp = make(<><path d="m4 16 5.5-5.5 3.5 3.5L20 7" /><path d="M15 7h5v5" /></>);
export const IconAlert = make(<><path d="M12 4 2.8 19.5h18.4L12 4Z" /><path d="M12 10v4.5M12 17.3v.2" /></>);
export const IconMedical = make(<><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" /></>);
export const IconUsers = make(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.5c1.6.5 2.7 2 3 4.5" /></>);

/** The league mark: an original torch-and-island glyph (deliberately not any show logo). */
export function TorchMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      <defs>
        <linearGradient id="torch-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent-strong)" />
          <stop offset="1" stopColor="var(--ember)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="var(--surface-3)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="var(--line-strong)" />
      <path d="M16 5.5c.9 2.9 4.6 4.3 4.6 8.4a4.6 4.6 0 0 1-9.2 0c0-1.5.6-2.6 1.4-3.5.3 1.1.9 1.8 1.7 2.1-.3-2.8.5-5.1 1.5-7Z" fill="url(#torch-flame)" />
      <path d="M14.2 18.8h3.6l-.8 7h-2l-.8-7Z" fill="var(--sand-2)" />
      <path d="M6 26.5c3-1.4 6.5-1.4 10 0s7 1.4 10 0" fill="none" stroke="var(--series-3)" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}
