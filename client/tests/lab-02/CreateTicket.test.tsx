import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import CreateTicketPage from "../../src/pages/CreateTicketPage.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";
import { ApiError, Ticket } from "../../src/api.js";

const CATEGORIES = [{ id: 1, name: "Hardware" }];
const RELATED_SYSTEMS = [{ id: 1, name: "Corporate Laptop" }];

function renderPage() {
  window.localStorage.setItem(
    "toktickit.selectedRequester",
    JSON.stringify({ id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" })
  );
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <CreateTicketPage />
      </RequesterProvider>
    </MemoryRouter>
  );
}

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Hardware" });
  await user.selectOptions(screen.getByLabelText(/category/i), "1");
  await user.selectOptions(screen.getByLabelText(/related system/i), "1");
  await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");
  await user.type(screen.getByLabelText(/ticket summary/i), "Laptop battery drains quickly");
  await user.type(
    screen.getByLabelText(/description/i),
    "Battery drops from 100% to 20% within an hour of unplugging."
  );
}

describe("CreateTicketPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(api, "getCategories").mockResolvedValue(CATEGORIES);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(RELATED_SYSTEMS);
  });

  // UI-01 (AC-04)
  it("blocks submission with a blank Summary and makes no API call", async () => {
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", { name: "Hardware" });
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("Summary is required.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-02 (AC-05)
  it("blocks submission with a Description under 10 characters and makes no API call", async () => {
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", { name: "Hardware" });
    await user.selectOptions(screen.getByLabelText(/category/i), "1");
    await user.selectOptions(screen.getByLabelText(/related system/i), "1");
    await user.selectOptions(screen.getByLabelText(/requested priority/i), "MEDIUM");
    await user.type(screen.getByLabelText(/ticket summary/i), "Valid summary text");
    await user.type(screen.getByLabelText(/description/i), "too short");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/description must be 10-2000 characters/i)).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  // UI-06 (AC-11)
  it("shows a busy state on Submit while the request is in flight", async () => {
    let resolveCreate: (ticket: Ticket) => void = () => {};
    vi.spyOn(api, "createTicket").mockReturnValue(
      new Promise<Ticket>((resolve) => {
        resolveCreate = resolve;
      })
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    const busyButton = screen.getByRole("button", { name: /submitting/i });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveClass("btn-busy");

    resolveCreate({
      id: 1,
      ticketNumber: "TK-2026-000001",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "x",
      description: "y",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
      createdAt: "",
      updatedAt: "",
    });
    await waitFor(() => expect(screen.getByText("TK-2026-000001")).toBeInTheDocument());
  });

  // UI-07 (AC-10)
  it("shows a safe failure message and preserves field values when the API call fails", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(
      new ApiError({ error: { code: "INTERNAL_ERROR", message: "Unable to submit your ticket. Please try again." } })
    );
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText(/unable to submit your ticket/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ticket summary/i)).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByLabelText(/description/i)).toHaveValue(
      "Battery drops from 100% to 20% within an hour of unplugging."
    );
  });

  // UI-08 (AC-01)
  it("shows the generated Ticket Number on successful submission", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 1,
      ticketNumber: "TK-2026-000001",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "x",
      description: "y",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
      createdAt: "",
      updatedAt: "",
    });
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("TK-2026-000001")).toBeInTheDocument();
  });

  // UI-03 (AC-07, BR-28)
  it("rejects a file over 5 MB and does not add it to the list", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("option", { name: "Hardware" });

    const input = screen.getByLabelText(/add file/i);
    await user.upload(input, makeFile("big.jpg", "image/jpeg", 6 * 1024 * 1024));

    expect(await screen.findByText(/exceeds the 5 mb limit/i)).toBeInTheDocument();
    expect(screen.queryByText("big.jpg")).not.toBeInTheDocument();
  });

  // UI-04 (AC-08, BR-27)
  it("rejects an unsupported file type and does not add it to the list", async () => {
    // applyAccept: false — the input's `accept` attribute already guides the native file picker
    // (left in place for real users), but userEvent.upload() filters by it too by default, which
    // would prevent this deliberately-mismatched file from ever reaching our change handler. We
    // need it to reach the handler here, to prove the JS validation path itself (BR-27) also
    // catches it — the backend re-validates regardless, since accept/JS are both bypassable.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByRole("option", { name: "Hardware" });

    const input = screen.getByLabelText(/add file/i);
    await user.upload(input, makeFile("virus.exe", "application/octet-stream"));

    expect(await screen.findByText(/unsupported file type/i)).toBeInTheDocument();
    expect(screen.queryByText("virus.exe")).not.toBeInTheDocument();
  });

  // UI-05 (AC-09, BR-29)
  it("rejects a 6th file when 5 are already queued", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("option", { name: "Hardware" });

    const input = screen.getByLabelText(/add file/i);
    for (let i = 0; i < 5; i++) {
      await user.upload(input, makeFile(`photo${i}.jpg`, "image/jpeg"));
    }
    expect(screen.getByText("photo4.jpg")).toBeInTheDocument();

    await user.upload(input, makeFile("photo5.jpg", "image/jpeg"));
    expect(await screen.findByText(/only 5 attachments are allowed/i)).toBeInTheDocument();
    expect(screen.queryByText("photo5.jpg")).not.toBeInTheDocument();
  });

  // AC-06
  it("uploads a staged attachment after the Ticket is created and shows it as uploaded", async () => {
    vi.spyOn(api, "createTicket").mockResolvedValue({
      id: 1,
      ticketNumber: "TK-2026-000001",
      requesterId: 1,
      categoryId: 1,
      relatedSystemId: 1,
      summary: "x",
      description: "y",
      requestedPriority: "MEDIUM",
      currentStatus: "NEW",
      createdAt: "",
      updatedAt: "",
    });
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue({
      id: 7,
      originalFileName: "photo.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 1024,
      uploadedAt: "",
      removedAt: null,
      removalReason: null,
      active: true,
    });
    const user = userEvent.setup();
    renderPage();
    await fillValidForm(user);
    await user.upload(screen.getByLabelText(/add file/i), makeFile("photo.jpg", "image/jpeg"));

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(await screen.findByText("TK-2026-000001")).toBeInTheDocument();
    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(1, 1, expect.objectContaining({ name: "photo.jpg" }));
    });
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
  });

  // STYLE-01 — required-field asterisk + invalid class
  it("marks required fields with an asterisk and applies the invalid class on error", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("option", { name: "Hardware" });

    const summaryLabel = document.querySelector('label[for="summary"]');
    expect(summaryLabel?.textContent).toContain("*");

    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(await screen.findByLabelText(/ticket summary/i)).toHaveClass("is-invalid");
  });

  // STYLE-02 — read-only fields are visually/attributively distinct from editable ones
  it("renders system-generated fields as read-only, not editable", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Hardware" });

    expect(screen.getByDisplayValue("Assigned after submission")).toBeDisabled();
    expect(screen.getByDisplayValue("Alex Rivera")).toBeDisabled();
    expect(screen.getByLabelText(/ticket summary/i)).not.toBeDisabled();
  });
});
