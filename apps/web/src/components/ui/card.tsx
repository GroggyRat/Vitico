import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
