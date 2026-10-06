"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({ href, exact, children, className }: { href: string; exact?: boolean; children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-brand-50 text-brand-700" : "text-ink-muted hover:bg-canvas hover:text-ink",
        className,
      )}
    >
      {children}
    </Link>
  );
}
