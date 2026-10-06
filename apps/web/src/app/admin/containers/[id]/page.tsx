import type { Metadata } from "next";
import { ContainerBuilder } from "@/components/containers/builder";
import { requireStaff } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Container" };

export default async function AdminContainerPage({ params }: PageProps<"/admin/containers/[id]">) {
  const { user, actor } = await requireStaff("orders.place_for_customer");
  const { id } = await params;
  return <ContainerBuilder buildId={id} base="/admin/containers" access={{ kind: "staff", userId: user.id, actor }} />;
}
