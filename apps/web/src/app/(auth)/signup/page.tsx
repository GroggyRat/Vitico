import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { getRegionOptions } from "@/lib/regions";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Apply for an account" };

export default async function SignupPage() {
  const regions = await getRegionOptions();
  return (
    <Card>
      <CardBody className="space-y-6 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">Apply for a trade account</h1>
          <p className="mt-1 text-sm text-ink-muted">
            VITICO reviews every application. Once approved you can sign in, see your trade prices and invite your team.
          </p>
        </div>
        <SignupForm regions={regions} />
        <p className="text-sm text-ink-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
