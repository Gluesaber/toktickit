const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface Requester {
  id: number;
  name: string;
  email: string;
}

// Issue 2-3 (Lab 2) — active Development Requesters for the Selection screen (BR-07, BR-35).
export async function getRequesters(): Promise<Requester[]> {
  const res = await fetch(`${API_URL}/api/requesters`);
  if (!res.ok) {
    throw new Error("Unable to load development requesters.");
  }
  return res.json();
}
