import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { Prisma } from "@vitico/db";

type Build = Prisma.ContainerBuildGetPayload<{ include: { containerType: true; destinationRegion: true; company: { select: { name: true } }; _count: { select: { lines: true } } } }>;

export function BuildList({ builds, base, showCompany }: { builds: Build[]; base: string; showCompany?: boolean }) {
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Container</Th>
            {showCompany && <Th>Customer</Th>}
            <Th>Destination</Th>
            <Th className="text-right">Products</Th>
            <Th>Updated</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {builds.length === 0 && <EmptyRow colSpan={showCompany ? 6 : 5}>No containers yet.</EmptyRow>}
          {builds.map((b) => (
            <tr key={b.id}>
              <Td>
                <Link href={`${base}/${b.id}`} className="font-medium text-brand-700 hover:underline">
                  {b.name}
                </Link>
                <div className="text-xs text-ink-muted">{b.containerType.name}</div>
              </Td>
              {showCompany && <Td>{b.company.name}</Td>}
              <Td>{b.destinationRegion.name}</Td>
              <Td className="text-right tabular-nums">{b._count.lines}</Td>
              <Td className="text-ink-muted">{formatDateTime(b.updatedAt)}</Td>
              <Td>
                <Badge tone={b.status === "DRAFT" ? "amber" : "green"}>{b.status === "DRAFT" ? "Draft" : "Ordered"}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
