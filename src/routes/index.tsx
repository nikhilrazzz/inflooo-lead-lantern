import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "SaleUp — Sales Lead Management" },
      { name: "description", content: "Manage daily leads, follow-ups and call reminders with SaleUp." },
      { property: "og:title", content: "SaleUp — Sales Lead Management" },
      { property: "og:description", content: "Manage daily leads, follow-ups and call reminders with SaleUp." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
