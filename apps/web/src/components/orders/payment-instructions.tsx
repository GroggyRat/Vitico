import type { PaymentMethod } from "@vitico/db";
import type { PaymentSettings } from "@/server/services/payment-settings";

/** How to pay VITICO for a given method. */
export function PaymentInstructions({ method, settings, reference }: { method: PaymentMethod; settings: PaymentSettings; reference: string }) {
  const rows: [string, string][] =
    method === "BANK_DEPOSIT"
      ? [
          ["Bank", settings.bankName],
          ["Account name", settings.accountName],
          ["Account number", settings.accountNumber],
          ["Branch", settings.branch],
          ["SWIFT (overseas)", settings.swift],
        ]
      : method === "MPAISA"
        ? [["M-PAiSA merchant", settings.mpaisaNumber]]
        : method === "MYCASH"
          ? [["MyCash merchant", settings.mycashNumber]]
          : [];
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return <p className="text-sm text-ink-muted">VITICO will send payment details shortly.</p>;
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {filled.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
        <dt className="text-ink-muted">Reference</dt>
        <dd className="font-mono font-medium">{reference}</dd>
      </dl>
      {settings.note && <p className="text-ink-muted">{settings.note}</p>}
    </div>
  );
}
