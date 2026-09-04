import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DevRequesterSelector from "../../src/components/DevRequesterSelector.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";

function renderSelector() {
  return render(
    <RequesterProvider>
      <DevRequesterSelector />
    </RequesterProvider>
  );
}

const ACTIVE_REQUESTERS = [
  { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
  { id: 2, name: "Priya Nair", email: "priya.nair@example.edu" },
];

describe("DevRequesterSelector", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // UI-21 (AC-27, BR-39) — empty active-Requester list.
  it("shows an empty state and never enables Continue when there are no active requesters", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValue([]);
    renderSelector();

    await waitFor(() => {
      expect(
        screen.getByText(/no active development requesters are available/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /continue/i })).not.toBeInTheDocument();
  });

  // UI-22 (AC-28) — API failure.
  it("shows a safe failure state with a Retry action when loading requesters fails", async () => {
    vi.spyOn(api, "getRequesters").mockRejectedValue(new Error("network down"));
    renderSelector();

    await waitFor(() => {
      expect(screen.getByText(/unable to load development requesters/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  // UI-23 (AC-30) — keyboard operability: dropdown -> Continue both tab-reachable.
  it("is operable via keyboard alone: tabbing reaches the dropdown then Continue", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    const user = userEvent.setup();
    renderSelector();

    const select = await screen.findByLabelText(/development requester/i);
    await user.tab();
    expect(select).toHaveFocus();

    await user.selectOptions(select, "1");
    await user.tab();
    expect(screen.getByRole("button", { name: /continue/i })).toHaveFocus();
  });

  it("selecting a requester and clicking Continue stores it as the current context", async () => {
    vi.spyOn(api, "getRequesters").mockResolvedValue(ACTIVE_REQUESTERS);
    const user = userEvent.setup();
    renderSelector();

    const select = await screen.findByLabelText(/development requester/i);
    await user.selectOptions(select, "2");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(JSON.parse(window.localStorage.getItem("toktickit.selectedRequester")!)).toMatchObject({
      id: 2,
      name: "Priya Nair",
    });
  });
});
