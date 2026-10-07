"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/cn";

export type MenuItem = { href: string; label: string; exact?: boolean };

/** Phone navigation: a menu button that opens every page, the user's profile and sign out. */
export function MobileMenu({ items, name, subtitle, profileHref, className }: { items: MenuItem[]; name: string; subtitle: string; profileHref: string; className?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Close when the page changes (a link was followed) or Escape is pressed.
  if (open && openedAt !== pathname) setOpen(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (item: MenuItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          setOpenedAt(pathname);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Menu"}
        className="flex size-10 items-center justify-center rounded-md text-ink hover:bg-canvas"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30 bg-ink/20" onClick={() => setOpen(false)} aria-hidden />
          <div id="mobile-menu" className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-surface shadow-sm">
            <nav aria-label="Menu" className="flex flex-col p-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-3 text-base font-medium",
                    isActive(item) ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-canvas",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
              <Link href={profileHref} onClick={() => setOpen(false)} className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{name}</div>
                <div className="truncate text-xs text-ink-muted">{subtitle}</div>
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="whitespace-nowrap rounded-md border border-line px-3 py-2 text-sm font-medium hover:bg-canvas">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
