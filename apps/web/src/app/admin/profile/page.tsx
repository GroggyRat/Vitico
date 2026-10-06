import type { Metadata } from "next";
import { ProfilePage } from "@/components/profile/profile-page";
import { requireStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Profile" };

export default async function Page() {
  const { user } = await requireStaff();
  return <ProfilePage user={user} staff={true} />;
}
