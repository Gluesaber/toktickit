import type { ActionStatus } from "@prisma/client";

// Issue 4-2 (Lab 4) — Actions Taken rules as pure functions, so each rule is checked once in
// isolation (action-rules.unit.test.ts, UNIT-01..03) and then reused, not re-implemented, by the
// create/edit routes in app.ts. Same split as statusTransitions.ts in Lab 3.

// specification.md §5.3. COMPLETED and CANCELLED have no outgoing moves: they are final, and a final
// Action is locked against any edit (BR-10).
const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

// BR-10: a new Action may start Planned, In Progress or already Completed — never Cancelled.
export const ACTION_CREATE_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

export function isActionLocked(status: ActionStatus): boolean {
  return ACTION_TRANSITIONS[status].length === 0;
}

export function canCreateActionWithStatus(status: ActionStatus): boolean {
  return ACTION_CREATE_STATUSES.includes(status);
}

// An edit that re-sends the stored status unchanged isn't a move, so it's allowed here; the lock
// check (isActionLocked) is what stops edits to final Actions, independently of this.
export function canMoveAction(from: ActionStatus, to: ActionStatus): boolean {
  return from === to || ACTION_TRANSITIONS[from].includes(to);
}

export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 2000;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;
const COMPLETED_FUTURE_ALLOWANCE_MS = 5 * 60 * 1000; // BR-07 clock-skew allowance
const PLANNED_HORIZON_MS = 365 * 24 * 60 * 60 * 1000; // BR-07 scheduling horizon

// The complete set of fields an Action has after merging a request onto what's stored (or onto
// defaults, for a create). Validation always runs on this merged shape, so a PATCH that only sends
// `status: "COMPLETED"` is still checked against the stored `result` (api-spec.md §2).
export interface ActionDraft {
  actionAt: Date | null;
  description: string;
  result: string | null;
  status: ActionStatus;
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
}

export type FieldErrors = Record<string, string>;

// What a request body may carry, after type-checking but before any business rule. `undefined`
// means "not sent" (keep the stored or default value); every other value is a replacement.
export interface ActionInput {
  actionAt?: Date | null;
  description?: string;
  result?: string | null;
  status?: ActionStatus;
  assigneeId?: number;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

function optionalText(raw: unknown): string | null | undefined | false {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

// Type-level parsing of a create/edit body. Business rules (lengths, required-when, date bounds)
// are left to validateActionDraft so they run on the merged result. A value of the wrong JSON type
// is reported here and never reaches the merge.
export function parseActionInput(body: Record<string, unknown>): { input: ActionInput; fields: FieldErrors } {
  const input: ActionInput = {};
  const fields: FieldErrors = {};

  if (body.actionAt !== undefined) {
    const parsed = typeof body.actionAt === "string" ? new Date(body.actionAt) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      fields.actionAt = "Action date/time must be a valid date and time.";
    } else {
      input.actionAt = parsed;
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") fields.description = "Action description must be text.";
    else input.description = body.description.trim();
  }

  const result = optionalText(body.result);
  if (result === false) fields.result = "Result must be text.";
  else if (result !== undefined) input.result = result;

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !ACTION_STATUSES.includes(body.status as ActionStatus)) {
      fields.status = "Status must be Planned, In Progress, Completed or Cancelled.";
    } else {
      input.status = body.status as ActionStatus;
    }
  }

  if (body.assigneeId !== undefined) {
    const id = body.assigneeId;
    if (typeof id !== "number" || !Number.isInteger(id)) fields.assigneeId = "Assignee must be a user id.";
    else input.assigneeId = id;
  }

  if (body.followUpRequired !== undefined) {
    if (typeof body.followUpRequired !== "boolean") fields.followUpRequired = "Follow-up required must be true or false.";
    else input.followUpRequired = body.followUpRequired;
  }

  const followUpNote = optionalText(body.followUpNote);
  if (followUpNote === false) fields.followUpNote = "Follow-up note must be text.";
  else if (followUpNote !== undefined) input.followUpNote = followUpNote;

  const attachmentNotes = optionalText(body.attachmentNotes);
  if (attachmentNotes === false) fields.attachmentNotes = "Attachment notes must be text.";
  else if (attachmentNotes !== undefined) input.attachmentNotes = attachmentNotes;

  return { input, fields };
}

export function mergeActionDraft(base: ActionDraft, input: ActionInput): ActionDraft {
  const merged: ActionDraft = {
    actionAt: input.actionAt !== undefined ? input.actionAt : base.actionAt,
    description: input.description !== undefined ? input.description : base.description,
    result: input.result !== undefined ? input.result : base.result,
    status: input.status ?? base.status,
    followUpRequired: input.followUpRequired ?? base.followUpRequired,
    followUpNote: input.followUpNote !== undefined ? input.followUpNote : base.followUpNote,
    attachmentNotes: input.attachmentNotes !== undefined ? input.attachmentNotes : base.attachmentNotes,
  };
  // BR-09: when follow-up isn't required the note is stored as null, whatever the client sent.
  if (!merged.followUpRequired) merged.followUpNote = null;
  return merged;
}

// The lower bound is the Ticket's creation time truncated to the minute: the UI's
// `datetime-local` control has minute precision, so "the same minute the Ticket was created" must
// still be accepted even though it's a few seconds earlier than `createdAt` itself.
function startOfMinute(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setUTCSeconds(0, 0);
  return copy;
}

export function validateActionDraft(
  draft: ActionDraft,
  ctx: { ticketCreatedAt: Date; now: Date }
): FieldErrors {
  const fields: FieldErrors = {};

  // BR-07
  if (!draft.actionAt) {
    fields.actionAt = "Action date/time is required.";
  } else if (draft.actionAt.getTime() < startOfMinute(ctx.ticketCreatedAt).getTime()) {
    fields.actionAt = "Action date/time can't be earlier than when the ticket was created.";
  } else if (
    draft.status === "COMPLETED" &&
    draft.actionAt.getTime() > ctx.now.getTime() + COMPLETED_FUTURE_ALLOWANCE_MS
  ) {
    fields.actionAt = "A completed action can't be dated in the future.";
  } else if (draft.actionAt.getTime() > ctx.now.getTime() + PLANNED_HORIZON_MS) {
    fields.actionAt = "Action date/time can't be more than a year ahead.";
  }

  // BR-08
  if (!draft.description) {
    fields.description = "Action description is required.";
  } else if (draft.description.length > DESCRIPTION_MAX) {
    fields.description = `Action description must be at most ${DESCRIPTION_MAX} characters.`;
  }
  if (draft.result && draft.result.length > RESULT_MAX) {
    fields.result = `Result must be at most ${RESULT_MAX} characters.`;
  } else if (draft.status === "COMPLETED" && !draft.result) {
    fields.result = "Result is required when the action is completed.";
  }
  if (draft.attachmentNotes && draft.attachmentNotes.length > ATTACHMENT_NOTES_MAX) {
    fields.attachmentNotes = `Attachment notes must be at most ${ATTACHMENT_NOTES_MAX} characters.`;
  }

  // BR-09
  if (draft.followUpRequired) {
    if (!draft.followUpNote) {
      fields.followUpNote = "Follow-up note is required when follow-up is needed.";
    } else if (draft.followUpNote.length > FOLLOW_UP_NOTE_MAX) {
      fields.followUpNote = `Follow-up note must be at most ${FOLLOW_UP_NOTE_MAX} characters.`;
    }
  }

  return fields;
}
