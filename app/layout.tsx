import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
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
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0f" },
  ],
  viewportFit: "cover",
};

// Applied before first paint so there's never a flash of the wrong theme:
// stored preference wins, otherwise the OS preference is used.
const themeInit = `(function(){try{var s=localStorage.getItem("theme");var dark=s? s==="dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}>
      <head>
        {/* Inline theme init: a plain <script> in <head> runs before first paint.
            (next/script with beforeInteractive isn't executed on the client in
            the App Router — that would throw a console error on every page.) */}
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
