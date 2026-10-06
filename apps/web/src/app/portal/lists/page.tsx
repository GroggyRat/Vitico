import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { customerCart } from "@/lib/cart-owner";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { addListAction, deleteListAction } from "../cart/actions";

export const metadata: Metadata = { title: "Saved lists" };

export default async function ListsPage() {
  const { company } = await customerCart("orders.place");
  const lists = await getDb().savedList.findMany({
    where: { companyId: company.id },
    orderBy: { name: "asc" },
    include: { items: { include: { product: { select: { name: true } } } } },
  });
  return (
    <>
      <PageHeader title="Saved lists" description="Regular orders you can add to the cart in one click. Save one from your cart." />
      {lists.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-ink-muted">No saved lists yet.</CardBody>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {lists.map((l) => (
          <Card key={l.id}>
            <CardBody className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold">{l.name}</h2>
                  <p className="text-xs text-ink-muted">
                    {l.items.length} products · saved {formatDate(l.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <ActionButton action={addListAction.bind(null, l.id)} variant="primary">
                    Add to cart
                  </ActionButton>
                  <ActionButton action={deleteListAction.bind(null, l.id)} variant="ghost" confirm={`Delete “${l.name}”?`}>
                    Delete
                  </ActionButton>
                </div>
              </div>
              <ul className="text-sm text-ink-muted">
                {l.items.slice(0, 6).map((i) => (
                  <li key={i.productId}>
                    {i.qty} × {i.product.name}
                  </li>
                ))}
                {l.items.length > 6 && <li>+ {l.items.length - 6} more</li>}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
