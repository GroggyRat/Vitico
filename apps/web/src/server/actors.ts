import type { CompanyRole, StaffRole } from "@vitico/db";

export type StaffActor = { id: string; staffRole: StaffRole };
export type CustomerActor = { id: string; companyId: string; companyRole: CompanyRole };
