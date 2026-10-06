import { cn } from "@/lib/cn";

/** Product photo, or an empty neutral box when there is none. */
export function ProductImage({ src, name, className }: { src: string | null; name: string; className?: string }) {
  if (!src) return <div aria-hidden className={cn("bg-canvas", className)} />;
  // Product images come from arbitrary supplier/CDN hosts, so use a plain img.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} loading="lazy" className={cn("bg-surface object-contain", className)} />;
}
