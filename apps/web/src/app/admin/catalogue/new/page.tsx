import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/lib/auth/guards";
import { getCategoryOptions } from "@/lib/categories";
import { ProductForm, emptyProduct } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireStaff("catalogue.manage");
  const categories = await getCategoryOptions();
  return (
    <>
      <div className="mb-2 text-sm">
        <Link href="/admin/catalogue" className="text-ink-muted hover:text-ink">
          Back to Catalogue
        </Link>
      </div>
      <PageHeader title="New product" />
      {categories.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Create a <Link href="/admin/catalogue/categories" className="text-brand-700 hover:underline">category</Link> first.
        </p>
      ) : (
        <Card>
          <CardBody>
            <ProductForm productId={null} values={emptyProduct} categories={categories} />
          </CardBody>
        </Card>
      )}
    </>
  );
}
