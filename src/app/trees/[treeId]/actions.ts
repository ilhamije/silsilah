"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { detectMerges } from "@/lib/merge/detect";
import { requireUser } from "@/lib/authz/session";
import { ConflictError, HttpError } from "@/lib/errors";
import { createPerson, restorePerson, setSelfPerson, softDeletePerson, updatePerson } from "@/lib/people";
import { reviewSuggestedEdit, submitSuggestedEdit } from "@/lib/sharing/suggested-edits";
import type { Person } from "@/generated/prisma/client";
import { addRelative, createRelationship, deleteRelationship } from "@/lib/relationships";
import { updateTreeSettings } from "@/lib/trees";

/*
 * Editing a saved tree from the chart. Every action goes through the
 * permission-checked services in src/lib; they are the only authority.
 * Errors come back as data so the panel can show them in place.
 */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string; conflict?: boolean };

/** The saved version of a person, returned when someone else saved first. */
export type ConflictPerson = Pick<
  Person,
  "version" | "fullName" | "gender" | "birthDate" | "deathDate" | "birthPlace" | "notes" | "isLiving" | "livingIsManual"
>;
export type SaveResult = ActionResult | { ok: false; error: "version_conflict"; conflict: true; current: ConflictPerson };

/**
 * Runs an action as the signed-in user. Pass `detectFor` for edits that change
 * the shape of a tree: merge detection then runs after the response is sent.
 */
async function run(
  fn: (userId: string) => Promise<{ id?: string } | void>,
  detectFor?: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const out = await fn(user.id);
    if (detectFor) {
      after(() => detectMerges(db, detectFor, { userId: user.id }).catch((e) => console.error("merge detection failed", e)));
    }
    return { ok: true, id: out?.id };
  } catch (e) {
    if (e instanceof HttpError) {
      return { ok: false, error: e.code, conflict: e instanceof ConflictError };
    }
    console.error(e);
    return { ok: false, error: "internal_error" };
  }
}

const str = (v: unknown) => String(v ?? "");

export async function savePersonAction(
  treeId: string,
  personId: string,
  version: number,
  fields: unknown,
): Promise<SaveResult> {
  let current: Person | null = null;
  const res = await run(async (userId) => {
    try {
      await updatePerson(db, userId, str(treeId), str(personId), Number(version), fields);
    } catch (e) {
      if (e instanceof ConflictError) current = e.current as Person | null;
      throw e;
    }
  }, str(treeId));
  const c = current as Person | null;
  if (!res.ok && res.conflict && c) {
    // Editors only reach this point (updatePerson checks person.write), so no redaction is needed.
    const { version: v, fullName, gender, birthDate, deathDate, birthPlace, notes, isLiving, livingIsManual } = c;
    return {
      ok: false,
      error: "version_conflict",
      conflict: true,
      current: { version: v, fullName, gender, birthDate, deathDate, birthPlace, notes, isLiving, livingIsManual },
    };
  }
  return res;
}

export async function deletePersonAction(treeId: string, personId: string, version: number) {
  return run((userId) => softDeletePerson(db, userId, str(treeId), str(personId), Number(version)), str(treeId));
}

export async function addPersonAction(treeId: string, fields: unknown) {
  return run((userId) => createPerson(db, userId, str(treeId), fields), str(treeId));
}

export async function addRelativeAction(
  treeId: string,
  personId: string,
  kind: string,
  fields: unknown,
  otherParentId: string | null = null,
) {
  return run(
    (userId) =>
      addRelative(db, userId, str(treeId), str(personId), kind, fields, otherParentId ? str(otherParentId) : null),
    str(treeId),
  );
}

/** "This is me" (a person id) or "This isn't me" (null). */
export async function setSelfAction(treeId: string, personId: string | null) {
  return run((userId) => setSelfPerson(db, userId, str(treeId), personId ? str(personId) : null));
}

export async function connectAction(treeId: string, input: unknown) {
  return run((userId) => createRelationship(db, userId, str(treeId), input), str(treeId));
}

export async function disconnectAction(treeId: string, relationshipId: string, version: number) {
  return run((userId) => deleteRelationship(db, userId, str(treeId), str(relationshipId), Number(version)), str(treeId));
}

/** Owners only (the "tree.settings" permission). */
export async function renameTreeAction(treeId: string, name: string) {
  return run(async (userId) => {
    await updateTreeSettings(db, userId, str(treeId), { name: str(name) });
  });
}

/** Anyone on the tree, typically a Viewer, can propose changes to a person. */
export async function suggestEditAction(treeId: string, personId: string, changes: unknown) {
  return run((userId) => submitSuggestedEdit(db, userId, str(treeId), str(personId), changes));
}

export async function reviewSuggestionAction(treeId: string, editId: string, approve: boolean) {
  return run(async (userId) => {
    await reviewSuggestedEdit(db, userId, str(treeId), str(editId), approve ? "APPROVED" : "REJECTED");
  });
}

export async function restorePersonAction(treeId: string, personId: string) {
  return run(async (userId) => {
    await restorePerson(db, userId, str(treeId), str(personId));
  });
}
