import { ActionButton } from "@/components/ui/action-button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { markAllReadAction, openNotificationAction } from "@/app/me-actions";
import { getDb } from "@/lib/db";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { redirect } from "next/navigation";

export async function NotificationList({ userId }: { userId: string }) {
  const items = await getDb().notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;

  async function open(id: string, link: string | null) {
    "use server";
    await openNotificationAction(id);
    if (link) redirect(link);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={unread > 0 ? <ActionButton action={markAllReadAction}>Mark all read</ActionButton> : undefined}
      />
      <Card>
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-muted">No notifications yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <form action={open.bind(null, n.id, n.link)}>
                  <button type="submit" className={cn("block w-full px-5 py-3 text-left hover:bg-canvas", !n.readAt && "bg-brand-50/60")}>
                    <div className="flex items-start justify-between gap-3">
                      <span className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                      <span className="shrink-0 text-xs text-ink-muted">{formatDateTime(n.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
