import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PeopleNexa — Attendance & Payroll",
    short_name: "PeopleNexa",
    description: "Employee attendance, leave, payroll and asset tracking",
    start_url: "/employee",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090a0f",
    theme_color: "#090a0f",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
