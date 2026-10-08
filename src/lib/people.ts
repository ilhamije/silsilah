import { z } from "zod";
import type { Db } from "@/lib/db";
import type { Person, Prisma } from "@/generated/prisma/client";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity, touchTree } from "@/lib/activity";
import { badRequest, ConflictError, notFound } from "@/lib/errors";
import { parseYear } from "@/lib/tree/dates";
import { inferLiving } from "@/lib/tree/living";
import { nameKey } from "@/lib/tree/name-key";

type Tx = Prisma.TransactionClient;

export const RECENTLY_DELETED_DAYS = 30;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const personShape = {
  fullName: z.string().trim().min(1).max(200),
  givenName: optionalText(100),
  familyName: optionalText(100),
  nicknames: z.array(z.string().trim().min(1).max(100)).max(20),
  gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]),
  birthDate: optionalText(60),
  deathDate: optionalText(60),
  birthPlace: optionalText(200),
  notes: optionalText(4000),
  // null = infer from dates; true/false = manual override.
  livingOverride: z.boolean().nullable(),
};

export const personFieldsSchema = z.object({
  ...personShape,
  nicknames: personShape.nicknames.default([]),
  gender: personShape.gender.default("UNKNOWN"),
  livingOverride: personShape.livingOverride.default(null),
});

export type PersonFields = z.infer<typeof personFieldsSchema>;
// No defaults here: a patch only carries the fields it names, so a partial
// edit must not reset the others.
export const personPatchSchema = z.object(personShape).partial();
export type PersonPatch = z.infer<typeof personPatchSchema>;

/** Fields a person edit may touch, used for diffs in conflicts and the activity log. */
export const EDITABLE_FIELDS = [
  "fullName",
  "givenName",
  "familyName",
  "nicknames",
  "gender",
  "birthDate",
  "deathDate",
  "birthPlace",
  "notes",
  "isLiving",
  "livingIsManual",
] as const;

/** Stored columns for a person: parsed years, living status and name key derived from the fields. */
export function personDataFromFields(
  fields: Omit<PersonFields, "livingOverride"> & { livingOverride: boolean | null },
) {
  const birthYear = parseYear(fields.birthDate);
  const deathYear = parseYear(fields.deathDate);
  const livingIsManual = fields.livingOverride !== null;
  const isLiving = livingIsManual
    ? fields.livingOverride
    : inferLiving({ ...fields, birthYear, deathYear });
  const rest: Omit<typeof fields, "livingOverride"> & { livingOverride?: unknown } = { ...fields };
  delete rest.livingOverride;
  return { ...rest, birthYear, deathYear, isLiving, livingIsManual, nameKey: nameKey(fields.fullName) };
}

function pick(p: Partial<Person>) {
  return Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, p[f]]));
}

function changedFields(before: Partial<Person>, after: Partial<Person>) {
  return EDITABLE_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}

async function loadLivePerson(tx: Tx | Db, treeId: string, personId: string) {
  const person = await tx.person.findFirst({ where: { id: personId, treeId, deletedAt: null } });
  if (!person) throw notFound("person_not_found");
  return person;
}

export async function createPerson(db: Db, userId: string, treeId: string, input: unknown) {
  await assertTreePermission(db, userId, treeId, "person.write");
  const parsed = personFieldsSchema.safeParse(input);
  if (!parsed.success) throw badRequest("invalid_person", parsed.error.issues);
  return db.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: { treeId, ...personDataFromFields(parsed.data), updatedById: userId },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "created",
      entityType: "person",
      entityId: person.id,
      after: pick(person),
    });
    await touchTree(tx, treeId, userId);
    return person;
  });
}

/**
 * Optimistic locking: the caller sends the version it loaded. If someone else
 * saved in between, nothing is written and a 409 carries the current row so
 * the UI can show what changed and let the user choose.
 */
export async function updatePerson(
  db: Db,
  userId: string,
  treeId: string,
  personId: string,
  expectedVersion: number,
  patch: unknown,
) {
  await assertTreePermission(db, userId, treeId, "person.write");
  const parsed = personPatchSchema.safeParse(patch);
  if (!parsed.success) throw badRequest("invalid_person", parsed.error.issues);

  return db.$transaction(async (tx) => {
    const current = await loadLivePerson(tx, treeId, personId);
    if (current.version !== expectedVersion) throw new ConflictError(current);

    const merged = {
      fullName: current.fullName,
      givenName: current.givenName,
      familyName: current.familyName,
      nicknames: current.nicknames,
      gender: current.gender,
      birthDate: current.birthDate,
      deathDate: current.deathDate,
      birthPlace: current.birthPlace,
      notes: current.notes,
      livingOverride: current.livingIsManual ? current.isLiving : null,
      ...stripUndefined(parsed.data),
    };
    const data = personDataFromFields(merged);

    const { count } = await tx.person.updateMany({
      where: { id: personId, version: expectedVersion },
      data: { ...data, version: { increment: 1 }, updatedById: userId },
    });
    if (count === 0) {
      throw new ConflictError(await tx.person.findUnique({ where: { id: personId } }));
    }
    const updated = await tx.person.findUniqueOrThrow({ where: { id: personId } });
    const fields = changedFields(current, updated);
    if (fields.length) {
      await logActivity(tx, {
        treeId,
        userId,
        action: "updated",
        entityType: "person",
        entityId: personId,
        before: Object.fromEntries(fields.map((f) => [f, current[f]])),
        after: Object.fromEntries(fields.map((f) => [f, updated[f]])),
      });
      await touchTree(tx, treeId, userId, fields.includes("fullName"));
    }
    return updated;
  });
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Moves a person to "recently deleted". Their relationships are hidden with them. */
export async function softDeletePerson(
  db: Db,
  userId: string,
  treeId: string,
  personId: string,
  expectedVersion: number,
) {
  await assertTreePermission(db, userId, treeId, "person.write");
  return db.$transaction(async (tx) => {
    const current = await loadLivePerson(tx, treeId, personId);
    const { count } = await tx.person.updateMany({
      where: { id: personId, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 }, updatedById: userId },
    });
    if (count === 0) throw new ConflictError(current);
    await logActivity(tx, {
      treeId,
      userId,
      action: "deleted",
      entityType: "person",
      entityId: personId,
      before: pick(current),
    });
    await touchTree(tx, treeId, userId);
  });
}

export async function restorePerson(db: Db, userId: string, treeId: string, personId: string) {
  await assertTreePermission(db, userId, treeId, "person.write");
  return db.$transaction(async (tx) => {
    const person = await tx.person.findFirst({
      where: { id: personId, treeId, deletedAt: { not: null } },
    });
    if (!person) throw notFound("person_not_found");
    const restored = await tx.person.update({
      where: { id: personId },
      data: { deletedAt: null, version: { increment: 1 }, updatedById: userId },
    });
    await logActivity(tx, {
      treeId,
      userId,
      action: "restored",
      entityType: "person",
      entityId: personId,
      after: pick(restored),
    });
    await touchTree(tx, treeId, userId);
    return restored;
  });
}

/**
 * "This is me": links the caller's membership to a person in the tree, or
 * clears it with null. Any member may say who they are, viewers included; it
 * only changes how their own chart looks.
 */
export async function setSelfPerson(db: Db, userId: string, treeId: string, personId: string | null) {
  await assertTreePermission(db, userId, treeId, "tree.read");
  if (personId) {
    const person = await db.person.findFirst({ where: { id: personId, treeId, deletedAt: null } });
    if (!person) throw notFound("person_not_found");
  }
  await db.treeMember.update({ where: { treeId_userId: { treeId, userId } }, data: { personId } });
}

export async function listRecentlyDeleted(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "person.write");
  return db.person.findMany({
    where: { treeId, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
  });
}

/** Run by the daily cron: permanently removes people deleted more than 30 days ago. */
export async function purgeDeletedPeople(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - RECENTLY_DELETED_DAYS * 24 * 60 * 60 * 1000);
  const doomed = await db.person.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, treeId: true, fullName: true },
  });
  if (!doomed.length) return 0;
  await db.$transaction(async (tx) => {
    await tx.person.deleteMany({ where: { id: { in: doomed.map((p) => p.id) } } });
    for (const p of doomed) {
      await logActivity(tx, {
        treeId: p.treeId,
        userId: null,
        action: "purged",
        entityType: "person",
        entityId: p.id,
        before: { fullName: p.fullName },
      });
    }
  });
  return doomed.length;
}
