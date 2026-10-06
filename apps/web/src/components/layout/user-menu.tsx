import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { NotificationBell } from "@/components/notifications/bell";

export function UserMenu({ userId, name, subtitle, area }: { userId: string; name: string; subtitle: string; area: "portal" | "admin" }) {
  return (
    <div className="flex items-center gap-2">
      <NotificationBell userId={userId} href={`/${area}/notifications`} />
      <Link href={`/${area}/profile`} className="rounded-md px-2 py-1 text-right leading-tight hover:bg-canvas">
        <div className="text-sm font-medium text-ink">{name}</div>
        <div className="text-xs text-ink-muted">{subtitle}</div>
      </Link>
      <form action={logoutAction}>
        <button type="submit" className="rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-canvas hover:text-ink">
          Sign out
        </button>
      </form>
    </div>
  );
}
