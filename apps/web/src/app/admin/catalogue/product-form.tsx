"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveProductAction } from "./actions";

export type ProductFormValues = {
  sku: string;
  barcode: string;
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  sellUnit: string;
  unitsPerCarton: number;
  moq: number;
  orderMultiple: number;
  cartonCbm: string;
  cartonWeightKg: string;
  basePrice: string;
  costPrice: string;
  vatCategory: string;
  imageUrl: string;
  tags: string;
  lowStockThreshold: number;
  active: boolean;
  containerEligible: boolean;
};

export const emptyProduct: ProductFormValues = {
  sku: "",
  barcode: "",
  name: "",
  brand: "",
  description: "",
  categoryId: "",
  sellUnit: "Carton",
  unitsPerCarton: 1,
  moq: 1,
  orderMultiple: 1,
  cartonCbm: "0",
  cartonWeightKg: "0",
  basePrice: "",
  costPrice: "",
  vatCategory: "STANDARD",
  imageUrl: "",
  tags: "",
  lowStockThreshold: 10,
  active: true,
  containerEligible: true,
};

export function ProductForm({
  productId,
  values,
  categories,
  readOnly,
}: {
  productId: string | null;
  values: ProductFormValues;
  categories: { id: string; label: string }[];
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveProductAction.bind(null, productId), undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />
      <fieldset disabled={readOnly} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="SKU" htmlFor="p-sku" error={e.sku}>
            <Input id="p-sku" name="sku" defaultValue={values.sku} required className="font-mono uppercase" />
          </Field>
          <Field label="Product name" htmlFor="p-name" error={e.name} className="sm:col-span-2">
            <Input id="p-name" name="name" defaultValue={values.name} required />
          </Field>
          <Field label="Brand" htmlFor="p-brand" error={e.brand}>
            <Input id="p-brand" name="brand" defaultValue={values.brand} />
          </Field>
          <Field label="Category" htmlFor="p-category" error={e.categoryId}>
            <Select id="p-category" name="categoryId" defaultValue={values.categoryId} required>
              <option value="" disabled>
                Choose…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Barcode" htmlFor="p-barcode" error={e.barcode}>
            <Input id="p-barcode" name="barcode" defaultValue={values.barcode} />
          </Field>
          <Field label="Tags" htmlFor="p-tags" error={e.tags} hint="Comma separated, e.g. halal, bulk" className="sm:col-span-2">
            <Input id="p-tags" name="tags" defaultValue={values.tags} />
          </Field>
          <Field label="Description" htmlFor="p-desc" error={e.description} className="sm:col-span-2 lg:col-span-4">
            <Textarea id="p-desc" name="description" defaultValue={values.description} />
          </Field>
          <Field label="Image URL" htmlFor="p-image" error={e.imageUrl} className="sm:col-span-2 lg:col-span-4">
            <Input id="p-image" name="imageUrl" type="url" defaultValue={values.imageUrl} placeholder="https://…" />
          </Field>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">Packing &amp; ordering</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Sell unit" htmlFor="p-unit" error={e.sellUnit} hint="What one unit is, e.g. Carton 24 × 400g">
              <Input id="p-unit" name="sellUnit" defaultValue={values.sellUnit} required />
            </Field>
            <Field label="Items per sell unit" htmlFor="p-upc" error={e.unitsPerCarton}>
              <Input id="p-upc" name="unitsPerCarton" type="number" min="1" step="1" defaultValue={values.unitsPerCarton} required />
            </Field>
            <Field label="Minimum order (units)" htmlFor="p-moq" error={e.moq}>
              <Input id="p-moq" name="moq" type="number" min="1" step="1" defaultValue={values.moq} required />
            </Field>
            <Field label="Order multiple" htmlFor="p-mult" error={e.orderMultiple} hint="e.g. 5 = order in fives">
              <Input id="p-mult" name="orderMultiple" type="number" min="1" step="1" defaultValue={values.orderMultiple} required />
            </Field>
            <Field label="CBM per unit" htmlFor="p-cbm" error={e.cartonCbm}>
              <Input id="p-cbm" name="cartonCbm" type="number" min="0" step="0.0001" defaultValue={values.cartonCbm} required />
            </Field>
            <Field label="Weight per unit (kg)" htmlFor="p-kg" error={e.cartonWeightKg}>
              <Input id="p-kg" name="cartonWeightKg" type="number" min="0" step="0.001" defaultValue={values.cartonWeightKg} required />
            </Field>
            <Field label="Container shipping" htmlFor="p-cont" error={e.containerEligible} hint="No for chilled, frozen or hazardous goods">
              <Select id="p-cont" name="containerEligible" defaultValue={values.containerEligible ? "true" : "false"}>
                <option value="true">Allowed in dry containers</option>
                <option value="false">Not allowed</option>
              </Select>
            </Field>
            <Field label="Low-stock warning at" htmlFor="p-low" error={e.lowStockThreshold}>
              <Input id="p-low" name="lowStockThreshold" type="number" min="0" step="1" defaultValue={values.lowStockThreshold} required />
            </Field>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">Price &amp; tax</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Base price (FJD, excl. VAT)" htmlFor="p-price" error={e.basePrice} hint="Per sell unit, before tier/contract pricing">
              <Input id="p-price" name="basePrice" type="number" min="0" step="0.01" defaultValue={values.basePrice} required />
            </Field>
            <Field label="Cost price (FJD)" htmlFor="p-cost" error={e.costPrice} hint="Internal only, used for margin checks">
              <Input id="p-cost" name="costPrice" type="number" min="0" step="0.01" defaultValue={values.costPrice} />
            </Field>
            <Field label="VAT" htmlFor="p-vat" error={e.vatCategory}>
              <Select id="p-vat" name="vatCategory" defaultValue={values.vatCategory}>
                <option value="STANDARD">Standard 15% (0% for exports)</option>
                <option value="ZERO_RATED">Zero-rated</option>
                <option value="EXEMPT">Exempt</option>
              </Select>
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={values.active} className="accent-brand-600" /> Visible to customers
              </label>
            </div>
          </div>
        </div>
      </fieldset>
      {!readOnly && <SubmitButton>{productId ? "Save product" : "Create product"}</SubmitButton>}
    </form>
  );
}
