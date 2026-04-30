import type { Metadata } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { APP_NAME } from "@acme/shared";
import "@acme/ui/globals.css";

import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: `${APP_NAME} | Dynamic Configuration`,
  description:
    "Runtime configuration, versioning, service tokens, and live propagation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <body
        className={`${displayFont.variable} ${monoFont.variable} min-h-screen bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,248,250,0.94)_28rem),#f7f8fa] text-slate-900 antialiased dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96)_28rem),#020617] dark:text-slate-100`}
      >
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
