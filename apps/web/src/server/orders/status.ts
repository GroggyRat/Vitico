import type { OrderStatus } from "@vitico/db/browser";

/**
 * Order lifecycle (SPEC §7). Every status change goes through `assertTransition`.
 *
 *   PENDING_CUSTOMER_APPROVAL ─┐
 *   PENDING_PRICE_APPROVAL ────┼─► SUBMITTED ► CONFIRMED ► PROCESSING ► READY ► DISPATCHED ► COMPLETED
 *                               │                 └──────── ON_HOLD ◄──────┘      PARTIALLY_FULFILLED ┘
 *   anything before dispatch ──► CANCELLED
 */
const transitions: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_CUSTOMER_APPROVAL", "PENDING_PRICE_APPROVAL", "SUBMITTED", "CANCELLED"],
  PENDING_CUSTOMER_APPROVAL: ["PENDING_PRICE_APPROVAL", "SUBMITTED", "CANCELLED"],
  PENDING_PRICE_APPROVAL: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CONFIRMED", "ON_HOLD", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "ON_HOLD", "CANCELLED"],
  PROCESSING: ["READY", "ON_HOLD", "CANCELLED"],
  READY: ["DISPATCHED", "PARTIALLY_FULFILLED", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["SUBMITTED", "CONFIRMED", "PROCESSING", "READY", "CANCELLED"],
  DISPATCHED: ["COMPLETED"],
  PARTIALLY_FULFILLED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return transitions[from].includes(to);
}

export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return transitions[from];
}

/** Statuses in which the order's stock is reserved. */
export const HOLDS_STOCK: OrderStatus[] = [
  "PENDING_CUSTOMER_APPROVAL",
  "PENDING_PRICE_APPROVAL",
  "SUBMITTED",
  "CONFIRMED",
  "PROCESSING",
  "READY",
  "ON_HOLD",
];

/** Orders that still count against the customer's credit. */
export const OPEN_STATUSES: OrderStatus[] = [...HOLDS_STOCK, "DISPATCHED", "PARTIALLY_FULFILLED", "COMPLETED"];

export const statusLabel: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  PENDING_CUSTOMER_APPROVAL: "Awaiting your approval",
  PENDING_PRICE_APPROVAL: "Awaiting price approval",
  SUBMITTED: "Submitted",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  READY: "Ready",
  ON_HOLD: "On hold",
  DISPATCHED: "Dispatched",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const statusTone: Record<OrderStatus, "neutral" | "brand" | "green" | "amber" | "red"> = {
  DRAFT: "neutral",
  PENDING_CUSTOMER_APPROVAL: "amber",
  PENDING_PRICE_APPROVAL: "amber",
  SUBMITTED: "brand",
  CONFIRMED: "brand",
  PROCESSING: "brand",
  READY: "brand",
  ON_HOLD: "red",
  DISPATCHED: "green",
  PARTIALLY_FULFILLED: "green",
  COMPLETED: "green",
  CANCELLED: "neutral",
};
