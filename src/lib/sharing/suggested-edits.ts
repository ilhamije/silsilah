import type { Db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity } from "@/lib/activity";
import { badRequest, notFound } from "@/lib/errors";
import { personPatchSchema, updatePerson } from "@/lib/people";

/** Viewers (and anyone else on the tree) can propose changes to a person. */
export async function submitSuggestedEdit(
  db: Db,
  userId: string,
  treeId: string,
  personId: string,
  changes: unknown,
) {
  await assertTreePermission(db, userId, treeId, "edit.suggest");
  const parsed = personPatchSchema.safeParse(changes);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    throw badRequest("invalid_suggestion");
  }
  const person = await db.person.findFirst({ where: { id: personId, treeId, deletedAt: null } });
  if (!person) throw notFound("person_not_found");

  return db.$transaction(async (tx) => {
    const edit = await tx.suggestedEdit.create({
      data: {
        treeId,
        personId,
        baseVersion: person.version,
        proposedChanges: parsed.data as Prisma.InputJsonValue,
        submittedById: userId,
      },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "suggested",
      entityType: "person",
      entityId: personId,
      after: parsed.data,
    });
    return edit;
  });
}

/**
 * Editors/owners approve or reject. Approval applies the proposed fields to
 * the person as it is *now*; the reviewer has seen the current values.
 */
export async function reviewSuggestedEdit(
  db: Db,
  userId: string,
  treeId: string,
  editId: string,
  decision: "APPROVED" | "REJECTED",
) {
  await assertTreePermission(db, userId, treeId, "edit.review");
  const edit = await db.suggestedEdit.findFirst({ where: { id: editId, treeId, status: "PENDING" } });
  if (!edit) throw notFound("suggestion_not_found");

  if (decision === "APPROVED") {
    const person = await db.person.findFirst({ where: { id: edit.personId, treeId, deletedAt: null } });
    if (!person) throw notFound("person_not_found");
    await updatePerson(db, userId, treeId, person.id, person.version, edit.proposedChanges);
  }
  return db.$transaction(async (tx) => {
    const reviewed = await tx.suggestedEdit.update({
      where: { id: editId },
      data: { status: decision, reviewedById: userId, reviewedAt: new Date() },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: decision === "APPROVED" ? "suggestion_approved" : "suggestion_rejected",
      entityType: "suggested_edit",
      entityId: editId,
    });
    return reviewed;
  });
}

/** Pending suggestions for the review list, newest first. Editors and owners only. */
export async function listPendingSuggestions(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "edit.review");
  return db.suggestedEdit.findMany({
    where: { treeId, status: "PENDING", person: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      personId: true,
      proposedChanges: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
    },
  });
}
