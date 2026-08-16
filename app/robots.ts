import type { MetadataRoute } from "next";

const base = process.env.APP_BASE_DOMAIN ?? "peoplenexa.in";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything behind login is private: portal, admin, employee, superadmin
        // consoles, the API, and the auth screens (no search value).
        disallow: ["/api", "/admin", "/employee", "/superadmin", "/login", "/register", "/notifications"],
      },
    ],
    sitemap: `https://${base}/sitemap.xml`,
  };
}
