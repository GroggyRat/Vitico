import type { Metadata } from "next";
import { ContainerBuilder } from "@/components/containers/builder";
import { requireCustomer } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Container" };

export default async function ContainerPage({ params }: PageProps<"/portal/containers/[id]">) {
  const { user, actor } = await requireCustomer("orders.place");
  const { id } = await params;
  return <ContainerBuilder buildId={id} base="/portal/containers" access={{ kind: "customer", userId: user.id, companyId: actor.companyId }} />;
}
