import type { BadgeTone } from "@/components/ui/badge";
import type { DealPhase } from "@/server/deals/service";

export const phaseTone: Record<DealPhase, BadgeTone> = { draft: "neutral", scheduled: "amber", live: "green", ended: "neutral", cancelled: "red" };
