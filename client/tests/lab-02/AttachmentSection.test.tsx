import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttachmentSection from "../../src/components/AttachmentSection.js";
import * as api from "../../src/api.js";
import type { Attachment } from "../../src/api.js";

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    originalFileName: "battery-report.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 182004,
    uploadedAt: "2026-08-24T09:33:00.000Z",
    removedAt: null,
    removalReason: null,
    active: true,
    ...overrides,
  };
}

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

describe("AttachmentSection", () => {
  // UI-19 (AC-22)
  it("renders a working download link for an active attachment", () => {
    render(
      <AttachmentSection
        ticketId={1}
        requesterId={1}
        attachments={[makeAttachment()]}
        onRefresh={vi.fn()}
      />
    );

    const link = screen.getByRole("link", { name: "battery-report.pdf" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/attachments/1/download"));
    expect(link).toHaveAttribute("href", expect.stringContaining("requesterId=1"));
  });

  // UI-20 (AC-25, BR-29)
  it("enforces the 5-active-attachment limit client-side before any upload request", async () => {
    const uploadSpy = vi.spyOn(api, "uploadAttachment");
    const fiveActive = Array.from({ length: 5 }, (_, i) => makeAttachment({ id: i + 1, originalFileName: `file${i}.jpg` }));
    const user = userEvent.setup({ applyAccept: false });
    render(
      <AttachmentSection ticketId={1} requesterId={1} attachments={fiveActive} onRefresh={vi.fn()} />
    );

    const input = screen.getByLabelText(/add attachment/i);
    await user.upload(input, makeFile("sixth.jpg", "image/jpeg"));

    expect(await screen.findByText(/only 5 attachments are allowed/i)).toBeInTheDocument();
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("uploads a new attachment and calls onRefresh when under the limit", async () => {
    const uploadSpy = vi.spyOn(api, "uploadAttachment").mockResolvedValue(makeAttachment({ id: 9 }));
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AttachmentSection ticketId={1} requesterId={1} attachments={[]} onRefresh={onRefresh} />);

    const input = screen.getByLabelText(/add attachment/i);
    await user.upload(input, makeFile("photo.jpg", "image/jpeg"));

    expect(uploadSpy).toHaveBeenCalledWith(1, 1, expect.objectContaining({ name: "photo.jpg" }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
