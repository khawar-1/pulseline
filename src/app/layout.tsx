import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

/**
 * Font stack upgrade:
 * - Fraunces: optical serif for the wordmark, KPI numerals, and display moments.
 *   A variable-weight serif with a distinctive personality — premium without being
 *   stuffy. Used by luxury and editorial brands.
 * - Plus Jakarta Sans: the body/UI font. Modern geometric sans with excellent
 *   legibility at small sizes and a premium feel. Used extensively in high-end
 *   SaaS products.
 * - JetBrains Mono: purpose-built for code/data readability. Ligatures off so
 *   lead IDs, timestamps, and tool names stay unambiguous.
 */
const display = Fraunces({
  variable: "--font-display",
  weight: "variable",
  subsets: ["latin"],
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pulseline — lead-to-booking copilot",
  description:
    "Parses inbound patient leads, scores booking likelihood against a practice playbook, and drafts follow-ups that cannot reach a patient without passing compliance review.",
};

export const viewport: Viewport = {
  themeColor: "#f0f2f5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full`}
    >
      <body className="h-full overflow-hidden bg-paper text-ink">{children}</body>
    </html>
  );
}
