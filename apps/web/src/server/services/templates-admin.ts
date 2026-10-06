import type { Db } from "@vitico/db";
import { staffCan } from "@/lib/auth/permissions";
import type { StaffActor } from "../actors";
import { audit } from "../audit";
import { ServiceError } from "../errors";
import { TEMPLATES, type TemplateType } from "../notifications/templates";

export async function saveTemplate(db: Db, actor: StaffActor, type: string, input: { subject: string; body: string } | null) {
  if (!staffCan(actor.staffRole, "settings.messages")) throw new ServiceError("You can't edit messages.");
  if (!(type in TEMPLATES)) throw new ServiceError("Unknown message type.");
  if (input === null) await db.messageTemplate.deleteMany({ where: { type } });
  else {
    const def = TEMPLATES[type as TemplateType];
    if ("mandatoryEmail" in def && def.mandatoryEmail && !input.body.includes("{{link}}")) {
      throw new ServiceError("This message must include {{link}}.", "body");
    }
    await db.messageTemplate.upsert({ where: { type }, update: input, create: { type, ...input } });
  }
  await audit(db, { actorId: actor.id, action: input ? "template.updated" : "template.reset", entityType: "MessageTemplate", entityId: type });
}

export async function retryFailedMessages(db: Db, actor: StaffActor) {
  if (!staffCan(actor.staffRole, "settings.messages")) throw new ServiceError("You can't manage messages.");
  const { count } = await db.outboundMessage.updateMany({ where: { status: "FAILED" }, data: { status: "PENDING", attempts: 0, sendAfter: new Date() } });
  return count;
}
