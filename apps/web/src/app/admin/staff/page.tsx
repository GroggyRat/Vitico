import type { Metadata } from "next";
import { UserStatus } from "@vitico/db";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { requireStaff } from "@/lib/auth/guards";
import { staffRoleLabels } from "@/lib/auth/permissions";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { resendStaffInviteAction, resetLinkAction } from "../actions";
import { InviteStaffForm, StaffRowForm } from "./staff-forms";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const { actor } = await requireStaff("staff.manage");
  const staff = await getDb().user.findMany({ where: { staffRole: { not: null } }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="Staff" description="VITICO team members who can use the admin." />
      <Card className="mb-6">
        <CardHeader title="Invite a staff member" />
        <CardBody>
          <InviteStaffForm />
        </CardBody>
      </Card>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role &amp; status</Th>
              <Th>Last sign-in</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {staff.map((u) => (
              <tr key={u.id}>
                <Td>
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-ink-muted">
                    {u.email}
                    {u.status === UserStatus.INVITED && " · invite pending"}
                  </div>
                </Td>
                <Td>
                  {u.id === actor.id ? (
                    <span className="text-ink-muted">{staffRoleLabels[u.staffRole!]} (you)</span>
                  ) : (
                    <StaffRowForm userId={u.id} staffRole={u.staffRole!} active={u.status !== UserStatus.DISABLED} />
                  )}
                </Td>
                <Td className="text-ink-muted">{formatDateTime(u.lastLoginAt)}</Td>
                <Td className="text-right">
                  {u.id !== actor.id && u.status === UserStatus.ACTIVE && (
                    <ActionButton action={resetLinkAction.bind(null, u.id)}>Password reset link</ActionButton>
                  )}
                  {u.id !== actor.id && u.status === UserStatus.INVITED && (
                    <ActionButton action={resendStaffInviteAction.bind(null, u.id)}>New invite link</ActionButton>
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
