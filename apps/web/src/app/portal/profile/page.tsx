import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/profile-page";
import { requireCustomer } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Profile" };

export default async function Page() {
  const { user } = await requireCustomer();
  return <ProfilePage user={user} staff={false} />;
}
