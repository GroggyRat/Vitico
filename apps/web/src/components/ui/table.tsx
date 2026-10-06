import { cn } from "@/lib/cn";
import { StackLabels } from "./stack-labels";

/** A data table. On phones each row becomes a card of "label: value" lines unless stack is false. */
export function Table({ className, stack = true, ...props }: React.ComponentProps<"table"> & { stack?: boolean }) {
  return (
    <div className="overflow-x-auto" data-stack={stack ? "" : undefined}>
      <table className={cn("w-full text-left text-sm", className)} {...props} />
      {stack && <StackLabels />}
    </div>
  );
}
export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return <th className={cn("border-b border-line px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-muted", className)} {...props} />;
}
export function Td({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-5 py-3 align-middle", className)} {...props} />;
}
export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-ink-muted">
        {children}
      </td>
    </tr>
  );
}
