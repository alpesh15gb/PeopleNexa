import type { MetadataRoute } from "next";

const base = process.env.APP_BASE_DOMAIN ?? "peoplenexa.in";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `https://${base}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
