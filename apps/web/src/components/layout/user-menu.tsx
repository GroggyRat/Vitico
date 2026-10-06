import { logoutAction } from "@/app/(auth)/actions";

export function UserMenu({ name, subtitle }: { name: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right leading-tight">
        <div className="text-sm font-medium text-ink">{name}</div>
        <div className="text-xs text-ink-muted">{subtitle}</div>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-canvas hover:text-ink">
          Sign out
        </button>
      </form>
    </div>
  );
}
