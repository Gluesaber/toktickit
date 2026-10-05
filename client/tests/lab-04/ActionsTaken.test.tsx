import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionsTakenSection from "../../src/components/ActionsTakenSection.js";
import { ActionStatusBadge, FollowUpBadge } from "../../src/components/Badges.js";
import * as api from "../../src/api.js";
import { ApiError, type ActionTaken, type StaffUser } from "../../src/api.js";

// docs/lab-04/tests.md §2.9 — client/tests/lab-04/ActionsTaken.test.tsx (UI-11..19, STYLE-02).
// The component is rendered on its own (both modes); the page-level wiring is covered by
// TicketWorkflow.test.tsx and the E2E specs.

const STAFF: StaffUser[] = [
  { id: 10, name: "Taylor Brooks", role: "IT_STAFF" },
  { id: 11, name: "Casey Nguyen", role: "IT_STAFF" },
];
const ME = { id: 10, name: "Taylor Brooks" };
const TICKET_CREATED = "2026-01-05T08:00:00.000Z";

function makeAction(overrides: Partial<ActionTaken> = {}): ActionTaken {
  return {
    id: 1,
    ticketId: 42,
    actionAt: "2026-01-06T09:00:00.000Z",
    description: "Ran hardware diagnostics.",
    result: "Faulty RAM in slot 2.",
    status: "COMPLETED",
    performedBy: { id: 10, name: "Taylor Brooks", role: "IT_STAFF" },
    assignee: { id: 11, name: "Casey Nguyen", role: "IT_STAFF", isActive: true },
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 1,
    updatedBy: null,
    createdAt: "2026-01-06T09:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
    ...overrides,
  };
}

function renderSection(props: Partial<Parameters<typeof ActionsTakenSection>[0]> = {}) {
  const onSaved = vi.fn();
  const onReload = vi.fn();
  render(
    <ActionsTakenSection
      ticketId={42}
      ticketCreatedAt={TICKET_CREATED}
      ticketStatus="IN_PROGRESS"
      actions={[]}
      mode="staff"
      staffUsers={STAFF}
      currentUser={ME}
      onSaved={onSaved}
      onReload={onReload}
      {...props}
    />
  );
  return { onSaved, onReload };
}

async function openAddForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add Action" }));
  return screen.getByRole("form", { name: "Add action" });
}

afterEach(() => vi.restoreAllMocks());

describe("UI-11: the Actions list (FR-01, AC-12)", () => {
  it("lists every Action in the given order with all of its fields", () => {
    const actions = [
      makeAction({ id: 1, description: "First step by Taylor" }),
      makeAction({
        id: 2,
        description: "Second step by Casey",
        status: "PLANNED",
        result: null,
        performedBy: { id: 11, name: "Casey Nguyen", role: "IT_STAFF" },
        assignee: { id: 10, name: "Taylor Brooks", role: "IT_STAFF", isActive: true },
        followUpRequired: true,
        followUpNote: "Check again Friday.",
        attachmentNotes: "photo-1.jpg",
      }),
    ];
    renderSection({ actions });

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("First step by Taylor")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Second step by Casey")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Check again Friday.")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/photo-1\.jpg/)).toBeInTheDocument();
    expect(within(rows[1]).getByText("Follow-up")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actions Taken (2)" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no Actions", () => {
    renderSection({ actions: [] });
    expect(screen.getByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("marks an assignee who has since been deactivated", () => {
    renderSection({ actions: [makeAction({ assignee: { id: 99, name: "Drew Kowalski", role: "IT_STAFF", isActive: false } })] });
    expect(within(screen.getByRole("table")).getByText("(inactive)")).toBeInTheDocument();
  });
});

describe("UI-12: client-side validation (AC-06, AC-07)", () => {
  it("shows Follow-up Note only when follow-up is needed, and requires it then", async () => {
    const createSpy = vi.spyOn(api, "createAction");
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);

    expect(within(form).queryByLabelText(/follow-up note/i)).not.toBeInTheDocument();
    await user.type(within(form).getByLabelText("Action Description"), "Replace RAM module.");
    await user.click(within(form).getByLabelText("Follow-Up Required?"));
    expect(within(form).getByLabelText(/follow-up note/i)).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Save Action" }));
    expect(within(form).getByText("Follow-up note is required when follow-up is needed.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("makes Result required once Status is Completed", async () => {
    const createSpy = vi.spyOn(api, "createAction");
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);

    await user.type(within(form).getByLabelText("Action Description"), "Replaced the RAM.");
    await user.selectOptions(within(form).getByLabelText("Status"), "COMPLETED");
    expect(within(form).getByLabelText("Result (required)")).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Save Action" }));

    expect(within(form).getByText("Result is required when the action is completed.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("requires a description", async () => {
    const createSpy = vi.spyOn(api, "createAction");
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);
    await user.click(within(form).getByRole("button", { name: "Save Action" }));
    expect(within(form).getByText("Action description is required.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // PR #56 review / ui-spec.md §5.3 "Completing early".
  it("moves a future date to now, visibly, when the action is set to Completed", async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const planned = makeAction({ status: "PLANNED", result: null, actionAt: future.toISOString() });
    const user = userEvent.setup();
    renderSection({ actions: [planned] });

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /^edit action/i }));
    const form = screen.getByRole("form", { name: "Edit action" });
    const dateInput = within(form).getByLabelText("Action Date/Time") as HTMLInputElement;
    const before = dateInput.value;

    await user.selectOptions(within(form).getByLabelText("Status"), "COMPLETED");
    expect(dateInput.value).not.toBe(before);
    expect(new Date(dateInput.value).getTime()).toBeLessThanOrEqual(Date.now());
    expect(within(form).getByText("Date set to now because the action is being completed.")).toBeInTheDocument();
  });
});

describe("UI-13: duplicate-create protection (AC-14, AC-37)", () => {
  it("sends one request for a double click, and reuses the same clientRequestId on a retry", async () => {
    let rejectFirst: (e: unknown) => void = () => undefined;
    const createSpy = vi
      .spyOn(api, "createAction")
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
      .mockResolvedValueOnce(makeAction({ id: 7, description: "Replaced the RAM.", status: "PLANNED", result: null }));
    const user = userEvent.setup();
    const { onSaved } = renderSection();
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText("Action Description"), "Replaced the RAM.");

    const save = within(form).getByRole("button", { name: "Save Action" });
    await user.dblClick(save);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(within(form).getByRole("button", { name: /saving/i })).toBeDisabled();

    rejectFirst(new TypeError("Failed to fetch")); // network failure
    expect(await within(form).findByText(/check your connection/i)).toBeInTheDocument();

    await user.click(within(form).getByRole("button", { name: "Save Action" }));
    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));
    const firstId = createSpy.mock.calls[0][1].clientRequestId;
    expect(firstId).toBeTruthy();
    expect(createSpy.mock.calls[1][1].clientRequestId).toBe(firstId);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 7 })));
  });
});

// Issue 4-6 (Lab 4) — after an asynchronous save, focus must return to Add Action (ui-spec.md §9), not
// fall to <body>. This guards the behaviour, but jsdom's timing can't reproduce the original race (an
// animation frame firing before React re-created the button), so it also passes on the old code. The
// real-browser proof is RESP-04 under load: 1 failure in 8 before the fix, 12/12 after (tests.md §7).
describe("Focus returns to Add Action after a save (ui-spec.md §9)", () => {
  it("focuses the re-created Add Action button once the saved Action is shown", async () => {
    let finishSave: (a: ActionTaken) => void = () => undefined;
    vi.spyOn(api, "createAction").mockImplementation(() => new Promise((resolve) => (finishSave = resolve)));
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText("Action Description"), "Swapped the network cable.");
    await user.click(within(form).getByRole("button", { name: "Save Action" }));
    finishSave(makeAction({ id: 9, description: "Swapped the network cable.", status: "PLANNED", result: null }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Action" })).toHaveFocus());
  });
});

describe("UI-14: server validation errors keep the input (AC-38)", () => {
  it("places each 400 field message under its field and keeps what was typed", async () => {
    vi.spyOn(api, "createAction").mockRejectedValue(
      new ApiError({
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields.",
          fields: { actionAt: "Action date/time can't be earlier than when the ticket was created." },
        },
      })
    );
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText("Action Description"), "Checked the cabling.");
    await user.type(within(form).getByLabelText("Attachment Notes"), "cable-photo.jpg");
    await user.click(within(form).getByRole("button", { name: "Save Action" }));

    const message = await within(form).findByText("Action date/time can't be earlier than when the ticket was created.");
    expect(within(form).getByLabelText("Action Date/Time")).toHaveAttribute("aria-describedby", expect.stringContaining(message.id));
    expect(within(form).getByText("Please correct the highlighted fields.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Action Description")).toHaveValue("Checked the cabling.");
    expect(within(form).getByLabelText("Attachment Notes")).toHaveValue("cable-photo.jpg");
  });
});

describe("UI-15: locked Actions (AC-10)", () => {
  it("offers no Edit for Completed or Cancelled Actions, and View shows who last edited", async () => {
    const actions = [
      makeAction({ id: 1, status: "COMPLETED", description: "Done step" }),
      makeAction({
        id: 2,
        status: "CANCELLED",
        result: null,
        description: "Withdrawn step",
        updatedBy: { id: 11, name: "Casey Nguyen", role: "IT_STAFF" },
      }),
      makeAction({ id: 3, status: "PLANNED", result: null, description: "Open step" }),
    ];
    const user = userEvent.setup();
    renderSection({ actions });
    const table = screen.getByRole("table");

    expect(within(table).queryByRole("button", { name: /edit action: done step/i })).not.toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: /edit action: withdrawn step/i })).not.toBeInTheDocument();
    expect(within(table).getByRole("button", { name: /edit action: open step/i })).toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: /view action: withdrawn step/i }));
    const details = screen.getByRole("region", { name: "Action details" });
    expect(within(details).getByText(/last edited by casey nguyen/i)).toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});

describe("UI-16: stale edit (AC-24)", () => {
  it("sends the loaded version, shows the conflict with Reload, and keeps the edited values", async () => {
    const action = makeAction({ id: 5, status: "PLANNED", result: null, description: "Original text", version: 2 });
    const updateSpy = vi.spyOn(api, "updateAction").mockRejectedValue(
      new ApiError({
        error: {
          code: "STALE_UPDATE",
          message: "This action was changed by someone else.",
          current: { ...action, description: "Casey's newer text", version: 3, updatedBy: { id: 11, name: "Casey Nguyen", role: "IT_STAFF" } },
        },
      })
    );
    const user = userEvent.setup();
    const { onReload } = renderSection({ actions: [action] });

    await user.click(within(screen.getByRole("table")).getByRole("button", { name: /edit action/i }));
    const form = screen.getByRole("form", { name: "Edit action" });
    const description = within(form).getByLabelText("Action Description");
    await user.clear(description);
    await user.type(description, "My edited text");
    await user.click(within(form).getByRole("button", { name: "Save Action" }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith(42, 5, expect.objectContaining({ version: 2, description: "My edited text" })));
    const alert = await within(form).findByText(/changed by someone else/i);
    expect(alert).toBeInTheDocument();
    expect(within(form).getByText(/casey's newer text/i)).toBeInTheDocument();
    expect(description).toHaveValue("My edited text");

    await user.click(within(form).getByRole("button", { name: "Reload ticket" }));
    expect(onReload).toHaveBeenCalled();
  });
});

describe("UI-17: invalid assignee (AC-05)", () => {
  it("shows the server's INVALID_ASSIGNEE message under the Assignee field", async () => {
    vi.spyOn(api, "createAction").mockRejectedValue(
      new ApiError({
        error: {
          code: "INVALID_ASSIGNEE",
          message: "The assignee must be an active IT Staff or Administrator user.",
          fields: { assigneeId: "Choose an active IT Staff or Administrator user." },
        },
      })
    );
    const user = userEvent.setup();
    renderSection();
    const form = await openAddForm(user);
    await user.type(within(form).getByLabelText("Action Description"), "Swap the printer drum.");
    await user.selectOptions(within(form).getByLabelText("Assignee"), "11");
    await user.click(within(form).getByRole("button", { name: "Save Action" }));

    const message = await within(form).findByText("Choose an active IT Staff or Administrator user.");
    expect(within(form).getByLabelText("Assignee")).toHaveAttribute("aria-describedby", expect.stringContaining(message.id));
  });
});

describe("UI-18: the Requester's read-only view (AC-15, BR-15)", () => {
  it("shows every field with plain labels and no way to add or change anything", () => {
    renderSection({
      mode: "requester",
      staffUsers: undefined,
      currentUser: undefined,
      actions: [makeAction({ followUpRequired: true, followUpNote: "Check again Friday.", attachmentNotes: "photo-1.jpg" })],
    });
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "What was done" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Who did it" })).toBeInTheDocument();
    expect(within(table).getByText("Ran hardware diagnostics.")).toBeInTheDocument();
    expect(within(table).getByText("Faulty RAM in slot 2.")).toBeInTheDocument();
    expect(within(table).getByText("Check again Friday.")).toBeInTheDocument();
    expect(within(table).getByText(/photo-1\.jpg/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("uses Requester wording for the empty state", () => {
    renderSection({ mode: "requester", actions: [] });
    expect(screen.getByText("IT hasn't recorded any actions on this ticket yet.")).toBeInTheDocument();
  });
});

describe("UI-19: closed Tickets are read-only (BR-12)", () => {
  it.each(["CLOSED", "CANCELLED"])("hides Add and Edit on a %s ticket and says why", (status) => {
    renderSection({ ticketStatus: status, actions: [makeAction({ status: "PLANNED", result: null })] });
    expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByRole("button", { name: /edit action/i })).not.toBeInTheDocument();
    expect(screen.getByText("This ticket is closed; actions are read-only.")).toBeInTheDocument();
  });
});

describe("STYLE-02: Action status and follow-up badges (ui-spec.md §1.1)", () => {
  it.each([
    ["PLANNED", "zg-badge-action-planned", "Planned"],
    ["IN_PROGRESS", "zg-badge-action-in_progress", "In Progress"],
    ["COMPLETED", "zg-badge-action-completed", "✓ Completed"],
    ["CANCELLED", "zg-badge-action-cancelled", "Cancelled"],
  ] as const)("%s has its own class and a text label", (status, className, label) => {
    render(<ActionStatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass("zg-badge", className);
  });

  it("the follow-up cue is text, not color alone", () => {
    render(<FollowUpBadge />);
    expect(screen.getByText("Follow-up")).toHaveClass("zg-badge", "zg-badge-follow-up");
  });

  it("Action badges never reuse a Ticket status class", () => {
    render(<ActionStatusBadge status="COMPLETED" />);
    expect(screen.getByText("✓ Completed").className).not.toMatch(/zg-badge-status-/);
  });
});
