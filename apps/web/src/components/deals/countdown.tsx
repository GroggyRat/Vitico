"use client";

import { useEffect, useState } from "react";
import { formatTimeLeft } from "@/lib/countdown";

const nowMs = () => Date.now();

/** "Ends in 2d 4h", refreshed every 30 seconds. */
export function Countdown({ endsAt, prefix = "Ends in" }: { endsAt: string; prefix?: string }) {
  const end = new Date(endsAt).getTime();
  const [left, setLeft] = useState(() => end - nowMs());
  useEffect(() => {
    const t = setInterval(() => setLeft(end - nowMs()), 30_000);
    return () => clearInterval(t);
  }, [end]);
  return <span suppressHydrationWarning>{left > 0 ? `${prefix} ${formatTimeLeft(left)}` : "Ended"}</span>;
}
