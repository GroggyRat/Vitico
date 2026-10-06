import { parseBusinessTime, toBusinessInput } from "@/lib/time";
import { SALES_GROUPS, type SalesGroup } from "./service";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Reads from / to (Fiji dates, inclusive) and grouping from a query string. Defaults to this month. */
export function reportParams(params: Params, now = new Date()) {
  const today = toBusinessInput(now, true);
  const fromInput = /^\d{4}-\d{2}-\d{2}$/.test(one(params.from)) ? one(params.from) : `${today.slice(0, 8)}01`;
  const toInput = /^\d{4}-\d{2}-\d{2}$/.test(one(params.to)) ? one(params.to) : today;
  const group = (SALES_GROUPS as readonly string[]).includes(one(params.group)) ? (one(params.group) as SalesGroup) : "month";
  const from = parseBusinessTime(fromInput)!;
  // Inclusive end date: everything before the start of the next day.
  const to = new Date(parseBusinessTime(toInput, { endOfDay: true })!.getTime() + 1);
  return { from, to, fromInput, toInput, group };
}
