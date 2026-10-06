import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center px-4 py-10 sm:py-16">
      <Link href="/" className="mb-8 text-xl font-bold tracking-tight text-brand-700">
        VITICO <span className="font-normal text-ink-muted">Wholesale</span>
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
