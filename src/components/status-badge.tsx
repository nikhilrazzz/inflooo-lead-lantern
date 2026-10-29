import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  "New Lead": "bg-primary-soft text-accent-foreground",
  Won: "bg-success-soft text-success",
  Lost: "bg-muted text-muted-foreground",
  "Proposal Sent": "bg-warning-soft text-warning",
  Interested: "bg-warning-soft text-warning",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", STYLES[status] ?? "bg-secondary text-secondary-foreground", className)}>
      {status}
    </span>
  );
}
