import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { createTree } from "@/lib/trees";
import { createPerson } from "@/lib/people";
import { createInvitation, listActiveInvitations } from "@/lib/sharing/invitations";
import { listActivity } from "@/lib/sharing/activity";
import { HttpError } from "@/lib/errors";

const db = testDb();

async function setup() {
  const owner = await makeUser("owner");
  const editor = await makeUser("editor");
  const viewer = await makeUser("viewer");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.createMany({
    data: [
      { treeId: tree.id, userId: editor.id, role: "EDITOR" },
      { treeId: tree.id, userId: viewer.id, role: "VIEWER" },
    ],
  });
  return { owner, editor, viewer, tree };
}

describeDb("sharing page data", () => {
  beforeEach(resetDb);

  it("lists open invitations for owners without any token material, and drops revoked or expired ones", async () => {
    const { owner, editor, tree } = await setup();
    const a = await createInvitation(db, owner.id, tree.id, { email: "a@example.test", role: "EDITOR" });
    await createInvitation(db, owner.id, tree.id, { role: "VIEWER", singleUse: false });
    const gone = await createInvitation(db, owner.id, tree.id, { role: "VIEWER" });
    await db.invitation.update({ where: { id: gone.invitation.id }, data: { revokedAt: new Date() } });
    const old = await createInvitation(db, owner.id, tree.id, { role: "VIEWER" });
    await db.invitation.update({ where: { id: old.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const open = await listActiveInvitations(db, owner.id, tree.id);
    expect(open).toHaveLength(2);
    const text = JSON.stringify(open);
    expect(text).not.toContain(a.token);
    expect(text).not.toContain("tokenHash");

    const err = await listActiveInvitations(db, editor.id, tree.id).catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(403);
  });

  it("shows activity to any member but never the values that changed", async () => {
    const { owner, viewer, tree } = await setup();
    await createPerson(db, owner.id, tree.id, { fullName: "Sari Living", birthPlace: "Bandung" });
    const log = await listActivity(db, viewer.id, tree.id);
    expect(log.some((a) => a.action === "created" && a.entityType === "person")).toBe(true);
    expect(JSON.stringify(log)).not.toContain("Bandung");
    expect(log[0]).not.toHaveProperty("after");
  });

  it("keeps activity from non-members", async () => {
    const { tree } = await setup();
    const stranger = await makeUser("stranger");
    const err = await listActivity(db, stranger.id, tree.id).catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(404);
  });
});
