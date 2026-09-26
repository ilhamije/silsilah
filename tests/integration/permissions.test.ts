import { beforeEach, expect, it } from "vitest";
import { describeDb, makeUser, resetDb, testDb } from "../helpers/db";
import { HttpError } from "@/lib/errors";
import { createTree, deleteTree, updateTreeSettings } from "@/lib/trees";
import {
  createPerson,
  listRecentlyDeleted,
  purgeDeletedPeople,
  restorePerson,
  softDeletePerson,
  updatePerson,
} from "@/lib/people";
import { createRelationship } from "@/lib/relationships";
import { changeMemberRole, leaveTree, removeMember } from "@/lib/sharing/members";
import { acceptInvitation, createInvitation, revokeInvitation } from "@/lib/sharing/invitations";
import { reviewSuggestedEdit, submitSuggestedEdit } from "@/lib/sharing/suggested-edits";
import { readTree } from "@/lib/tree/read";

const db = testDb();

async function expectHttp(p: Promise<unknown>, status: number, code?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HttpError);
  expect((err as HttpError).status).toBe(status);
  if (code) expect((err as HttpError).code).toBe(code);
}

async function setup() {
  const owner = await makeUser("owner");
  const editor = await makeUser("editor");
  const viewer = await makeUser("viewer");
  const outsider = await makeUser("outsider");
  const tree = await createTree(db, owner.id, "Keluarga Hasan");
  await db.treeMember.createMany({
    data: [
      { treeId: tree.id, userId: editor.id, role: "EDITOR" },
      { treeId: tree.id, userId: viewer.id, role: "VIEWER" },
    ],
  });
  const person = await createPerson(db, owner.id, tree.id, {
    fullName: "Sari binti Hasan",
    birthDate: "1990",
    birthPlace: "Bandung",
    notes: "Guru",
  });
  return { owner, editor, viewer, outsider, tree, person };
}

describeDb("tree permissions", () => {
  beforeEach(resetDb);

  it("the creator becomes an owner", async () => {
    const { owner, tree } = await setup();
    const m = await db.treeMember.findUnique({
      where: { treeId_userId: { treeId: tree.id, userId: owner.id } },
    });
    expect(m?.role).toBe("OWNER");
  });

  it("non-members get 404 and can't learn the tree exists", async () => {
    const { outsider, tree } = await setup();
    await expectHttp(readTree(db, outsider.id, tree.id), 404, "tree_not_found");
  });

  it("viewer can read but can't edit, add, delete or relate people", async () => {
    const { viewer, tree, person } = await setup();
    await expect(readTree(db, viewer.id, tree.id)).resolves.toBeTruthy();
    await expectHttp(updatePerson(db, viewer.id, tree.id, person.id, 1, { fullName: "X" }), 403);
    await expectHttp(createPerson(db, viewer.id, tree.id, { fullName: "New" }), 403);
    await expectHttp(softDeletePerson(db, viewer.id, tree.id, person.id, 1), 403);
    await expectHttp(
      createRelationship(db, viewer.id, tree.id, {
        type: "SPOUSE",
        fromPersonId: person.id,
        toPersonId: person.id,
      }),
      403,
    );
  });

  it("editor can edit people but can't manage members, settings or delete the tree", async () => {
    const { editor, viewer, tree, person } = await setup();
    const updated = await updatePerson(db, editor.id, tree.id, person.id, 1, { birthPlace: "Bogor" });
    expect(updated.birthPlace).toBe("Bogor");
    expect(updated.version).toBe(2);
    await expectHttp(changeMemberRole(db, editor.id, tree.id, viewer.id, "EDITOR"), 403);
    await expectHttp(updateTreeSettings(db, editor.id, tree.id, { allowCrossFamilyMatch: true }), 403);
    await expectHttp(deleteTree(db, editor.id, tree.id), 403);
    await expectHttp(createInvitation(db, editor.id, tree.id, { role: "VIEWER" }), 403);
  });

  it("a removed member loses access immediately", async () => {
    const { owner, editor, tree } = await setup();
    await removeMember(db, owner.id, tree.id, editor.id);
    await expectHttp(readTree(db, editor.id, tree.id), 404);
  });

  it("a member can leave; the last owner cannot leave or be demoted", async () => {
    const { owner, viewer, tree } = await setup();
    await leaveTree(db, viewer.id, tree.id);
    await expectHttp(readTree(db, viewer.id, tree.id), 404);
    await expectHttp(leaveTree(db, owner.id, tree.id), 400, "last_owner");
    await expectHttp(changeMemberRole(db, owner.id, tree.id, owner.id, "EDITOR"), 400, "last_owner");
  });

  it("a tree can have several owners, and one can leave if another remains", async () => {
    const { owner, editor, tree } = await setup();
    await changeMemberRole(db, owner.id, tree.id, editor.id, "OWNER");
    await leaveTree(db, owner.id, tree.id);
    await expect(readTree(db, editor.id, tree.id)).resolves.toMatchObject({ role: "OWNER" });
  });

  it("owner can delete the tree permanently", async () => {
    const { owner, tree } = await setup();
    await deleteTree(db, owner.id, tree.id);
    expect(await db.familyTree.count()).toBe(0);
    expect(await db.person.count()).toBe(0);
  });
});

describeDb("living-person privacy", () => {
  beforeEach(resetDb);

  it("hides birth date, birthplace and notes of living people from viewers by default", async () => {
    const { viewer, tree } = await setup();
    const { people } = await readTree(db, viewer.id, tree.id);
    expect(people[0]).toMatchObject({
      fullName: "Sari binti Hasan",
      birthDate: null,
      birthPlace: null,
      notes: null,
      redacted: true,
    });
  });

  it("shows details to editors", async () => {
    const { editor, tree } = await setup();
    const { people } = await readTree(db, editor.id, tree.id);
    expect(people[0]).toMatchObject({ birthPlace: "Bandung", redacted: false });
  });

  it("shows deceased people's details to viewers", async () => {
    const { owner, viewer, tree } = await setup();
    await createPerson(db, owner.id, tree.id, { fullName: "H. Hasan", deathDate: "1998", birthPlace: "Garut" });
    const { people } = await readTree(db, viewer.id, tree.id);
    expect(people.find((p) => p.fullName === "H. Hasan")).toMatchObject({ birthPlace: "Garut", redacted: false });
  });

  it("shows everything once the owner turns the setting off", async () => {
    const { owner, viewer, tree } = await setup();
    await updateTreeSettings(db, owner.id, tree.id, { hideLivingFromViewers: false });
    const { people } = await readTree(db, viewer.id, tree.id);
    expect(people[0]).toMatchObject({ birthPlace: "Bandung", redacted: false });
  });
});

describeDb("optimistic locking", () => {
  beforeEach(resetDb);

  it("the second of two concurrent edits gets a 409 with the current row", async () => {
    const { owner, editor, tree, person } = await setup();
    await updatePerson(db, owner.id, tree.id, person.id, 1, { birthPlace: "Bogor" });
    const err = await updatePerson(db, editor.id, tree.id, person.id, 1, { birthPlace: "Depok" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(409);
    expect((err as HttpError).details).toMatchObject({ birthPlace: "Bogor", version: 2 });
    const stored = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(stored.birthPlace).toBe("Bogor");
  });
});

describeDb("recently deleted", () => {
  beforeEach(resetDb);

  it("soft-deletes, restores, and purges after 30 days", async () => {
    const { owner, tree, person } = await setup();
    await softDeletePerson(db, owner.id, tree.id, person.id, 1);
    expect((await readTree(db, owner.id, tree.id)).people).toHaveLength(0);
    expect(await listRecentlyDeleted(db, owner.id, tree.id)).toHaveLength(1);

    await restorePerson(db, owner.id, tree.id, person.id);
    expect((await readTree(db, owner.id, tree.id)).people).toHaveLength(1);

    const again = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    await softDeletePerson(db, owner.id, tree.id, person.id, again.version);
    expect(await purgeDeletedPeople(db, new Date(Date.now() + 29 * 86400000))).toBe(0);
    expect(await purgeDeletedPeople(db, new Date(Date.now() + 31 * 86400000))).toBe(1);
    expect(await db.person.count()).toBe(0);
  });

  it("hides relationships of deleted people", async () => {
    const { owner, tree, person } = await setup();
    const father = await createPerson(db, owner.id, tree.id, { fullName: "Hasan" });
    await createRelationship(db, owner.id, tree.id, {
      type: "PARENT_CHILD",
      fromPersonId: father.id,
      toPersonId: person.id,
    });
    expect((await readTree(db, owner.id, tree.id)).relationships).toHaveLength(1);
    await softDeletePerson(db, owner.id, tree.id, father.id, 1);
    expect((await readTree(db, owner.id, tree.id)).relationships).toHaveLength(0);
  });
});

describeDb("relationship validation", () => {
  beforeEach(resetDb);

  it("rejects cycles", async () => {
    const { owner, tree, person } = await setup();
    const child = await createPerson(db, owner.id, tree.id, { fullName: "Budi" });
    await createRelationship(db, owner.id, tree.id, {
      type: "PARENT_CHILD",
      fromPersonId: person.id,
      toPersonId: child.id,
    });
    await expectHttp(
      createRelationship(db, owner.id, tree.id, {
        type: "PARENT_CHILD",
        fromPersonId: child.id,
        toPersonId: person.id,
      }),
      400,
      "cycle",
    );
  });
});

describeDb("invitations", () => {
  beforeEach(resetDb);

  it("an invite link adds the user with the invited role", async () => {
    const { owner, outsider, tree } = await setup();
    const { token } = await createInvitation(db, owner.id, tree.id, { role: "EDITOR" });
    await acceptInvitation(db, outsider, token);
    await expect(readTree(db, outsider.id, tree.id)).resolves.toMatchObject({ role: "EDITOR" });
  });

  it("an expired invite fails", async () => {
    const { owner, outsider, tree } = await setup();
    const { token } = await createInvitation(db, owner.id, tree.id, { role: "VIEWER", expiresInDays: 7 });
    const later = new Date(Date.now() + 8 * 86400000);
    await expectHttp(acceptInvitation(db, outsider, token, later), 410, "invitation_expired");
    await expectHttp(readTree(db, outsider.id, tree.id), 404);
  });

  it("a revoked invite fails", async () => {
    const { owner, outsider, tree } = await setup();
    const { token, invitation } = await createInvitation(db, owner.id, tree.id, { role: "VIEWER" });
    await revokeInvitation(db, owner.id, tree.id, invitation.id);
    await expectHttp(acceptInvitation(db, outsider, token), 410, "invitation_revoked");
  });

  it("a single-use link works once; a multi-use link works repeatedly", async () => {
    const { owner, outsider, editor, tree } = await setup();
    const other = await makeUser("other");
    const single = await createInvitation(db, owner.id, tree.id, { role: "VIEWER", singleUse: true });
    await acceptInvitation(db, outsider, single.token);
    await expectHttp(acceptInvitation(db, other, single.token), 410, "invitation_used");

    const multi = await createInvitation(db, owner.id, tree.id, { role: "VIEWER", singleUse: false });
    await acceptInvitation(db, other, multi.token);
    await acceptInvitation(db, editor, multi.token);
    // An existing editor keeps the higher role.
    await expect(readTree(db, editor.id, tree.id)).resolves.toMatchObject({ role: "EDITOR" });
  });

  it("an email invite only works for that email", async () => {
    const { owner, outsider, tree } = await setup();
    const { token } = await createInvitation(db, owner.id, tree.id, {
      role: "VIEWER",
      email: "someone.else@example.test",
    });
    await expectHttp(acceptInvitation(db, outsider, token), 403, "invitation_email_mismatch");
  });

  it("links can't grant ownership", async () => {
    const { owner, tree } = await setup();
    await expectHttp(createInvitation(db, owner.id, tree.id, { role: "OWNER" }), 400, "owner_link_not_allowed");
  });

  it("stores only a hash of the token", async () => {
    const { owner, tree } = await setup();
    const { token, invitation } = await createInvitation(db, owner.id, tree.id, { role: "VIEWER" });
    expect(invitation.tokenHash).not.toContain(token);
  });
});

describeDb("suggested edits", () => {
  beforeEach(resetDb);

  it("a viewer suggests, a viewer can't approve, an editor approves and it applies", async () => {
    const { viewer, editor, tree, person } = await setup();
    const edit = await submitSuggestedEdit(db, viewer.id, tree.id, person.id, { birthDate: "1991" });
    await expectHttp(reviewSuggestedEdit(db, viewer.id, tree.id, edit.id, "APPROVED"), 403);
    await reviewSuggestedEdit(db, editor.id, tree.id, edit.id, "APPROVED");
    const stored = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(stored.birthDate).toBe("1991");
    expect(stored.birthYear).toBe(1991);
  });
});

describeDb("activity log", () => {
  beforeEach(resetDb);

  it("records who did what", async () => {
    const { editor, tree, person } = await setup();
    await updatePerson(db, editor.id, tree.id, person.id, 1, { birthPlace: "Bogor" });
    const entry = await db.activityLog.findFirst({
      where: { treeId: tree.id, action: "updated" },
    });
    expect(entry).toMatchObject({
      userId: editor.id,
      entityType: "person",
      before: { birthPlace: "Bandung" },
      after: { birthPlace: "Bogor" },
    });
  });
});
