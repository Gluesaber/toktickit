import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  Category,
  RelatedSystem,
  Priority,
  createTicket,
  getCategories,
  getRelatedSystems,
} from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

// Issue 2-4 (Lab 2) — Create Ticket screen. docs/lab-02/ui-spec.md §4, docs/lab-02/specification.md
// BR-19/BR-20/BR-21/BR-24/BR-25. Attachments are an inert placeholder here — real upload UI lands
// in Issue 2-7 once POST /api/tickets/:id/attachments exists.
const SUMMARY_MIN = 5;
const SUMMARY_MAX = 120;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

type RefDataState = "loading" | "ready" | "failure";
type SubmitState = "idle" | "submitting" | "success";

interface FormValues {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  summary: string;
  description: string;
}

const EMPTY_FORM: FormValues = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.categoryId) errors.categoryId = "Please select a category.";
  if (!values.relatedSystemId) errors.relatedSystemId = "Please select a related system.";
  if (!values.requestedPriority) errors.requestedPriority = "Please select a priority.";

  const summary = values.summary.trim();
  if (!summary) {
    errors.summary = "Summary is required.";
  } else if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    errors.summary = `Summary must be ${SUMMARY_MIN}-${SUMMARY_MAX} characters.`;
  }

  const description = values.description.trim();
  if (!description) {
    errors.description = "Description is required.";
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    errors.description = `Description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters.`;
  }

  return errors;
}

export default function CreateTicketPage() {
  const { requester } = useRequester();
  const navigate = useNavigate();

  const [refDataState, setRefDataState] = useState<RefDataState>("loading");
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTicketNumber, setCreatedTicketNumber] = useState<string | null>(null);
  const [createdTicketId, setCreatedTicketId] = useState<number | null>(null);

  async function loadReferenceData() {
    setRefDataState("loading");
    try {
      const [categoryList, relatedSystemList] = await Promise.all([getCategories(), getRelatedSystems()]);
      setCategories(categoryList);
      setRelatedSystems(relatedSystemList);
      setRefDataState("ready");
    } catch {
      setRefDataState("failure");
    }
  }

  useEffect(() => {
    loadReferenceData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!requester) return;

    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return; // AC-04/AC-05: no API call when client-side validation fails.
    }

    setSubmitState("submitting");
    setSubmitError(null);
    try {
      const ticket = await createTicket({
        requesterId: requester.id,
        categoryId: Number(values.categoryId),
        relatedSystemId: Number(values.relatedSystemId),
        requestedPriority: values.requestedPriority as Priority,
        summary: values.summary,
        description: values.description,
      });
      setCreatedTicketNumber(ticket.ticketNumber);
      setCreatedTicketId(ticket.id);
      setSubmitState("success");
    } catch (err) {
      // BR-24/BR-25: field values are left exactly as typed — `values` state is untouched here.
      setSubmitState("idle");
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
      }
      setSubmitError(
        err instanceof ApiError ? err.message : "Unable to submit your ticket. Please try again."
      );
    }
  }

  function handleCreateAnother() {
    setValues(EMPTY_FORM);
    setFieldErrors({});
    setSubmitError(null);
    setCreatedTicketNumber(null);
    setCreatedTicketId(null);
    setSubmitState("idle");
  }

  if (submitState === "success" && createdTicketNumber) {
    return (
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-body p-4 text-center">
          <div className="alert alert-success mb-3" role="status">
            Ticket created successfully.
          </div>
          <p className="text-muted mb-1">Your Ticket Number</p>
          <p className="h4 mb-4">{createdTicketNumber}</p>
          <div className="d-flex gap-2 justify-content-center">
            <button
              type="button"
              className="btn btn-zg-primary"
              onClick={() => createdTicketId && navigate(`/tickets/${createdTicketId}`)}
            >
              View Ticket
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={handleCreateAnother}>
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="h4 mb-4">Create Ticket</h1>

      {refDataState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load categories and related systems. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={loadReferenceData}>
            Retry
          </button>
        </div>
      )}

      {submitError && (
        <div className="alert alert-danger" role="alert">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* System-generated fields — read-only, ui-spec.md §1.3/§4.1 */}
        <div className="row mb-3">
          <div className="col-md-4">
            <label className="form-label fw-semibold">Ticket Number</label>
            <input
              type="text"
              className="form-control"
              value="Assigned after submission"
              readOnly
              disabled
              style={{ backgroundColor: "var(--zg-field-readonly-bg)", color: "var(--zg-field-readonly-text)" }}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold">Ticket Date</label>
            <input
              type="text"
              className="form-control"
              value={new Date().toLocaleDateString()}
              readOnly
              disabled
              style={{ backgroundColor: "var(--zg-field-readonly-bg)", color: "var(--zg-field-readonly-text)" }}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-semibold">Requester</label>
            <input
              type="text"
              className="form-control"
              value={requester?.name ?? ""}
              readOnly
              disabled
              style={{ backgroundColor: "var(--zg-field-readonly-bg)", color: "var(--zg-field-readonly-text)" }}
            />
          </div>
        </div>

        {/* Classification group */}
        <div className="row mb-3">
          <div className="col-md-4">
            <label htmlFor="category" className="form-label fw-semibold">
              Category <span className="text-danger">*</span>
            </label>
            <select
              id="category"
              className={`form-select${fieldErrors.categoryId ? " is-invalid" : ""}`}
              value={values.categoryId}
              disabled={refDataState !== "ready" || submitState === "submitting"}
              onChange={(e) => updateField("categoryId", e.target.value)}
            >
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId && <div className="invalid-feedback d-block">{fieldErrors.categoryId}</div>}
          </div>

          <div className="col-md-4">
            <label htmlFor="relatedSystem" className="form-label fw-semibold">
              Related System <span className="text-danger">*</span>
            </label>
            <select
              id="relatedSystem"
              className={`form-select${fieldErrors.relatedSystemId ? " is-invalid" : ""}`}
              value={values.relatedSystemId}
              disabled={refDataState !== "ready" || submitState === "submitting"}
              onChange={(e) => updateField("relatedSystemId", e.target.value)}
            >
              <option value="">Choose…</option>
              {relatedSystems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {fieldErrors.relatedSystemId && (
              <div className="invalid-feedback d-block">{fieldErrors.relatedSystemId}</div>
            )}
          </div>

          <div className="col-md-4">
            <label htmlFor="priority" className="form-label fw-semibold">
              Requested Priority <span className="text-danger">*</span>
            </label>
            <select
              id="priority"
              className={`form-select${fieldErrors.requestedPriority ? " is-invalid" : ""}`}
              value={values.requestedPriority}
              disabled={submitState === "submitting"}
              onChange={(e) => updateField("requestedPriority", e.target.value)}
            >
              <option value="">Choose…</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            {fieldErrors.requestedPriority && (
              <div className="invalid-feedback d-block">{fieldErrors.requestedPriority}</div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="mb-3">
          <label htmlFor="summary" className="form-label fw-semibold">
            Ticket Summary <span className="text-danger">*</span>
          </label>
          <input
            id="summary"
            type="text"
            className={`form-control${fieldErrors.summary ? " is-invalid" : ""}`}
            value={values.summary}
            disabled={submitState === "submitting"}
            onChange={(e) => updateField("summary", e.target.value)}
          />
          {fieldErrors.summary && <div className="invalid-feedback d-block">{fieldErrors.summary}</div>}
        </div>

        {/* Description */}
        <div className="mb-3">
          <label htmlFor="description" className="form-label fw-semibold">
            Description <span className="text-danger">*</span>
          </label>
          <textarea
            id="description"
            className={`form-control${fieldErrors.description ? " is-invalid" : ""}`}
            rows={4}
            value={values.description}
            disabled={submitState === "submitting"}
            onChange={(e) => updateField("description", e.target.value)}
          />
          {fieldErrors.description && <div className="invalid-feedback d-block">{fieldErrors.description}</div>}
        </div>

        {/* Attachments — inert placeholder until Issue 2-7 implements upload. */}
        <div className="mb-4">
          <label className="form-label fw-semibold">Attachments</label>
          <div
            className="border rounded p-3 text-muted"
            style={{ backgroundColor: "var(--zg-field-readonly-bg)" }}
            aria-disabled="true"
          >
            Attachments will be available once Issue 2-7 is implemented.
          </div>
        </div>

        <div className="d-flex gap-2 justify-content-end">
          <button
            type="submit"
            className={`btn btn-zg-primary${submitState === "submitting" ? " btn-busy" : ""}`}
            disabled={submitState === "submitting" || refDataState !== "ready"}
          >
            {submitState === "submitting" ? "Submitting…" : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
