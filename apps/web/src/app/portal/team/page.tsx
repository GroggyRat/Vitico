import type { Metadata } from "next";
import { UserStatus } from "@vitico/db";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireCustomer } from "@/lib/auth/guards";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resendInviteAction, setUserActiveAction } from "../actions";
import { InviteForm } from "./invite-form";
import { MemberForm } from "./member-form";

export const metadata: Metadata = { title: "Team" };

const statusTone: Record<UserStatus, BadgeTone> = { ACTIVE: "green", INVITED: "amber", PENDING: "amber", DISABLED: "neutral" };
const statusLabel: Record<UserStatus, string> = { ACTIVE: "Active", INVITED: "Invited", PENDING: "Pending", DISABLED: "Disabled" };

export default async function TeamPage() {
  const { actor } = await requireCustomer("team.manage");
  const users = await getDb().user.findMany({
    where: { companyId: actor.companyId },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHeader title="Team" description="Who can sign in for your business, and what they can do." />
      <Card className="mb-6">
        <CardHeader title="Invite a team member" description="Purchasing users place orders; Accounts users see invoices and payments; Owners can do everything." />
        <CardBody>
          <InviteForm />
        </CardBody>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Role &amp; approval limit</Th>
              <Th>Last sign-in</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="font-medium">
                    {u.name} {u.id === actor.id && <span className="text-xs font-normal text-ink-muted">(you)</span>}
                  </div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </Td>
                <Td>
                  <Badge tone={statusTone[u.status]}>{statusLabel[u.status]}</Badge>
                </Td>
                <Td>
                  {u.id === actor.id ? (
                    <span className="text-ink-muted">Owner</span>
                  ) : (
                    <MemberForm userId={u.id} role={u.companyRole!} orderLimit={u.orderLimit?.toString() ?? null} />
                  )}
                </Td>
                <Td className="text-ink-muted">{formatDate(u.lastLoginAt)}</Td>
                <Td className="text-right">
                  {u.id !== actor.id && (
                    <div className="flex flex-col items-end gap-2">
                      {u.status === UserStatus.INVITED && (
                        <ActionButton action={resendInviteAction.bind(null, u.id)}>New invite link</ActionButton>
                      )}
                      {u.status === UserStatus.DISABLED ? (
                        <ActionButton action={setUserActiveAction.bind(null, u.id, true)}>Enable</ActionButton>
                      ) : (
                        <ActionButton
                          action={setUserActiveAction.bind(null, u.id, false)}
                          confirm={`Disable ${u.name}? They will be signed out immediately.`}
                        >
                          Disable
                        </ActionButton>
                      )}
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
