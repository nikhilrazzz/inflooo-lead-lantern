import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
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
