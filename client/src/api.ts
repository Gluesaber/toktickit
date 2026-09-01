const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
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

export interface TicketListQuery {
  requesterId: number;
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
  createdAt: string;
  updatedAt: string;
  attachments: Attachment[];
}

export interface CreateTicketInput {
  requesterId: number;
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
export async function getCategories(): Promise<Category[]> {
  const res = await fetch(`${API_URL}/api/categories`);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-4 (Lab 2) — active Related Systems, for the Create Ticket classification group.
export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  const res = await fetch(`${API_URL}/api/related-systems`);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-3 (Lab 2) — active Development Requesters for the Selection screen (BR-07, BR-35).
export async function getRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-5 (Lab 2) — the current Requester's ticket list: search/filter/sort/pagination.
// api-spec.md §4 is the exact query contract.
export async function getTickets(query: TicketListQuery): Promise<TicketListResponse> {
  const params = new URLSearchParams();
  params.set("requesterId", String(query.requesterId));
  if (query.search) params.set("search", query.search);
  if (query.categoryId !== undefined) params.set("categoryId", String(query.categoryId));
  if (query.relatedSystemId !== undefined) params.set("relatedSystemId", String(query.relatedSystemId));
  if (query.requestedPriority) params.set("requestedPriority", query.requestedPriority);
  if (query.currentStatus) params.set("currentStatus", query.currentStatus);
  if (query.sortBy) params.set("sortBy", query.sortBy);
  if (query.sortDir) params.set("sortDir", query.sortDir);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined) params.set("pageSize", String(query.pageSize));

  const res = await fetch(`${API_URL}/api/tickets?${params.toString()}`);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-6 (Lab 2) — one owned Ticket + its Attachments, for Ticket Detail. Nonexistent and
// not-owned both surface as the same ApiError (code NOT_FOUND) — BR-12, BR-40, AC-21.
export async function getTicket(id: number, requesterId: number): Promise<TicketDetail> {
  const params = new URLSearchParams({ requesterId: String(requesterId) });
  const res = await fetch(`${API_URL}/api/tickets/${id}?${params.toString()}`);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// Issue 2-4 (Lab 2) — create a Ticket (AC-01). Attachments are handled separately by Issue 2-7,
// per the two-step design documented in api-spec.md §2.
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const res = await fetch(`${API_URL}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}
