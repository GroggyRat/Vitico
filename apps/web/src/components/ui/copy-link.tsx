"use client";

import { useState } from "react";
import { Button } from "./button";

export function CopyLink({ label, value }: { label?: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full max-w-xl space-y-1.5 rounded-md bg-brand-50 p-3 text-sm text-brand-900">
      {label && <p>{label}</p>}
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          aria-label="Link"
          onFocus={(e) => e.currentTarget.select()}
          className="h-8 min-w-0 flex-1 rounded border border-brand-100 bg-surface px-2 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
