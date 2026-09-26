import type { Db } from "@/lib/db";
import { assertTreePermission } from "@/lib/authz/tree-access";
import { logActivity } from "@/lib/activity";
import { badRequest } from "@/lib/errors";
import { z } from "zod";

export const treeNameSchema = z.string().trim().min(1).max(120);

export async function createTree(db: Db, userId: string, name: string) {
  const parsed = treeNameSchema.safeParse(name);
  if (!parsed.success) throw badRequest("invalid_name");
  return db.$transaction(async (tx) => {
    const tree = await tx.familyTree.create({
      data: {
        name: parsed.data,
        lastEditedById: userId,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    await logActivity(tx, {
      treeId: tree.id,
      userId,
      action: "created",
      entityType: "tree",
      entityId: tree.id,
      after: { name: tree.name },
    });
    return tree;
  });
}

export async function listTreesForUser(db: Db, userId: string) {
  const memberships = await db.treeMember.findMany({
    where: { userId },
    include: {
      tree: {
        select: {
          id: true,
          name: true,
          updatedAt: true,
          _count: { select: { people: { where: { deletedAt: null } }, members: true } },
        },
      },
    },
    orderBy: { tree: { updatedAt: "desc" } },
  });
  return memberships.map((m) => ({ role: m.role, ...m.tree }));
}

export const treeSettingsSchema = z
  .object({
    name: treeNameSchema,
    hideLivingFromViewers: z.boolean(),
    allowCrossFamilyMatch: z.boolean(),
  })
  .partial();

export async function updateTreeSettings(
  db: Db,
  userId: string,
  treeId: string,
  input: z.infer<typeof treeSettingsSchema>,
) {
  const access = await assertTreePermission(db, userId, treeId, "tree.settings");
  const data = treeSettingsSchema.parse(input);
  return db.$transaction(async (tx) => {
    const updated = await tx.familyTree.update({ where: { id: treeId }, data });
    await logActivity(tx, {
      treeId,
      userId,
      action: "settings_changed",
      entityType: "tree",
      entityId: treeId,
      before: access.tree,
      after: data,
    });
    return updated;
  });
}

/**
 * Permanent. Cascades to people, relationships, images and logs. The caller
 * must delete the returned blob pathnames from storage.
 */
export async function deleteTree(db: Db, userId: string, treeId: string) {
  await assertTreePermission(db, userId, treeId, "tree.delete");
  const images = await db.sourceImage.findMany({
    where: { treeId, blobPathname: { not: null } },
    select: { blobPathname: true },
  });
  await db.familyTree.delete({ where: { id: treeId } });
  return images.map((i) => i.blobPathname!);
}
