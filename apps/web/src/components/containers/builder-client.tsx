"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/lib/actions";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { FillGauge } from "./fill-gauge";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

export type EditorLine = {
  productId: string;
  sku: string;
  name: string;
  sellUnit: string;
  qty: number;
  moq: number;
  multiple: number;
  cbm: number;
  kg: number;
  unitLabel: string;
  lineLabel: string;
  problems: string[];
};

/**
 * Quantities with an instant volume/weight preview. Prices are recalculated
 * on the server when the quantities are saved.
 */
export function LinesEditor({
  lines,
  maxCbm,
  maxKg,
  action,
  readOnly,
}: {
  lines: EditorLine[];
  maxCbm: number;
  maxKg: number;
  action: Action;
  readOnly?: boolean;
}) {
  const [state, run] = useActionState(action, undefined);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.productId, l.qty])));
  const totals = useMemo(() => {
    let cbm = 0;
    let kg = 0;
    for (const l of lines) {
      const q = Number.isFinite(qty[l.productId]) ? qty[l.productId] : 0;
      cbm += l.cbm * q;
      kg += l.kg * q;
    }
    return { cbm: Math.round(cbm * 10_000) / 10_000, kg: Math.round(kg * 1000) / 1000 };
  }, [lines, qty]);
  const dirty = lines.some((l) => qty[l.productId] !== l.qty);

  return (
    <form action={run} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FillGauge label="Volume" used={totals.cbm} max={maxCbm} unit="m³" decimals={2} />
        <FillGauge label="Weight" used={totals.kg} max={maxKg} unit="kg" decimals={0} />
      </div>
      <FormMessage state={state?.ok ? undefined : state} />
      {lines.length === 0 ? (
        <p className="rounded-md bg-canvas px-4 py-6 text-center text-sm text-ink-muted">Add products below to start filling the container.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-2 font-medium">Product</th>
                <th className="py-2 text-right font-medium">Cartons</th>
                <th className="py-2 text-right font-medium">m³</th>
                <th className="py-2 text-right font-medium">kg</th>
                <th className="py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const q = qty[l.productId] ?? 0;
                return (
                  <tr key={l.productId} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-ink-muted">
                        <span className="font-mono">{l.sku}</span> · {l.sellUnit}
                      </div>
                      {l.problems.map((p) => (
                        <div key={p} className="text-xs font-medium text-red-600">
                          {p}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 text-right">
                      <Input
                        name={`qty_${l.productId}`}
                        type="number"
                        min={0}
                        step={l.multiple}
                        value={Number.isFinite(q) ? q : ""}
                        onChange={(e) => setQty({ ...qty, [l.productId]: e.target.value === "" ? NaN : Number(e.target.value) })}
                        aria-label={`Cartons of ${l.name}`}
                        disabled={readOnly}
                        className="ml-auto h-8 w-24 py-1 text-right"
                      />
                    </td>
                    <td className="py-2 text-right tabular-nums">{(l.cbm * (q || 0)).toFixed(2)}</td>
                    <td className="py-2 text-right tabular-nums">{Math.round(l.kg * (q || 0)).toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">
                      <div>{l.lineLabel}</div>
                      <div className="text-xs text-ink-muted">{l.unitLabel} each</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && lines.length > 0 && (
        <div className="flex items-center gap-3">
          <SubmitButton variant={dirty ? "primary" : "secondary"} pendingText="Saving…">
            Save quantities &amp; update prices
          </SubmitButton>
          {dirty && <span className="text-xs text-amber-700">Unsaved changes. Prices update when you save.</span>}
          {state?.ok && !dirty && <span className="text-xs text-brand-700">Saved.</span>}
        </div>
      )}
    </form>
  );
}

export type PickerProduct = { sku: string; name: string; sellUnit: string; moq: number; multiple: number; cbm: number; kg: number };

export function ProductPicker({ products, action }: { products: PickerProduct[]; action: Action }) {
  const [state, run] = useActionState(action, undefined);
  const [query, setQuery] = useState("");
  const [sku, setSku] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : products).slice(0, 50);
  }, [products, query]);
  const chosen = products.find((p) => p.sku === sku);
  return (
    <form action={run} className="space-y-2">
      <FormMessage state={state?.ok ? undefined : state} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
        <Input placeholder="Search products…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search products" />
        <Select name="sku" value={sku} onChange={(e) => setSku(e.target.value)} aria-label="Product" required>
          <option value="">Choose a product…</option>
          {matches.map((p) => (
            <option key={p.sku} value={p.sku}>
              {p.name} ({p.sku})
            </option>
          ))}
        </Select>
        <Input name="qty" type="number" min={chosen?.moq ?? 1} step={chosen?.multiple ?? 1} defaultValue={chosen?.moq ?? 1} key={sku} aria-label="Cartons" />
        <SubmitButton pendingText="Adding…">Add</SubmitButton>
      </div>
      {chosen && (
        <p className="text-xs text-ink-muted">
          {chosen.sellUnit} · {chosen.cbm} m³ · {chosen.kg} kg per carton{chosen.moq > 1 && ` · min ${chosen.moq}`}
        </p>
      )}
    </form>
  );
}
