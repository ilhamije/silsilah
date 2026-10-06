"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/authz/session";
import { HttpError } from "@/lib/errors";
import { acceptSuggestion, rejectSuggestion, respondToConnection, undoOperation, unlinkPair } from "@/lib/merge/apply";

export type MergeActionResult = { ok: true; note?: string } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<string | void>): Promise<MergeActionResult> {
  try {
    const user = await requireUser();
    const note = await fn(user.id);
    return { ok: true, note: note ?? undefined };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.code };
    console.error(e);
    return { ok: false, error: "internal_error" };
  }
}

const str = (v: unknown) => String(v ?? "");

export async function acceptMergeAction(suggestionId: string, input: unknown) {
  return run(async (userId) => {
    await acceptSuggestion(db, userId, str(suggestionId), input);
  });
}

export async function rejectMergeAction(suggestionId: string) {
  return run((userId) => rejectSuggestion(db, userId, str(suggestionId)));
}

export async function undoMergeAction(operationId: string) {
  return run(async (userId) => {
    const r = await undoOperation(db, userId, str(operationId));
    return r.keptNewerEdits ? String(r.keptNewerEdits) : undefined;
  });
}

export async function unlinkAction(linkId: string) {
  return run((userId) => unlinkPair(db, userId, str(linkId)));
}

export async function respondConnectionAction(requestId: string, accept: boolean) {
  return run((userId) => respondToConnection(db, userId, str(requestId), !!accept));
}
