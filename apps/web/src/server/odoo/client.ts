/**
 * Minimal Odoo external-API client.
 *
 * - "json2": Odoo 19+ JSON-2 API, POST {url}/json/2/{model}/{method}, bearer API key.
 * - "jsonrpc": legacy /jsonrpc execute_kw (Odoo ≤ 18, deprecated in 19).
 *
 * Every call goes through `call(model, method, { ids?, ...namedArgs })` so the sync code
 * doesn't care which transport is in use, and tests can swap in a fake.
 */

export type OdooConfig = {
  url: string;
  db: string;
  apiKey: string;
  /** Login of the integration user (needed for the legacy JSON-RPC transport). */
  username?: string;
  protocol: "json2" | "jsonrpc";
};

export type OdooParams = { ids?: number[]; context?: Record<string, unknown>; [arg: string]: unknown };

export interface OdooTransport {
  call<T = unknown>(model: string, method: string, params?: OdooParams): Promise<T>;
}

export class OdooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** True for errors that retrying won't fix (bad credentials, validation, access). */
    readonly permanent = false,
  ) {
    super(message);
    this.name = "OdooError";
  }
}

const TIMEOUT_MS = 30_000;

export class Json2Transport implements OdooTransport {
  constructor(private readonly cfg: OdooConfig) {}

  async call<T>(model: string, method: string, params: OdooParams = {}): Promise<T> {
    const res = await fetch(`${this.cfg.url.replace(/\/$/, "")}/json/2/${model}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `bearer ${this.cfg.apiKey}`,
        "X-Odoo-Database": this.cfg.db,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "vitico-wholesale",
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 500);
      try {
        const err = JSON.parse(text) as { message?: string; name?: string };
        message = `${err.name ?? "Error"}: ${err.message ?? message}`;
      } catch {}
      throw new OdooError(`Odoo ${model}.${method} failed (${res.status}): ${message}`, res.status, [400, 401, 403, 404, 422].includes(res.status));
    }
    return (text ? JSON.parse(text) : null) as T;
  }
}

export class JsonRpcTransport implements OdooTransport {
  private uid: number | null = null;
  constructor(private readonly cfg: OdooConfig) {}

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const res = await fetch(`${this.cfg.url.replace(/\/$/, "")}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new OdooError(`Odoo JSON-RPC HTTP ${res.status}`, res.status);
    const body = (await res.json()) as { result?: T; error?: { message: string; data?: { message?: string; name?: string } } };
    if (body.error) {
      const name = body.error.data?.name ?? "";
      const permanent = /AccessDenied|AccessError|ValidationError|UserError|MissingError/.test(name);
      throw new OdooError(`Odoo ${method}: ${body.error.data?.message ?? body.error.message}`, undefined, permanent);
    }
    return body.result as T;
  }

  async call<T>(model: string, method: string, params: OdooParams = {}): Promise<T> {
    if (this.uid === null) {
      const uid = await this.rpc<number | false>("common", "authenticate", [this.cfg.db, this.cfg.username ?? "", this.cfg.apiKey, {}]);
      if (!uid) throw new OdooError("Odoo login failed. Check ODOO_USERNAME / ODOO_API_KEY.", 401, true);
      this.uid = uid;
    }
    const { ids, ...kwargs } = params;
    const args = ids ? [ids] : [];
    return this.rpc<T>("object", "execute_kw", [this.cfg.db, this.uid, this.cfg.apiKey, model, method, args, kwargs]);
  }
}

export function createTransport(cfg: OdooConfig): OdooTransport {
  return cfg.protocol === "jsonrpc" ? new JsonRpcTransport(cfg) : new Json2Transport(cfg);
}

/** Reads ODOO_* env vars. Returns null when the integration isn't configured. */
export function odooConfigFromEnv(env: Record<string, string | undefined> = process.env): OdooConfig | null {
  if (!env.ODOO_URL || !env.ODOO_DB || !env.ODOO_API_KEY) return null;
  return {
    url: env.ODOO_URL,
    db: env.ODOO_DB,
    apiKey: env.ODOO_API_KEY,
    username: env.ODOO_USERNAME,
    protocol: env.ODOO_PROTOCOL === "jsonrpc" ? "jsonrpc" : "json2",
  };
}
