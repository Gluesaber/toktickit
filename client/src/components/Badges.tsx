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
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened",
};

export function StatusBadge({ status }: { status: string }) {
  // Only NEW is reachable in Lab 2 (BR-02); the class falls back gracefully for later labs' values.
  const className = status === "NEW" ? "zg-badge zg-badge-status-new" : "zg-badge zg-badge-status-other";
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
