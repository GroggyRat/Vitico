import Image from "next/image";

/** The VITICO wordmark (with the smile). Height drives the size; width follows the artwork. */
export function Wordmark({ height = 28, className }: { height?: number; className?: string }) {
  return <Image src="/brand/wordmark.png" alt="VITICO" width={Math.round((height * 1057) / 339)} height={height} priority className={className} />;
}

/** The full lockup with "freshness, delivered." for sign-in and sign-up pages. */
export function FullLogo({ width = 220, className }: { width?: number; className?: string }) {
  return <Image src="/brand/logo.png" alt="VITICO, freshness delivered" width={width} height={Math.round((width * 461) / 1057)} priority className={className} />;
}
