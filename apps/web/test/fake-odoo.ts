import { OdooError, type OdooParams, type OdooTransport } from "@/server/odoo/client";

type Row = Record<string, unknown> & { id: number };
type Domain = [string, string, unknown][];

/** A tiny in-memory stand-in for Odoo's ORM, enough for the sync code. */
export class FakeOdoo implements OdooTransport {
  tables: Record<string, Row[]> = {
    "res.country": [
      { id: 1, code: "FJ" },
      { id: 2, code: "WS" },
    ],
    "res.partner": [],
    "product.product": [],
    "sale.order": [],
    "account.move": [],
    "account.payment": [],
    "res.company": [{ id: 1, name: "VITICO Test" }],
  };
  calls: string[] = [];
  failNext: OdooError | Error | null = null;
  private seq = 100;

  private match(row: Row, domain: Domain) {
    return domain.every(([f, op, v]) => {
      const val = Array.isArray(row[f]) ? (row[f] as unknown[])[0] : row[f];
      if (op === "=") return val === v;
      if (op === "in" || op === "child_of") return (v as unknown[]).includes(val);
      throw new Error(`fake odoo: op ${op}`);
    });
  }

  private pick(row: Row, fields?: string[]) {
    if (!fields) return { ...row };
    return Object.fromEntries([["id", row.id], ...fields.map((f) => [f, row[f] ?? false])]);
  }

  async call<T>(model: string, method: string, params: OdooParams = {}): Promise<T> {
    this.calls.push(`${model}.${method}`);
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const table = (this.tables[model] ??= []);
    const ids = params.ids ?? [];
    switch (method) {
      case "search_read": {
        const rows = table.filter((r) => this.match(r, (params.domain as Domain) ?? []));
        return rows.slice(0, (params.limit as number) ?? undefined).map((r) => this.pick(r, params.fields as string[])) as T;
      }
      case "read":
        return table.filter((r) => ids.includes(r.id)).map((r) => this.pick(r, params.fields as string[])) as T;
      case "create": {
        const created = (params.vals_list as Record<string, unknown>[]).map((vals) => {
          const row: Row = { ...vals, id: ++this.seq };
          if (model === "sale.order") Object.assign(row, { name: `S${String(row.id).padStart(5, "0")}`, state: "draft" });
          table.push(row);
          return row.id;
        });
        return created as T;
      }
      case "write":
        for (const r of table.filter((r) => ids.includes(r.id))) Object.assign(r, params.vals);
        return true as T;
      case "action_confirm":
        for (const r of table.filter((r) => ids.includes(r.id))) r.state = "sale";
        return true as T;
      case "action_cancel":
        for (const r of table.filter((r) => ids.includes(r.id))) r.state = "cancel";
        return true as T;
      case "get_portal_url":
        return `/my/invoices/${ids[0]}?access_token=tok${ids[0]}` as T;
      default:
        throw new OdooError(`fake odoo: ${model}.${method} not supported`, 400, true);
    }
  }
}
