import Link from "next/link";
import { getDb } from "@/lib/db";
import { unreadCount } from "@/server/services/profile";

export async function NotificationBell({ userId, href }: { userId: string; href: string }) {
  const count = await unreadCount(getDb(), userId);
  return (
    <Link href={href} className="relative rounded-md p-2 text-ink-muted hover:bg-canvas hover:text-ink" aria-label={count ? `Notifications (${count} unread)` : "Notifications"}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
