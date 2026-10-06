import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { CSV_COLUMNS, MAX_IMPORT_ROWS } from "@/server/services/catalogue";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportPage() {
  await requireStaff("catalogue.manage");
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/catalogue" className="text-ink-muted hover:text-ink">
          Back to Catalogue
        </Link>
      </div>
      <PageHeader
        title="Import products"
        description="Create or update products in bulk from a CSV. Rows are matched by SKU. If any row has a problem, nothing is imported."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upload" />
          <CardBody>
            <ImportForm />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="File format" />
          <CardBody className="space-y-3 text-sm">
            <p>
              The easiest start is to{" "}
              <a download href="/admin/catalogue/export" className="text-brand-700 hover:underline">
                export the current catalogue
              </a>
              ,
              edit it in Excel, and import it back. Up to {MAX_IMPORT_ROWS.toLocaleString()} rows per file.
            </p>
            <p>Columns (first row = headers):</p>
            <p className="font-mono text-xs leading-relaxed text-ink-muted">{CSV_COLUMNS.join(", ")}</p>
            <ul className="list-disc space-y-1 pl-5 text-ink-muted">
              <li>
                Required: <code>sku</code>, <code>name</code>, <code>category</code> (slug or name), <code>base_price</code>.
              </li>
              <li>
                <code>vat</code>: STANDARD, ZERO_RATED or EXEMPT. <code>active</code>: true/false.
              </li>
              <li>
                Optional <code>receive_qty</code> column books a stock receipt for that row.
              </li>
              <li>Extra columns (like on_hand / available in exports) are ignored.</li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
