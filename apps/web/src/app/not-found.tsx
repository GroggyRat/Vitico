import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-lg font-semibold">This page could not be found</h1>
      <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
        Go to VITICO Wholesale
      </Link>
    </main>
  );
}
