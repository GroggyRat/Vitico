import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <Card>
      <CardBody className="space-y-6 p-6 sm:p-8">
        <div>
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Wholesale ordering for VITICO trade customers.</p>
        </div>
        <LoginForm next={typeof next === "string" ? next : undefined} />
        <p className="text-sm text-ink-muted">
          New trade customer?{" "}
          <Link href="/signup" className="font-medium text-brand-700 hover:underline">
            Apply for an account
          </Link>
          <br />
          <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
