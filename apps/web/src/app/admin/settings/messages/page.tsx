import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { daysAgo } from "@/lib/time";
import { CATEGORIES, TEMPLATES, type TemplateType } from "@/server/notifications/templates";
import { resetTemplateAction, retryFailedAction, saveTemplateAction } from "./actions";
import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  await requireStaff("settings.messages");
  const db = getDb();
  const since = daysAgo(7);
  const [overrides, stats, failures] = await Promise.all([
    db.messageTemplate.findMany(),
    db.outboundMessage.groupBy({ by: ["channel", "status"], where: { createdAt: { gte: since } }, _count: true }),
    db.outboundMessage.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const byType = new Map(overrides.map((o) => [o.type, o]));
  const count = (channel: string, status: string) => stats.find((s) => s.channel === channel && s.status === status)?._count ?? 0;

  return (
    <>
      <PageHeader title="Messages" description="What customers and staff receive by email, SMS, push and in the app." />
      <Card className="mb-6">
        <CardHeader title="Delivery (last 7 days)" actions={failures.length > 0 ? <ActionButton action={retryFailedAction}>Retry failed</ActionButton> : undefined} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["EMAIL", "SMS", "PUSH"] as const).map((c) => (
              <div key={c} className="rounded-md bg-canvas p-3 text-sm">
                <div className="font-medium">{c === "EMAIL" ? "Email" : c === "SMS" ? "SMS" : "Push"}</div>
                <div className="text-ink-muted">
                  {count(c, "SENT")} sent · {count(c, "PENDING") + count(c, "SENDING")} queued · <span className={count(c, "FAILED") ? "text-red-600" : ""}>{count(c, "FAILED")} failed</span>
                </div>
              </div>
            ))}
          </div>
          {failures.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line text-xs">
              {failures.map((f) => (
                <li key={f.id} className="px-3 py-2">
                  <span className="font-medium">{f.channel}</span> to {f.to} · {f.type} · {formatDateTime(f.createdAt)}
                  <div className="text-red-600">{f.lastError}</div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {(Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map((cat) => {
        const types = (Object.keys(TEMPLATES) as TemplateType[]).filter((t) => TEMPLATES[t].category === cat);
        if (!types.length) return null;
        return (
          <Card key={cat} className="mb-6">
            <CardHeader title={CATEGORIES[cat]} />
            <ul className="divide-y divide-line">
              {types.map((t) => {
                const def = TEMPLATES[t];
                const o = byType.get(t);
                return (
                  <li key={t} className="space-y-2 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-mono text-xs text-ink-muted">
                        {t} {o && <Badge tone="brand">Customised</Badge>}
                      </div>
                      {o && (
                        <ActionButton action={resetTemplateAction.bind(null, t)} variant="ghost">
                          Reset to default
                        </ActionButton>
                      )}
                    </div>
                    <TemplateForm type={t} subject={o?.subject ?? def.subject} body={o?.body ?? def.body} action={saveTemplateAction.bind(null, t)} />
                    <p className="text-xs text-ink-muted">Placeholders: {["name", ...def.vars].map((v) => `{{${v}}}`).join(" ")}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </>
  );
}
