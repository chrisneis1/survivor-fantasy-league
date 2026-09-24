import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import "./globals.css";

// Condensed scoreboard type for headings and numbers; Inter for everything people read at length.
const display = Barlow_Condensed({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "Survivor Fantasy League", template: "%s · Survivor Fantasy League" },
  description: "Standings, rosters, weekly pick order and season history for the Survivor fantasy league.",
  // Home-screen install on iPhone (Android reads app/manifest.ts); the icons come from app/icon.svg and app/apple-icon.png.
  appleWebApp: { capable: true, title: "Survivor FL", statusBarStyle: "black" },
};
// Season data lives in the database and changes when the commissioner publishes, so nothing here is prerendered.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1210", colorScheme: "dark", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
