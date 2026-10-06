import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardBody className="space-y-6 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">Forgot your password?</h1>
          <p className="mt-1 text-sm text-ink-muted">We&apos;ll email you a link to choose a new one.</p>
        </div>
        <ForgotForm />
        <Link href="/login" className="inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      </CardBody>
    </Card>
  );
}
