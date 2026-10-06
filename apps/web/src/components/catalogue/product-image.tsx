import { cn } from "@/lib/cn";

/** Product photo, or a neutral placeholder with the product initials. */
export function ProductImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  if (!src) {
    const initials = name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
    return (
      <div aria-hidden className={cn("flex items-center justify-center bg-brand-50 font-semibold text-brand-600", className)}>
        {initials}
      </div>
    );
  }
  // Product images come from arbitrary supplier/CDN hosts, so use a plain img.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" className={cn("bg-surface object-contain", className)} />;
}
