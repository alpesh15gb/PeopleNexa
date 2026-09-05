import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { getEffectivePlans } from "@/lib/plans-server";
import { LandingPage } from "@/components/landing/landing-page";

const base = process.env.APP_BASE_DOMAIN ?? "peoplenexa.in";

// ── Entity signals (E-E-A-T) ─────────────────────────────────────────────────
// AI assistants (ChatGPT, Gemini, Perplexity…) cross-reference a brand's
// presence on trusted platforms when deciding how confidently to cite it.
// Fill these with REAL profile URLs as you create them — LinkedIn company
// page, Crunchbase, Product Hunt, X/Twitter, Google Business Profile. Never
// invent links that don't exist; an empty array is safer than fake profiles.
const ORGANIZATION_SAME_AS: string[] = [];
const ORGANIZATION_PHONE = "+91-9100960692";
const ORGANIZATION_ADDRESS = {
  "@type": "PostalAddress",
  addressCountry: "IN",
  addressRegion: "TG",
  addressLocality: "Hyderabad",
};

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${base}`),
  title: {
    default: "PeopleNexa — HRMS, Attendance & Payroll for Indian teams",
    template: "%s | PeopleNexa",
  },
  description:
    "PeopleNexa is the all-in-one HRMS for Indian businesses — geofenced attendance, shift rosters, leaves, payroll with PF/ESIC/PT/TDS/LWF, field GPS tracking, assets, expenses and an AI assistant. Free 30-day trial, no credit card.",
  keywords: [
    "HRMS India",
    "attendance software",
    "payroll software India",
    "biometric attendance",
    "leave management",
    "field force tracking",
    "PF ESIC TDS payroll",
    "HR and payroll software",
    "attendance tracking app",
    "staff management software",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "/",
    siteName: "PeopleNexa",
    title: "PeopleNexa — HRMS, Attendance & Payroll for Indian teams",
    description:
      "Geofenced attendance, shift rosters, leaves, payroll with PF/ESIC/PT/TDS/LWF, field GPS tracking and an AI assistant — free 30-day trial, no credit card.",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "PeopleNexa — HRMS, Attendance & Payroll for Indian teams",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PeopleNexa — HRMS, Attendance & Payroll for Indian teams",
    description: "Geofenced attendance, payroll with PF/ESIC/PT/TDS/LWF, field GPS tracking and an AI assistant.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default async function LandingRoute() {
  // Tenant subdomains (crk.peoplenexa.in) keep pointing at the app's login;
  // only the apex domain (peoplenexa.in) shows the marketing landing.
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const base = process.env.APP_BASE_DOMAIN ?? "peoplenexa.in";
  const isWwwHost = hostname === "www" || hostname.startsWith("www.");
  const isTenantHost =
    !isWwwHost &&
    ((hostname.endsWith(`.${base}`) && hostname.split(".").length >= 3) ||
      (hostname.endsWith(".localhost") && hostname.split(".").length >= 2));
  if (isTenantHost) redirect("/login");

  // Logged-in users skip the marketing page and go straight to their portal.
  const session = await getSession();
  if (session) {
    redirect(session.role === "superadmin" ? "/superadmin" : session.role === "admin" ? "/admin" : "/employee");
  }

  // Live pricing — reflects super-admin plan edits from the console, always
  // read fresh so a price change shows on the next page load.
  const plans = await getEffectivePlans({ fresh: true });

  // Structured data: Organization + WebSite + SoftwareApplication (Google's
  // preferred JSON-LD format). Offers mirror the effective plans, so schema
  // pricing stays in sync with super-admin edits.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `https://${base}#organization`,
        name: "PeopleNexa",
        url: `https://${base}/`,
        logo: { "@type": "ImageObject", url: `https://${base}/og.png` },
        description: "All-in-one HRMS for Indian teams — attendance, payroll, field tracking and more.",
        slogan: "Run your workforce on one simple platform",
        areaServed: "IN",
        address: ORGANIZATION_ADDRESS,
        sameAs: ORGANIZATION_SAME_AS,
        brand: { "@type": "Brand", name: "PeopleNexa" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "sales@peoplenexa.in",
          telephone: ORGANIZATION_PHONE,
          availableLanguage: ["en", "hi", "gu", "mr", "ta"],
          areaServed: "IN",
        },
      },
      {
        "@type": "WebSite",
        "@id": `https://${base}#website`,
        url: `https://${base}/`,
        name: "PeopleNexa",
        publisher: { "@id": `https://${base}#organization` },
        inLanguage: ["en-IN", "hi-IN", "gu-IN", "mr-IN", "ta-IN"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `https://${base}#application`,
        name: "PeopleNexa",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web, Android, iOS (PWA)",
        url: `https://${base}/`,
        description:
          "Geofenced attendance, shift rosters, leaves, payroll with PF/ESIC/PT/TDS/LWF, field GPS tracking, assets, expenses and an AI assistant.",
        offers: plans
          .filter((p) => p.key !== "enterprise")
          .map((p) => ({
            "@type": "Offer",
            name: p.label,
            price: p.pricePerSeat,
            priceCurrency: "INR",
            description: p.blurb,
          })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LandingPage plans={plans.map((p) => ({ ...p, modules: [...p.modules] }))} />
    </>
  );
}
