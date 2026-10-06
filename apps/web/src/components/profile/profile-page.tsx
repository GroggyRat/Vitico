import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getDb } from "@/lib/db";
import { CATEGORIES } from "@/server/notifications/templates";
import { getPreferences } from "@/server/services/profile";
import { PasswordForm, PreferencesForm, ProfileForm, PushToggle } from "./profile-forms";

/** Shared profile page for customers and staff. */
export async function ProfilePage({ user, staff }: { user: { id: string; name: string; email: string; phone: string | null }; staff: boolean }) {
  const prefs = await getPreferences(getDb(), user.id);
  const visible = prefs.filter((p) => (staff ? ["account", "staff"].includes(p.category) : p.category !== "staff"));
  const labels = Object.fromEntries(Object.entries(CATEGORIES));
  return (
    <>
      <PageHeader title="Profile" description={user.email} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <ProfileForm name={user.name} email={user.email} phone={user.phone ?? ""} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Notifications" />
          <CardBody className="space-y-6">
            <PreferencesForm rows={visible} labels={labels} smsAvailable={!!user.phone} />
            <div className="border-t border-line pt-4">
              <PushToggle vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Password" />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
