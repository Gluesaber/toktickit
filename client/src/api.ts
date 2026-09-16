const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

// The shape nested under TicketDetail.requester (id/name/email) — not tied to the removed
// Development Requester Selector, which used to be this interface's only consumer.
export interface Requester {
  id: number;
  name: string;
  email: string;
}

// Issue 3-2 (Lab 3) — the authenticated identity (specification.md §7, api-spec.md §1). Never
// includes passwordHash — the backend never sends it (BR-06/BR-16).
export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
}

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  relatedSystemName: string;
  requestedPriority: Priority;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TicketListResponse {
  data: TicketListItem[];
  pagination: PaginationMeta;
}

export type SortField = "createdAt" | "ticketNumber" | "currentStatus" | "requestedPriority";
export type SortDir = "asc" | "desc";

// Issue 3-3 (Lab 3) — `requesterId` removed (BR-03/BR-17): the authenticated session determines
// whose tickets these are, never a client-supplied field.
export interface TicketListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: Priority;
  currentStatus?: string;
  sortBy?: SortField;
  sortDir?: SortDir;
  page?: number;
  pageSize?: number;
}

export interface Attachment {
  id: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
  removalReason: string | null;
  active: boolean;
}

// Issue 3-3 (Lab 3) — Public Comments (api-spec.md §4).
export interface Comment {
  id: number;
  author: { id: number; name: string; role: Role };
  content: string;
  createdAt: string;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  requester: Requester;
  category: Category;
  relatedSystem: RelatedSystem;
  summary: string;
  description: string;
  requestedPriority: Priority;
  currentStatus: string;
  requesterConfirmedResolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
  comments: Comment[];
}

// Issue 3-3 (Lab 3) — `requesterId` removed, same reasoning as TicketListQuery above.
export interface CreateTicketInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: Priority;
}

// api-spec.md §0 — every error response shares this envelope.
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
  };
}

export class ApiError extends Error {
  code: string;
  fields?: Record<string, string>;

  constructor(body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.fields = body.error.fields;
  }
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error?.code) {
      throw new ApiError(body);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
  }
  throw new ApiError({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
}

// Issue 2-4 (Lab 2) — active Categories, for the Create Ticket classification group.
// Issue 3-3 (Lab 3) — now session-gated (BR-11); `credentials: "include"` added.
export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-4 (Lab 2) — active Related Systems, for the Create Ticket classification group.
export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-5 (Lab 2) — the current Requester's ticket list: search/filter/sort/pagination.
// api-spec.md §4 is the exact query contract.
// Issue 3-3 (Lab 3) — no requesterId param; identity comes from the session cookie.
export async function getTickets(query: TicketListQuery): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) params.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.currentStatus) params.set("currentStatus", query.currentStatus);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));

  const res = await fetch(`${API_URL}/api/tickets?${params.toString()}`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-6 (Lab 2) — one owned Ticket + its Attachments/Comments, for Ticket Detail. Nonexistent
// and not-owned both surface as the same ApiError (code NOT_FOUND) — BR-12, BR-40, AC-21.
export async function getTicket(id: number): Promise<TicketDetail> {
  const res = await fetch(`${API_URL}/api/tickets/${id}`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-4 (Lab 2) — create a Ticket (AC-01). Attachments are uploaded separately by Issue 2-7's
// functions below, per the two-step design documented in api-spec.md §2.
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-7 (Lab 2) — add an Attachment to an owned Ticket (AC-06, AC-25, BR-27–BR-30).
export async function uploadAttachment(ticketId: number, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-7 (Lab 2) — soft-remove an owned, active Attachment (AC-26, BR-31).
export async function removeAttachment(attachmentId: number, reason?: string): Promise<Attachment> {
  const res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-7 (Lab 2) — download URL for an active Attachment (AC-22). Rendered as a plain <a href>
// so the browser handles the download directly via the server's Content-Disposition header, rather
// than fetching the bytes through JS — the browser's own navigation carries the session cookie
// automatically (same-origin via vite.config.ts's dev proxy), no requesterId param needed anymore.
export function getAttachmentDownloadUrl(attachmentId: number): string {
  return `${API_URL}/api/attachments/${attachmentId}/download`;
}

// ---------------------------------------------------------------------------
// Issue 3-3 (Lab 3) — Public Comments + "Problem Appears Resolved". api-spec.md §3/§4.
// ---------------------------------------------------------------------------

export async function getComments(ticketId: number): Promise<Comment[]> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function postComment(ticketId: number, content: string): Promise<Comment> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function markProblemResolved(ticketId: number): Promise<{ id: number; requesterConfirmedResolvedAt: string }> {
  const res = await fetch(`${API_URL}/api/tickets/${ticketId}/resolved-indication`, {
    method: "PATCH",
    credentials: "include",
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Issue 3-4 (Lab 3) — the Staff Ticket Queue. api-spec.md §6/§7.
// ---------------------------------------------------------------------------

export interface StaffTicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  requesterName: string;
  requestedPriority: Priority;
  itPriority: Priority;
  currentStatus: string;
  owner: { id: number; name: string; role: Role } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffTicketListResponse {
  data: StaffTicketListItem[];
  pagination: PaginationMeta;
}

export type StaffSortField = "createdAt" | "currentStatus" | "itPriority" | "updatedAt";

export interface StaffTicketListQuery {
  search?: string;
  categoryId?: number;
  requestedPriority?: Priority;
  itPriority?: Priority;
  currentStatus?: string;
  ownerId?: number | "unassigned";
  sortBy?: StaffSortField;
  sortDir?: SortDir;
  page?: number;
  pageSize?: number;
}

export async function getStaffTickets(query: StaffTicketListQuery): Promise<StaffTicketListResponse> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.itPriority) params.set("itPriority", query.itPriority);
  if (query.currentStatus) params.set("currentStatus", query.currentStatus);
  if (query.ownerId !== undefined) params.set("ownerId", String(query.ownerId));
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));

  const res = await fetch(`${API_URL}/api/staff/tickets?${params.toString()}`, { credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Issue 3-2 (Lab 3) — Authentication. api-spec.md §1.
// `credentials: "include"` on every one of these: the session cookie (BR-09) needs to ride along
// even though vite.config.ts's dev proxy already makes this same-origin in practice — explicit here
// so these calls stay correct if API_URL is ever pointed at a different origin.
// ---------------------------------------------------------------------------

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/logout`, { method: "POST", credentials: "include" });
  if (!res.ok) return parseErrorAndThrow(res);
}

// Returns null for an unauthenticated caller (401) rather than throwing — callers use this to
// restore/check session state on load, where "not logged in" is an expected outcome, not a failure.
export async function getMe(): Promise<User | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function changePassword(newPassword: string, confirmPassword: string): Promise<User> {
  const res = await fetch(`${API_URL}/api/auth/change-password`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword, confirmPassword }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}
