import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { getLang } from "@/lib/i18n-server";
import { PWARegister } from "@/components/pwa-register";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PeopleNexa | Attendance Control",
  description: "PeopleNexa — employee attendance, leave, asset tracking and reporting platform",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "PeopleNexa",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1118" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Screen readers need the correct lang for hi/gu/mr/ta pronunciation.
  const lang = await getLang().catch(() => "en" as const);
  return (
    <html lang={lang} suppressHydrationWarning className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
