import { Priority, Role } from "../api.js";

// Issue 2-5 (Lab 2) — Priority/Status badges. docs/lab-02/ui-spec.md §1.5. Every badge renders a
// color fill *and* a text label together — never color alone.
const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const PRIORITY_CLASSES: Record<Priority, string> = {
  LOW: "zg-badge zg-badge-priority-low",
  MEDIUM: "zg-badge zg-badge-priority-medium",
  HIGH: "zg-badge zg-badge-priority-high",
  URGENT: "zg-badge zg-badge-priority-urgent",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={PRIORITY_CLASSES[priority]}>{PRIORITY_LABELS[priority]}</span>;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened",
};

// Issue 3-4 (Lab 3) — all 8 statuses now map to their own class (docs/lab-03/ui-spec.md §1.2,
// specified in Issue 3-2 but only implemented now that the Queue needs to tell them apart). OPEN and
// WAITING_FOR_REQUESTER can't actually appear on any Ticket yet (Issue 3-5's transition endpoint is
// what produces them) — mapped anyway so nothing needs to change here when that issue ships.
const STATUS_CLASSES: Record<string, string> = {
  NEW: "zg-badge zg-badge-status-new",
  OPEN: "zg-badge zg-badge-status-open",
  IN_PROGRESS: "zg-badge zg-badge-status-in_progress",
  WAITING_FOR_REQUESTER: "zg-badge zg-badge-status-waiting_for_requester",
  RESOLVED: "zg-badge zg-badge-status-resolved",
  CLOSED: "zg-badge zg-badge-status-closed",
  CANCELLED: "zg-badge zg-badge-status-cancelled",
  REOPENED: "zg-badge zg-badge-status-reopened",
};

export function StatusBadge({ status }: { status: string }) {
  const className = STATUS_CLASSES[status] ?? "zg-badge zg-badge-status-other";
  return <span className={className}>{STATUS_LABELS[status] ?? status}</span>;
}

// Issue 3-2 (Lab 3) — docs/lab-03/ui-spec.md §1.3. Used by the AppShell identity chip now; the
// Ticket Queue's Ticket Owner column and User Management's Role column reuse it starting Issue
// 3-4/3-6.
const ROLE_LABELS: Record<Role, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

const ROLE_CLASSES: Record<Role, string> = {
  REQUESTER: "zg-badge zg-badge-role-requester",
  IT_STAFF: "zg-badge zg-badge-role-it_staff",
  ADMINISTRATOR: "zg-badge zg-badge-role-administrator",
};

export function RoleBadge({ role }: { role: Role }) {
  return <span className={ROLE_CLASSES[role]}>{ROLE_LABELS[role]}</span>;
}
