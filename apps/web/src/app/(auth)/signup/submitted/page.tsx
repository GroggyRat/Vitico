import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "Application received" };

export default function SubmittedPage() {
  return (
    <Card>
      <CardBody className="space-y-3 p-6 sm:p-8">
        <h1 className="text-xl font-semibold">Thanks — application received</h1>
        <p className="text-sm text-ink-muted">
          Our team will review your details, usually within one business day. You&apos;ll be able to sign in with the email
          and password you just chose once your account is approved.
        </p>
        <Link href="/login" className="inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </CardBody>
    </Card>
  );
}
