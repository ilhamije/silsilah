import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export type ActivityEntry = {
  treeId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

const toJson = (v: unknown) =>
  v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Call inside the same transaction as the write it describes. */
export async function logActivity(tx: Tx, e: ActivityEntry) {
  await tx.activityLog.create({
    data: {
      treeId: e.treeId,
      userId: e.userId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      before: toJson(e.before),
      after: toJson(e.after),
    },
  });
}

/** Marks the tree as changed so other members see "updated by X". */
export async function touchTree(tx: Tx, treeId: string, userId: string | null, structural = true) {
  await tx.familyTree.update({
    where: { id: treeId },
    data: {
      lastEditedById: userId,
      ...(structural ? { structureVersion: { increment: 1 } } : {}),
    },
  });
}
