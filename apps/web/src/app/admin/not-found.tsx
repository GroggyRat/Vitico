import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-lg">
      <CardBody className="space-y-3 py-10 text-center">
        <h1 className="text-lg font-semibold">This page could not be found</h1>
        <p className="text-sm text-ink-muted">It may have moved, or your account doesn&apos;t have access to it.</p>
        <Link href="/admin" className="inline-block text-sm font-medium text-brand-700 hover:underline">
          Back to overview
        </Link>
      </CardBody>
    </Card>
  );
}
