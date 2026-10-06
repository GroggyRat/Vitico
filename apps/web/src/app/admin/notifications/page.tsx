import type { Metadata } from "next";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Notifications" };

export default async function Page() {
  const { user } = await requireStaff();
  return <NotificationList userId={user.id} />;
}
