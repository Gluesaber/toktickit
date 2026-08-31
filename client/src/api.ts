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
