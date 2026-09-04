import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { UPLOAD_DIR } from "../../src/upload.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses a dedicated fixture Requester + Ticket (deactivated after setup), same pattern as
// ticket-detail.api.test.ts, so ownership/limit assertions here don't depend on other files.

let ownerId: number;
let otherOwnerId: number;
let ticketId: number;
let limitTestTicketId: number;
let concurrencyTestTicketId: number;
let downloadTestTicketId: number;
let deleteTestTicketId: number;

async function uploadValidFile(overrides: { requesterId?: number; ticket?: number } = {}) {
  return request(app)
    .post(`/api/tickets/${overrides.ticket ?? ticketId}/attachments`)
    .field("requesterId", String(overrides.requesterId ?? ownerId))
    .attach("file", Buffer.from("fake jpeg bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();

  const [owner, otherOwner] = await Promise.all([
    prisma.requester.create({ data: { name: "Attachments Test Owner", email: `attachments-owner-${unique}@example.test` } }),
    prisma.requester.create({ data: { name: "Attachments Test Other", email: `attachments-other-${unique}@example.test` } }),
  ]);
  ownerId = owner.id;
  otherOwnerId = otherOwner.id;

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  // Each test group below gets its own dedicated ticket rather than sharing one: the 5-active
  // cap (BR-29) is now correctly enforced per-ticket (PR #26 review fix), so groups that each do
  // several successful uploads would otherwise silently compete for the same 5-slot budget and
  // trip the cap on each other once their combined total crosses it.
  async function createFixtureTicket(summary: string): Promise<number> {
    const res = await request(app).post("/api/tickets").send({
      requesterId: ownerId,
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary,
      description: `${summary} — long enough to pass validation.`,
      requestedPriority: "LOW",
    });
    return res.body.id;
  }

  ticketId = await createFixtureTicket("Fixture ticket for Attachment tests");
  // Created here too, before deactivation below — POST /api/tickets requires an *active*
  // requester (BR-21), so none of these can be created lazily inside a later `it()` block.
  limitTestTicketId = await createFixtureTicket("Fixture ticket for attachment-limit test");
  concurrencyTestTicketId = await createFixtureTicket("Fixture ticket for attachment-race-condition test");
  downloadTestTicketId = await createFixtureTicket("Fixture ticket for attachment-download tests");
  deleteTestTicketId = await createFixtureTicket("Fixture ticket for attachment-delete tests");

  await prisma.requester.updateMany({
    where: { id: { in: [ownerId, otherOwnerId] } },
    data: { isActive: false },
  });
});

// API-10 (AC-06)
describe("POST /api/tickets/:id/attachments", () => {
  it("uploads a valid JPG and returns 201 with the attachment metadata", async () => {
    const res = await uploadValidFile();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      originalFileName: "photo.jpg",
      mimeType: "image/jpeg",
      active: true,
      removedAt: null,
    });
  });

  // API-11 (AC-07, BR-28)
  it("rejects a file over 5 MB with 413 FILE_TOO_LARGE", async () => {
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1);
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerId))
      .attach("file", oversized, { filename: "big.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  // API-12 (AC-08, BR-27)
  it("rejects an unsupported file type with 415 UNSUPPORTED_FILE_TYPE", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerId))
      .attach("file", Buffer.from("not an image"), { filename: "virus.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  // API-14 (BR-33)
  it("rejects an upload from a Requester who doesn't own the ticket", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(otherOwnerId))
      .attach("file", Buffer.from("fake jpeg bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // API-13 (AC-09, BR-29) — uses its own dedicated ticket (created in beforeAll) so it isn't
  // affected by attachments other tests in this file create on the shared `ticketId`.
  it("rejects a 6th active attachment with 409 ATTACHMENT_LIMIT_REACHED", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await uploadValidFile({ ticket: limitTestTicketId });
      expect(res.status).toBe(201);
    }

    const sixth = await uploadValidFile({ ticket: limitTestTicketId });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.code).toBe("ATTACHMENT_LIMIT_REACHED");
  });
});

describe("GET /api/tickets/:id/attachments", () => {
  // API-19 (BR-32)
  it("includes both active and removed attachments with full metadata", async () => {
    const uploadRes = await uploadValidFile();
    expect(uploadRes.status).toBe(201);
    const attachmentId = uploadRes.body.id;
    await request(app).delete(`/api/attachments/${attachmentId}`).send({ requesterId: ownerId, reason: "test cleanup" });

    const res = await request(app).get(`/api/tickets/${ticketId}/attachments`).query({ requesterId: ownerId });
    expect(res.status).toBe(200);
    const removedOne = res.body.find((a: { id: number }) => a.id === attachmentId);
    expect(removedOne).toMatchObject({ active: false, removalReason: "test cleanup" });
    expect(res.body.some((a: { active: boolean }) => a.active === true)).toBe(true);
  });
});

describe("GET /api/attachments/:id/download", () => {
  let activeAttachmentId: number;
  let removedAttachmentId: number;

  beforeEach(async () => {
    const active = await uploadValidFile({ ticket: downloadTestTicketId });
    expect(active.status).toBe(201); // fail loudly here, not as a confusing NaN-id 500 below
    activeAttachmentId = active.body.id;
    const toRemove = await uploadValidFile({ ticket: downloadTestTicketId });
    expect(toRemove.status).toBe(201);
    removedAttachmentId = toRemove.body.id;
    await request(app).delete(`/api/attachments/${removedAttachmentId}`).send({ requesterId: ownerId });
  });

  // API-15 (AC-22)
  it("downloads an active attachment", async () => {
    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .query({ requesterId: ownerId });
    expect(res.status).toBe(200);
    expect(res.header["content-disposition"]).toContain("photo.jpg");
  });

  // API-16 (AC-24, BR-32)
  it("rejects a download of a removed attachment with 410 ATTACHMENT_REMOVED", async () => {
    const res = await request(app)
      .get(`/api/attachments/${removedAttachmentId}/download`)
      .query({ requesterId: ownerId });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("ATTACHMENT_REMOVED");
  });

  it("returns 404 for a download requested by a non-owning Requester", async () => {
    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .query({ requesterId: otherOwnerId });
    expect(res.status).toBe(404);
  });

  // Data-integrity case: the DB row exists but its real file is gone from disk (e.g. manual
  // cleanup, non-persistent storage). Distinguished from other download failures so the response
  // doesn't tell the Requester to retry something that can never succeed.
  it("returns ATTACHMENT_FILE_MISSING when the row exists but the file is gone from disk", async () => {
    const prisma = getPrisma();
    const attachment = await prisma.attachment.findUniqueOrThrow({ where: { id: activeAttachmentId } });
    await fs.unlink(path.join(UPLOAD_DIR, attachment.storedFileName));

    const res = await request(app)
      .get(`/api/attachments/${activeAttachmentId}/download`)
      .query({ requesterId: ownerId });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("ATTACHMENT_FILE_MISSING");
  });
});

describe("DELETE /api/attachments/:id", () => {
  // API-17 (AC-26, BR-31)
  it("soft-removes an active attachment with a reason", async () => {
    const uploadRes = await uploadValidFile({ ticket: deleteTestTicketId });
    expect(uploadRes.status).toBe(201);
    const res = await request(app)
      .delete(`/api/attachments/${uploadRes.body.id}`)
      .send({ requesterId: ownerId, reason: "Wrong file attached" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ active: false, removalReason: "Wrong file attached" });
    expect(res.body.removedAt).not.toBeNull();
  });

  // API-18
  it("rejects removing an already-removed attachment with 409 ALREADY_REMOVED", async () => {
    const uploadRes = await uploadValidFile({ ticket: deleteTestTicketId });
    expect(uploadRes.status).toBe(201);
    await request(app).delete(`/api/attachments/${uploadRes.body.id}`).send({ requesterId: ownerId });

    const res = await request(app).delete(`/api/attachments/${uploadRes.body.id}`).send({ requesterId: ownerId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_REMOVED");
  });

  it("rejects removal from a non-owning Requester", async () => {
    const uploadRes = await uploadValidFile({ ticket: deleteTestTicketId });
    expect(uploadRes.status).toBe(201);
    const res = await request(app)
      .delete(`/api/attachments/${uploadRes.body.id}`)
      .send({ requesterId: otherOwnerId });
    expect(res.status).toBe(404);
  });
});

// Regression tests for the PR #26 review findings.
describe("PR #26 review fixes", () => {
  // Finding 1 — a malformed (non-numeric) :id previously reached Prisma as NaN and threw,
  // surfacing as 500 INTERNAL_ERROR instead of a clean 404.
  describe("malformed :id path params", () => {
    it("POST /api/tickets/:id/attachments returns 404, not 500", async () => {
      const res = await request(app)
        .post("/api/tickets/not-a-number/attachments")
        .field("requesterId", String(ownerId))
        .attach("file", Buffer.from("fake jpeg bytes"), { filename: "photo.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("GET /api/tickets/:id/attachments returns 404, not 500", async () => {
      const res = await request(app)
        .get("/api/tickets/not-a-number/attachments")
        .query({ requesterId: ownerId });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("GET /api/attachments/:id/download returns 404, not 500", async () => {
      const res = await request(app)
        .get("/api/attachments/not-a-number/download")
        .query({ requesterId: ownerId });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("DELETE /api/attachments/:id returns 404, not 500", async () => {
      const res = await request(app)
        .delete("/api/attachments/not-a-number")
        .send({ requesterId: ownerId });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // Finding 3 — extension and MIME type must correspond as a real pair, not just each
  // independently belong to its own allowed list.
  it("rejects a mismatched extension/MIME-type pair even though each is individually allowed", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/attachments`)
      .field("requesterId", String(ownerId))
      .attach("file", Buffer.from("not really a pdf"), { filename: "report.pdf", contentType: "image/png" });
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  // Finding 2 — count-then-create was non-transactional, so concurrent uploads to the same
  // Ticket could both pass the 5-active check and exceed BR-29's cap. Fires 8 uploads at once and
  // asserts the cap holds exactly, proving the transaction + row lock actually serializes them.
  it("enforces the 5-active-attachment cap exactly under concurrent uploads", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => uploadValidFile({ ticket: concurrencyTestTicketId }))
    );
    const succeeded = results.filter((r) => r.status === 201);
    const limitReached = results.filter((r) => r.status === 409 && r.body.error.code === "ATTACHMENT_LIMIT_REACHED");

    expect(succeeded).toHaveLength(5);
    expect(limitReached).toHaveLength(3);

    const finalCount = await request(app)
      .get(`/api/tickets/${concurrencyTestTicketId}/attachments`)
      .query({ requesterId: ownerId });
    expect(finalCount.body.filter((a: { active: boolean }) => a.active)).toHaveLength(5);
  });
});
