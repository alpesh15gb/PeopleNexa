import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/employee", name: "PeopleNexa ESS", short_name: "PeopleNexa ESS",
    description: "Employee attendance, leave, payslips and notifications",
    start_url: "/employee", scope: "/", display: "standalone",
    background_color: "#f5f6f8", theme_color: "#f5f6f8",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Attendance", url: "/employee/attendance", description: "View attendance" },
      { name: "Payslips", url: "/employee/payslips", description: "View payslips" },
    ],
  };
}
