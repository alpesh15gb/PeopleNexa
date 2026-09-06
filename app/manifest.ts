import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PeopleNexa — Attendance & Payroll",
    short_name: "PeopleNexa",
    description: "Employee attendance, leave, payroll and asset tracking",
    start_url: "/employee",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#f5f6f8",
    categories: ["business", "productivity"],
    // NOTE: only SVG icons are referenced on purpose. The 192/512 maskable
    // PNGs do not exist yet in /public — do NOT add icon entries pointing at
    // missing PNG files (breaks installability checks). Generation steps are
    // documented in docs/native-apps.md. Likewise, screenshots[] is omitted
    // until real PNG/JPG captures exist.
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
    // PagarBook parity: quick actions from the launcher icon.
    shortcuts: [
      {
        name: "Clock in",
        url: "/employee/attendance",
        description: "Mark attendance",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Payslips",
        url: "/employee/payslips",
        description: "View payslips",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
  };
}
