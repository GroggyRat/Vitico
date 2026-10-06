import type { Metadata } from "next";
import Link from "next/link";
import { AuthTokenType } from "@vitico/db";
import { Card, CardBody } from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { findValidToken } from "@/server/services/users";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password", referrer: "no-referrer" };

export default async function SetPasswordPage({ params }: PageProps<"/set-password/[token]">) {
  const { token } = await params;
  const record = await findValidToken(getDb(), token);

  if (!record) {
    return (
      <Card>
        <CardBody className="space-y-3 p-6 sm:p-8">
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="text-sm text-ink-muted">
            Invite and password links work once and expire after a while. Ask whoever sent it for a new one.
          </p>
          <Link href="/login" className="inline-block text-sm font-medium text-brand-700 hover:underline">
            Go to sign in
          </Link>
        </CardBody>
      </Card>
    );
  }

  const isInvite = record.type === AuthTokenType.INVITE;
  const org = record.user.company?.name ?? "VITICO";
  return (
    <Card>
      <CardBody className="space-y-6 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">{isInvite ? `Welcome, ${record.user.name}` : "Reset your password"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isInvite
              ? `You've been invited to join ${org} on VITICO Wholesale. Choose a password to finish setting up.`
              : `Choose a new password for ${record.user.email}.`}
          </p>
        </div>
        <SetPasswordForm token={token} />
      </CardBody>
    </Card>
  );
}
