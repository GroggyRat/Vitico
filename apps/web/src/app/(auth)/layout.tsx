import Link from "next/link";
import { FullLogo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8">
        <FullLogo width={200} />
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
