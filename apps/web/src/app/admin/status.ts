import type { CompanyStatus } from "@vitico/db/browser";
import type { BadgeTone } from "@/components/ui/badge";

export const companyStatusTone: Record<CompanyStatus, BadgeTone> = {
  PENDING: "amber",
  ACTIVE: "green",
  SUSPENDED: "red",
  REJECTED: "neutral",
};

export const companyStatusLabel: Record<CompanyStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REJECTED: "Rejected",
};
