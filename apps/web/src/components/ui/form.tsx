import { cn } from "@/lib/cn";

const control =
  "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-canvas aria-invalid:border-red-500";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, "h-10", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-20", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error?.length ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-600">
          {error[0]}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormMessage({ state }: { state?: { ok?: boolean; message?: string } }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "rounded-md px-3 py-2 text-sm",
        state.ok ? "bg-brand-50 text-brand-700" : "bg-red-50 text-red-700",
      )}
    >
      {state.message}
    </p>
  );
}
