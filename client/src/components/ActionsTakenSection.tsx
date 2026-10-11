import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ActionStatus,
  ActionTaken,
  ApiError,
  StaffUser,
  createAction,
  newClientRequestId,
  updateAction,
} from "../api.js";
import { ActionStatusBadge, FollowUpBadge, RoleBadge, actionStatusLabel } from "./Badges.js";

// Issue 4-4 (Lab 4) — the Actions Taken card, docs/lab-04/ui-spec.md §5.3 (staff) and §6 (Requester).
// FR-01–FR-06, BR-03–BR-15. One component for both screens:
//   * mode "staff": list + Add Action + View/Edit in an inline panel inside the card (not a modal),
//     so the Ticket stays in view while recording work;
//   * mode "requester": the same list, read-only, every field visible (BR-15), plainer labels.
// The backend is the authority on every rule; the checks here only stop a request the server would
// certainly refuse, and every server answer (400 fields, 409s) is still shown in place.

const TICKET_NOT_ACTIONABLE = ["CLOSED", "CANCELLED"]; // BR-12
const COMPLETED_FUTURE_ALLOWANCE_MS = 5 * 60 * 1000; // BR-07
const DESCRIPTION_MAX = 2000;
const RESULT_MAX = 2000;
const FOLLOW_UP_NOTE_MAX = 1000;
const ATTACHMENT_NOTES_MAX = 500;

// specification.md §5.3 — the moves offered from a stored status, besides keeping it. Cancelling is
// its own button (with a confirm step), so it isn't listed here.
const EDIT_MOVES: Record<ActionStatus, ActionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "COMPLETED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};
const CREATE_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS", "COMPLETED"];

const isLocked = (s: ActionStatus) => s === "COMPLETED" || s === "CANCELLED"; // BR-10

const LABELS = {
  staff: {
    actionAt: "Date/Time",
    description: "Description",
    result: "Result",
    status: "Status",
    performedBy: "Performed by",
    assignee: "Assignee",
    followUp: "Follow-up",
    attachmentNotes: "Attachment notes",
  },
  requester: {
    actionAt: "When",
    description: "What was done",
    result: "Result",
    status: "Status",
    performedBy: "Who did it",
    assignee: "Responsible",
    followUp: "Follow-up planned",
    attachmentNotes: "Files to look at",
  },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

// <input type="datetime-local"> works in local wall-clock time with minute precision.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfMinute(d: Date): Date {
  const copy = new Date(d.getTime());
  copy.setSeconds(0, 0);
  return copy;
}

interface FormValues {
  actionAt: string; // datetime-local value
  description: string;
  status: ActionStatus;
  result: string;
  assigneeId: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function validate(v: FormValues, ticketCreatedAt: string): FieldErrors {
  const errors: FieldErrors = {};
  const now = new Date();
  const at = v.actionAt ? new Date(v.actionAt) : null;
  if (!at || Number.isNaN(at.getTime())) {
    errors.actionAt = "Action date/time is required.";
  } else if (at.getTime() < startOfMinute(new Date(ticketCreatedAt)).getTime()) {
    errors.actionAt = "Action date/time can't be earlier than when the ticket was created.";
  } else if (v.status === "COMPLETED" && at.getTime() > now.getTime() + COMPLETED_FUTURE_ALLOWANCE_MS) {
    errors.actionAt = "A completed action can't be dated in the future.";
  }
  if (!v.description.trim()) errors.description = "Action description is required.";
  else if (v.description.trim().length > DESCRIPTION_MAX) errors.description = `At most ${DESCRIPTION_MAX} characters.`;
  if (v.result.trim().length > RESULT_MAX) errors.result = `At most ${RESULT_MAX} characters.`;
  else if (v.status === "COMPLETED" && !v.result.trim()) errors.result = "Result is required when the action is completed.";
  if (v.followUpRequired) {
    if (!v.followUpNote.trim()) errors.followUpNote = "Follow-up note is required when follow-up is needed.";
    else if (v.followUpNote.trim().length > FOLLOW_UP_NOTE_MAX) errors.followUpNote = `At most ${FOLLOW_UP_NOTE_MAX} characters.`;
  }
  if (v.attachmentNotes.trim().length > ATTACHMENT_NOTES_MAX) errors.attachmentNotes = `At most ${ATTACHMENT_NOTES_MAX} characters.`;
  if (!v.assigneeId) errors.assigneeId = "Choose an assignee.";
  return errors;
}

function valuesFromAction(a: ActionTaken): FormValues {
  return {
    actionAt: toLocalInput(new Date(a.actionAt)),
    description: a.description,
    status: a.status,
    result: a.result ?? "",
    assigneeId: String(a.assignee.id),
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote ?? "",
    attachmentNotes: a.attachmentNotes ?? "",
  };
}

function toPayload(v: FormValues) {
  return {
    actionAt: new Date(v.actionAt).toISOString(),
    description: v.description.trim(),
    status: v.status,
    result: v.result.trim() || null,
    assigneeId: Number(v.assigneeId),
    followUpRequired: v.followUpRequired,
    followUpNote: v.followUpRequired ? v.followUpNote.trim() : null,
    attachmentNotes: v.attachmentNotes.trim() || null,
  };
}

type Panel = { kind: "none" } | { kind: "create" } | { kind: "view"; id: number } | { kind: "edit"; id: number };

interface Props {
  ticketId: number;
  ticketCreatedAt: string;
  ticketStatus: string;
  actions: ActionTaken[];
  mode: "staff" | "requester";
  staffUsers?: StaffUser[];
  currentUser?: { id: number; name: string } | null;
  // True when the Ticket's latest status change was into Reopened (ui-spec.md §5.3 "After a Reopen").
  reopened?: boolean;
  onSaved?: (action: ActionTaken) => void;
  onReload?: () => Promise<void> | void;
}

export default function ActionsTakenSection({
  ticketId,
  ticketCreatedAt,
  ticketStatus,
  actions,
  mode,
  staffUsers = [],
  currentUser = null,
  reopened = false,
  onSaved,
  onReload,
}: Props) {
  const labels = LABELS[mode];
  const isStaff = mode === "staff";
  const actionable = !TICKET_NOT_ACTIONABLE.includes(ticketStatus);

  const [panel, setPanel] = useState<Panel>({ kind: "none" });
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  function open(next: Panel) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPanel(next);
  }

  // Return focus to whatever opened the panel, or to Add Action if that control is gone (it is
  // hidden while the create form is open, so it's a new element afterwards). Issue 4-6 (Lab 4) —
  // done in an effect, after React has committed the closed panel: the first version used
  // requestAnimationFrame, which after an async save could run before the Add Action button
  // existed again, leaving focus on <body> (caught intermittently by RESP-04).
  const restoreFocus = useRef(false);

  function close() {
    restoreFocus.current = true;
    setPanel({ kind: "none" });
  }

  useEffect(() => {
    if (panel.kind !== "none" || !restoreFocus.current) return;
    restoreFocus.current = false;
    const opener = openerRef.current && document.body.contains(openerRef.current) ? openerRef.current : null;
    (opener ?? addButtonRef.current)?.focus();
  }, [panel]);

  function handleSaved(action: ActionTaken, message: string) {
    onSaved?.(action);
    setLastSavedId(action.id);
    setAnnouncement(message);
    close();
  }

  const selected = panel.kind === "view" || panel.kind === "edit" ? actions.find((a) => a.id === panel.id) : undefined;

  return (
    <div className="card mt-3" id="actions">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <h2 className="h6 card-title mb-0">Actions Taken ({actions.length})</h2>
          {isStaff && actionable && panel.kind !== "create" && (
            <button ref={addButtonRef} type="button" className="btn btn-zg-primary btn-sm" onClick={() => open({ kind: "create" })}>
              Add Action
            </button>
          )}
        </div>

        <div aria-live="polite" className="visually-hidden">
          {announcement}
        </div>

        {!actionable && actions.length > 0 && (
          <p className="small text-muted mb-2">This ticket is closed; actions are read-only.</p>
        )}
        {isStaff && actionable && reopened && (
          <p className="small mb-2 text-body-secondary">Reopened — record what is done to fix the recurrence.</p>
        )}

        {isStaff && panel.kind === "create" && (
          <ActionForm
            mode="create"
            ticketId={ticketId}
            ticketCreatedAt={ticketCreatedAt}
            staffUsers={staffUsers}
            currentUser={currentUser}
            onCancel={close}
            onSaved={(a) => handleSaved(a, "Action saved.")}
            onReload={onReload}
          />
        )}
        {isStaff && panel.kind === "view" && selected && (
          <ActionView
            action={selected}
            canEdit={actionable && !isLocked(selected.status)}
            onEdit={() => setPanel({ kind: "edit", id: selected.id })}
            onClose={close}
          />
        )}
        {isStaff && panel.kind === "edit" && selected && (
          <ActionForm
            mode="edit"
            ticketId={ticketId}
            ticketCreatedAt={ticketCreatedAt}
            staffUsers={staffUsers}
            currentUser={currentUser}
            action={selected}
            onCancel={close}
            onSaved={(a) => handleSaved(a, a.status === "CANCELLED" ? "Action cancelled." : "Action updated.")}
            onReload={onReload}
          />
        )}

        {actions.length === 0 ? (
          <p className="text-muted small mb-0">
            {isStaff ? "No actions recorded yet." : "IT hasn't recorded any actions on this ticket yet."}
          </p>
        ) : (
          <>
            {/* ≥992px: table. Issue 4-6 (Lab 4) — was ≥768px, but at tablet width (820px) the eight
                columns needed ~756px inside a narrower card and pushed the page sideways (caught by
                RESP-02). Below 992px the stacked cards are used instead. Free-text cells wrap. */}
            <div className="d-none d-lg-block">
              <table className="table table-sm align-top mb-0">
                <thead>
                  <tr>
                    <th scope="col">{labels.actionAt}</th>
                    <th scope="col">{labels.description}</th>
                    <th scope="col">{labels.result}</th>
                    <th scope="col">{labels.status}</th>
                    <th scope="col">{labels.performedBy}</th>
                    <th scope="col">{labels.assignee}</th>
                    <th scope="col">{labels.followUp}</th>
                    {isStaff && (
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id} className={a.id === lastSavedId ? "zg-row-saved" : undefined} data-action-id={a.id}>
                      <td className="text-nowrap small">{formatDateTime(a.actionAt)}</td>
                      <td className="zg-wrap">
                        {a.description}
                        {a.attachmentNotes && (
                          <div className="small text-muted mt-1">
                            {labels.attachmentNotes}: {a.attachmentNotes}
                          </div>
                        )}
                      </td>
                      <td className="zg-wrap">{a.result ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <ActionStatusBadge status={a.status} />
                      </td>
                      <td>{a.performedBy.name}</td>
                      <td>
                        <AssigneeName assignee={a.assignee} />
                      </td>
                      <td className="zg-wrap">
                        {a.followUpRequired ? (
                          <>
                            <FollowUpBadge />
                            <div className="small mt-1">{a.followUpNote}</div>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      {isStaff && (
                        <td className="text-nowrap">
                          <RowButtons action={a} actionable={actionable} onOpen={open} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* <992px (tablet and phone): one card per Action, label/value pairs stacked. */}
            <ul className="list-unstyled d-lg-none mb-0">
              {actions.map((a) => (
                <li key={a.id} className={`ticket-card${a.id === lastSavedId ? " zg-row-saved" : ""}`} data-action-id={a.id}>
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <ActionStatusBadge status={a.status} />
                    <span className="small text-muted">{formatDateTime(a.actionAt)}</span>
                  </div>
                  <dl className="mb-0 small">
                    <dt>{labels.description}</dt>
                    <dd className="zg-wrap">{a.description}</dd>
                    <dt>{labels.result}</dt>
                    <dd className="zg-wrap">{a.result ?? "—"}</dd>
                    <dt>{labels.performedBy}</dt>
                    <dd>{a.performedBy.name}</dd>
                    <dt>{labels.assignee}</dt>
                    <dd>
                      <AssigneeName assignee={a.assignee} />
                    </dd>
                    {a.followUpRequired && (
                      <>
                        <dt>{labels.followUp}</dt>
                        <dd className="zg-wrap">
                          <FollowUpBadge /> {a.followUpNote}
                        </dd>
                      </>
                    )}
                    {a.attachmentNotes && (
                      <>
                        <dt>{labels.attachmentNotes}</dt>
                        <dd className="zg-wrap">{a.attachmentNotes}</dd>
                      </>
                    )}
                  </dl>
                  {isStaff && (
                    <div className="mt-2">
                      <RowButtons action={a} actionable={actionable} onOpen={open} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function AssigneeName({ assignee }: { assignee: ActionTaken["assignee"] }) {
  return (
    <span>
      {assignee.name}
      {!assignee.isActive && <span className="text-muted"> (inactive)</span>}
    </span>
  );
}

function RowButtons({ action, actionable, onOpen }: { action: ActionTaken; actionable: boolean; onOpen: (p: Panel) => void }) {
  const name = action.description.length > 40 ? `${action.description.slice(0, 40)}…` : action.description;
  return (
    <div className="d-flex gap-1">
      <button type="button" className="btn btn-outline-secondary btn-sm" aria-label={`View action: ${name}`} onClick={() => onOpen({ kind: "view", id: action.id })}>
        View
      </button>
      {actionable && !isLocked(action.status) && (
        <button type="button" className="btn btn-outline-secondary btn-sm" aria-label={`Edit action: ${name}`} onClick={() => onOpen({ kind: "edit", id: action.id })}>
          Edit
        </button>
      )}
    </div>
  );
}

function PanelHeading({ children }: { children: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h3 ref={ref} tabIndex={-1} className="h6 zg-focus-target">
      {children}
    </h3>
  );
}

function ActionView({ action, canEdit, onEdit, onClose }: { action: ActionTaken; canEdit: boolean; onEdit: () => void; onClose: () => void }) {
  return (
    <section className="border rounded p-3 mb-3 bg-white" aria-label="Action details">
      <PanelHeading>Action details</PanelHeading>
      <dl className="row small mb-2">
        <dt className="col-sm-4">Date/Time</dt>
        <dd className="col-sm-8">{formatDateTime(action.actionAt)}</dd>
        <dt className="col-sm-4">Status</dt>
        <dd className="col-sm-8">
          <ActionStatusBadge status={action.status} />
        </dd>
        <dt className="col-sm-4">Description</dt>
        <dd className="col-sm-8 zg-wrap">{action.description}</dd>
        <dt className="col-sm-4">Result</dt>
        <dd className="col-sm-8 zg-wrap">{action.result ?? "—"}</dd>
        <dt className="col-sm-4">Performed by</dt>
        <dd className="col-sm-8">
          {action.performedBy.name} <RoleBadge role={action.performedBy.role} />
        </dd>
        <dt className="col-sm-4">Assignee</dt>
        <dd className="col-sm-8">
          <AssigneeName assignee={action.assignee} />
        </dd>
        <dt className="col-sm-4">Follow-up</dt>
        <dd className="col-sm-8 zg-wrap">{action.followUpRequired ? action.followUpNote : "Not needed"}</dd>
        <dt className="col-sm-4">Attachment notes</dt>
        <dd className="col-sm-8 zg-wrap">{action.attachmentNotes ?? "—"}</dd>
      </dl>
      {action.updatedBy && (
        <p className="small text-muted">
          Last edited by {action.updatedBy.name} on {formatDateTime(action.updatedAt)}
        </p>
      )}
      <div className="d-flex gap-2">
        {canEdit && (
          <button type="button" className="btn btn-zg-primary btn-sm" onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

interface FormProps {
  mode: "create" | "edit";
  ticketId: number;
  ticketCreatedAt: string;
  staffUsers: StaffUser[];
  currentUser: { id: number; name: string } | null;
  action?: ActionTaken;
  onCancel: () => void;
  onSaved: (action: ActionTaken) => void;
  onReload?: () => Promise<void> | void;
}

function ActionForm({ mode, ticketId, ticketCreatedAt, staffUsers, currentUser, action, onCancel, onSaved, onReload }: FormProps) {
  const [values, setValues] = useState<FormValues>(() =>
    action
      ? valuesFromAction(action)
      : {
          actionAt: toLocalInput(new Date()),
          description: "",
          status: "PLANNED",
          result: "",
          assigneeId: currentUser ? String(currentUser.id) : "",
          followUpRequired: false,
          followUpNote: "",
          attachmentNotes: "",
        }
  );
  // BR-14: generated once per opened form — every submit (and retry) of this form reuses it.
  const [clientRequestId] = useState(newClientRequestId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [dateNote, setDateNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<ActionTaken | null>(null);
  const [reloading, setReloading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const idPrefix = `action-${mode}-${action?.id ?? "new"}`;

  const statusOptions: ActionStatus[] =
    mode === "create" || !action ? CREATE_STATUSES : [action.status, ...EDIT_MOVES[action.status]];

  // The assignee picker lists active staff; an existing assignee who has since been deactivated
  // stays selectable as the current value (BR-05: existing assignments aren't rewritten).
  const assigneeOptions = [...staffUsers];
  if (action && !staffUsers.some((u) => u.id === action.assignee.id)) {
    assigneeOptions.unshift({ id: action.assignee.id, name: `${action.assignee.name} (inactive)`, role: action.assignee.role });
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleStatusChange(next: ActionStatus) {
    set("status", next);
    // ui-spec.md §5.3 "Completing early" (PR #56 review): a Planned action dated ahead can't be
    // completed in the future (BR-07), so the date moves to now — visibly, and still editable.
    if (next === "COMPLETED" && values.actionAt) {
      const at = new Date(values.actionAt);
      if (at.getTime() > Date.now() + COMPLETED_FUTURE_ALLOWANCE_MS) {
        set("actionAt", toLocalInput(new Date()));
        setDateNote("Date set to now because the action is being completed.");
        return;
      }
    }
    setDateNote(null);
  }

  async function submit(payloadOverride?: { status: ActionStatus }) {
    setFormError(null);
    setConflict(null);
    const effective = payloadOverride ? { ...values, ...payloadOverride } : values;
    const found = payloadOverride ? {} : validate(effective, ticketCreatedAt);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setFormError("Please correct the highlighted fields.");
      return;
    }

    setBusy(true);
    try {
      const saved =
        mode === "create"
          ? await createAction(ticketId, { clientRequestId, ...toPayload(effective) })
          : payloadOverride
            ? await updateAction(ticketId, action!.id, { version: action!.version, ...payloadOverride })
            : await updateAction(ticketId, action!.id, { version: action!.version, ...toPayload(effective) });
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "STALE_UPDATE") {
          setConflict((err.current as ActionTaken) ?? null);
        } else if (err.code === "VALIDATION_ERROR" || err.code === "INVALID_ASSIGNEE") {
          setErrors((err.fields ?? {}) as FieldErrors);
          setFormError(err.code === "INVALID_ASSIGNEE" ? err.message : "Please correct the highlighted fields.");
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Unable to save the action. Check your connection and try again.");
      }
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  }

  async function handleReload() {
    if (!onReload) return;
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!busy) void submit();
  }

  const describedBy = (key: keyof FormValues, extra?: string) =>
    [errors[key] ? `${idPrefix}-${key}-error` : null, extra].filter(Boolean).join(" ") || undefined;

  const fieldError = (key: keyof FormValues) =>
    errors[key] ? (
      <div id={`${idPrefix}-${key}-error`} className="invalid-feedback d-block">
        {errors[key]}
      </div>
    ) : null;

  return (
    <form className="border rounded p-3 mb-3 bg-white" onSubmit={handleSubmit} noValidate aria-label={mode === "create" ? "Add action" : "Edit action"}>
      <PanelHeading>{mode === "create" ? "Add Action" : "Edit Action"}</PanelHeading>

      {conflict !== null && (
        <div className="alert alert-warning py-2 small" role="alert">
          <p className="mb-1">This action was changed by someone else since you opened it. Your changes are still in the form.</p>
          <p className="mb-2">
            Latest saved version: <ActionStatusBadge status={conflict.status} /> — {conflict.description}
            {conflict.updatedBy ? ` (edited by ${conflict.updatedBy.name})` : ""}
          </p>
          {onReload && (
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={reloading} onClick={handleReload}>
              {reloading ? "Reloading…" : "Reload ticket"}
            </button>
          )}
        </div>
      )}
      {formError && (
        <div className="alert alert-danger py-2 small" role="alert">
          {formError}
        </div>
      )}

      <div className="row g-3">
        <div className="col-md-6">
          <label htmlFor={`${idPrefix}-actionAt`} className="form-label small fw-semibold">
            Action Date/Time
          </label>
          <input
            id={`${idPrefix}-actionAt`}
            type="datetime-local"
            className={`form-control form-control-sm${errors.actionAt ? " is-invalid" : ""}`}
            value={values.actionAt}
            min={toLocalInput(new Date(ticketCreatedAt))}
            disabled={busy}
            aria-describedby={describedBy("actionAt", dateNote ? `${idPrefix}-date-note` : undefined)}
            onChange={(e) => {
              set("actionAt", e.target.value);
              setDateNote(null);
            }}
          />
          {dateNote && (
            <div id={`${idPrefix}-date-note`} className="form-text">
              {dateNote}
            </div>
          )}
          {fieldError("actionAt")}
        </div>
        <div className="col-md-6">
          <label htmlFor={`${idPrefix}-status`} className="form-label small fw-semibold">
            Status
          </label>
          <select
            id={`${idPrefix}-status`}
            className="form-select form-select-sm"
            value={values.status}
            disabled={busy}
            onChange={(e) => handleStatusChange(e.target.value as ActionStatus)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {actionStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="col-12">
          <label htmlFor={`${idPrefix}-description`} className="form-label small fw-semibold">
            Action Description
          </label>
          <textarea
            id={`${idPrefix}-description`}
            className={`form-control form-control-sm${errors.description ? " is-invalid" : ""}`}
            rows={2}
            value={values.description}
            disabled={busy}
            aria-describedby={describedBy("description")}
            onChange={(e) => set("description", e.target.value)}
          />
          {fieldError("description")}
        </div>

        <div className="col-12">
          <label htmlFor={`${idPrefix}-result`} className="form-label small fw-semibold">
            Result{values.status === "COMPLETED" ? " (required)" : ""}
          </label>
          <textarea
            id={`${idPrefix}-result`}
            className={`form-control form-control-sm${errors.result ? " is-invalid" : ""}`}
            rows={2}
            value={values.result}
            disabled={busy}
            aria-describedby={describedBy("result")}
            onChange={(e) => set("result", e.target.value)}
          />
          {fieldError("result")}
        </div>

        <div className="col-md-6">
          <label htmlFor={`${idPrefix}-assignee`} className="form-label small fw-semibold">
            Assignee
          </label>
          <select
            id={`${idPrefix}-assignee`}
            className={`form-select form-select-sm${errors.assigneeId ? " is-invalid" : ""}`}
            value={values.assigneeId}
            disabled={busy}
            aria-describedby={describedBy("assigneeId")}
            onChange={(e) => set("assigneeId", e.target.value)}
          >
            <option value="">Choose…</option>
            {assigneeOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role === "ADMINISTRATOR" ? "Administrator" : "IT Staff"})
              </option>
            ))}
          </select>
          {fieldError("assigneeId")}
        </div>
        <div className="col-md-6">
          <span className="form-label small fw-semibold d-block">Performed by</span>
          <span className="small">{action ? action.performedBy.name : currentUser?.name ?? "You"}</span>
        </div>

        <div className="col-12">
          <div className="form-check">
            <input
              id={`${idPrefix}-followUpRequired`}
              type="checkbox"
              className="form-check-input"
              checked={values.followUpRequired}
              disabled={busy}
              onChange={(e) => set("followUpRequired", e.target.checked)}
            />
            <label htmlFor={`${idPrefix}-followUpRequired`} className="form-check-label small">
              Follow-Up Required?
            </label>
          </div>
        </div>
        {values.followUpRequired && (
          <div className="col-12">
            <label htmlFor={`${idPrefix}-followUpNote`} className="form-label small fw-semibold">
              Follow-up Note (required)
            </label>
            <textarea
              id={`${idPrefix}-followUpNote`}
              className={`form-control form-control-sm${errors.followUpNote ? " is-invalid" : ""}`}
              rows={2}
              value={values.followUpNote}
              disabled={busy}
              aria-describedby={describedBy("followUpNote")}
              onChange={(e) => set("followUpNote", e.target.value)}
            />
            {fieldError("followUpNote")}
          </div>
        )}

        <div className="col-12">
          <label htmlFor={`${idPrefix}-attachmentNotes`} className="form-label small fw-semibold">
            Attachment Notes
          </label>
          <input
            id={`${idPrefix}-attachmentNotes`}
            type="text"
            className={`form-control form-control-sm${errors.attachmentNotes ? " is-invalid" : ""}`}
            value={values.attachmentNotes}
            disabled={busy}
            aria-describedby={describedBy("attachmentNotes", `${idPrefix}-attachmentNotes-help`)}
            onChange={(e) => set("attachmentNotes", e.target.value)}
          />
          <div id={`${idPrefix}-attachmentNotes-help`} className="form-text">
            Which attachment or file to look at, e.g. screenshot-2.png
          </div>
          {fieldError("attachmentNotes")}
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3 align-items-center">
        <button type="submit" className={`btn btn-zg-primary btn-sm${busy ? " btn-busy" : ""}`} disabled={busy} aria-busy={busy}>
          {busy ? "Saving…" : "Save Action"}
        </button>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        {mode === "edit" && action && !confirmCancel && (
          <button type="button" className="btn btn-outline-danger btn-sm ms-auto" disabled={busy} onClick={() => setConfirmCancel(true)}>
            Cancel this action
          </button>
        )}
        {mode === "edit" && confirmCancel && (
          <span className="ms-auto d-flex flex-wrap gap-2 align-items-center small">
            Cancel this action? It will stay in the list, marked Cancelled.
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy} onClick={() => void submit({ status: "CANCELLED" })}>
              Confirm
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Keep action
            </button>
          </span>
        )}
      </div>
    </form>
  );
}
