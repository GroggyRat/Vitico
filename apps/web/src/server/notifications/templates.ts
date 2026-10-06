/**
 * Built-in message templates. Admins can override subject/body per type
 * (MessageTemplate table). Placeholders: {{name}}, {{company}}, {{order}}, etc.
 */

export const CATEGORIES = {
  account: "Account & team",
  orders: "Orders",
  payments: "Payments & invoices",
  deals: "Deal Drops",
  rebates: "Rebates",
  staff: "Staff work queues",
} as const;
export type Category = keyof typeof CATEGORIES;

export type TemplateDef = {
  category: Category;
  /** Sent regardless of preferences, email only, no in-app copy (e.g. invite links). */
  mandatoryEmail?: boolean;
  subject: string;
  body: string;
  /** Variables the template can use, shown in the admin editor. */
  vars: string[];
};

export const TEMPLATES = {
  "account.application_received": {
    category: "staff",
    subject: "New account application: {{company}}",
    body: "{{company}} has applied for a trade account. Review it in the admin.",
    vars: ["company"],
  },
  "account.approved": {
    category: "account",
    subject: "Your VITICO Wholesale account is ready",
    body: "Bula {{name}}, {{company}} has been approved. You can now sign in, see your trade prices and place orders.",
    vars: ["name", "company"],
  },
  "account.rejected": {
    category: "account",
    mandatoryEmail: true,
    subject: "Your VITICO Wholesale application",
    body: "Bula {{name}}, unfortunately we couldn't approve the application for {{company}}: {{reason}}",
    vars: ["name", "company", "reason"],
  },
  "user.invited": {
    category: "account",
    mandatoryEmail: true,
    subject: "You're invited to VITICO Wholesale",
    body: "Bula {{name}}, you've been invited to {{company}} on VITICO Wholesale. Set your password with this link (valid 7 days): {{link}}",
    vars: ["name", "company", "link"],
  },
  "user.password_reset": {
    category: "account",
    mandatoryEmail: true,
    subject: "Reset your VITICO Wholesale password",
    body: "Bula {{name}}, use this link to choose a new password (valid 24 hours, works once): {{link}}\n\nIf you didn't ask for this, ignore this email.",
    vars: ["name", "link"],
  },
  "order.placed": {
    category: "orders",
    subject: "Order {{order}} received",
    body: "Thanks, we've received order {{order}} ({{total}}). We'll let you know when it's confirmed.",
    vars: ["order", "total"],
  },
  "order.needs_approval": {
    category: "orders",
    subject: "Order {{order}} needs your approval",
    body: "{{placedBy}} placed order {{order}} for {{total}}, which is above their limit. Approve or cancel it in the portal.",
    vars: ["order", "total", "placedBy"],
  },
  "order.status": {
    category: "orders",
    subject: "Order {{order}}: {{status}}",
    body: "Your order {{order}} is now {{status}}.{{note}}",
    vars: ["order", "status", "note"],
  },
  "order.cancelled": {
    category: "orders",
    subject: "Order {{order}} cancelled",
    body: "Order {{order}} was cancelled: {{reason}}",
    vars: ["order", "reason"],
  },
  "staff.order_new": {
    category: "staff",
    subject: "New order {{order}} from {{company}}",
    body: "{{company}} placed order {{order}} ({{total}}).",
    vars: ["order", "company", "total"],
  },
  "staff.price_approval": {
    category: "staff",
    subject: "Price approval needed: {{order}}",
    body: "{{placedBy}} set manual prices on order {{order}} for {{company}}. Please review.",
    vars: ["order", "company", "placedBy"],
  },
  "staff.payment_submitted": {
    category: "staff",
    subject: "Payment to verify: {{order}}",
    body: "{{company}} submitted a {{method}} payment of {{amount}} (ref {{reference}}) for order {{order}}.",
    vars: ["order", "company", "method", "amount", "reference"],
  },
  "payment.verified": {
    category: "payments",
    subject: "Payment received for {{order}}",
    body: "We've confirmed your payment of {{amount}} for order {{order}}. Thank you!",
    vars: ["order", "amount"],
  },
  "payment.rejected": {
    category: "payments",
    subject: "Payment for {{order}} not confirmed",
    body: "We couldn't confirm your payment for order {{order}}: {{reason}}. Please check and submit it again.",
    vars: ["order", "reason"],
  },
  "rebate.earned": {
    category: "rebates",
    subject: "You've earned {{amount}} in rebates",
    body: "{{description}}: {{amount}} has been added to your rebate wallet. Use it on your next order.",
    vars: ["amount", "description"],
  },
  "rebate.expiring": {
    category: "rebates",
    subject: "{{amount}} of rebates expire in 7 days",
    body: "Use your {{amount}} rebate balance on an order in the next 7 days before it expires.",
    vars: ["amount"],
  },
  "staff.rebate_review": {
    category: "staff",
    subject: "Contract rebate to review: {{company}}",
    body: "{{company}}'s contract rebate for {{period}} is {{amount}}. Approve it to add it to their wallet.",
    vars: ["company", "amount", "period"],
  },
} satisfies Record<string, TemplateDef>;

export type TemplateType = keyof typeof TEMPLATES;

export function render(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (vars[k] == null ? "" : String(vars[k])));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal, client-safe HTML email around a plain-text body. */
export function emailHtml(subject: string, body: string, link?: string | null): string {
  const paragraphs = escapeHtml(body)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0f766a">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(link)}" style="background:#0f766a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Open in VITICO Wholesale</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#16191d">
<div style="max-width:560px;margin:0 auto;padding:24px">
<div style="font-weight:700;font-size:18px;color:#0d5f56;margin-bottom:16px">VITICO <span style="font-weight:400;color:#5d6670">Wholesale</span></div>
<div style="background:#fff;border:1px solid #e2e5e9;border-radius:8px;padding:24px">
<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(subject)}</h1>${paragraphs}${button}
</div>
<p style="font-size:12px;color:#5d6670;margin-top:16px">You can change which emails you get under Profile, Notifications.</p>
</div></body></html>`;
}
