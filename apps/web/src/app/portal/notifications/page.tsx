import type { Metadata } from "next";
import { NotificationList } from "@/components/notifications/notification-list";
import { requireCustomer } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Notifications" };

export default async function Page() {
  const { user } = await requireCustomer();
  return <NotificationList userId={user.id} />;
}
