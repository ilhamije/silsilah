import { createStore, del, get, set, type UseStore } from "idb-keyval";
import type { ExtractResponse } from "@/lib/extraction/service";
import type { ReviewDraft } from "@/lib/review/draft";

/*
 * The photographed pages live only in this browser (IndexedDB) until the user
 * confirms the review. They survive a reload or closing the tab, but never
 * leave the device except for the one request that reads each page.
 */

export type PageError = { code: string; retryable: boolean };

export type StoredPage = {
  id: string;
  blob: Blob;
  width: number;
  height: number;
  addedAt: number;
  result?: ExtractResponse;
  error?: PageError;
  /** The user chose to keep a borderline page and fix it by hand. */
  continuedAnyway?: boolean;
};

export type ImportSession = {
  treeId: string;
  pages: StoredPage[];
  updatedAt: number;
  /** The review screen's working copy, autosaved on every change. */
  draft?: ReviewDraft;
  /** Sent with Confirm so a repeated save is recognised by the server. */
  importId?: string;
};

let store: UseStore | null | undefined;
function getStore(): UseStore | null {
  if (store !== undefined) return store;
  try {
    store = typeof indexedDB === "undefined" ? null : createStore("silsilah", "import-sessions");
  } catch {
    store = null; // e.g. some private-browsing modes
  }
  return store;
}

const memory = new Map<string, ImportSession>();
const key = (treeId: string) => `tree:${treeId}`;

/** False when the browser can't keep pages across reloads (the page warns the user). */
export const canPersist = () => getStore() !== null;

export async function loadSession(treeId: string): Promise<ImportSession> {
  const s = getStore();
  try {
    const found = s ? await get<ImportSession>(key(treeId), s) : memory.get(key(treeId));
    if (found) return found;
  } catch {
    /* fall through to an empty session */
  }
  return { treeId, pages: [], updatedAt: Date.now() };
}

export async function saveSession(session: ImportSession): Promise<void> {
  const next = { ...session, updatedAt: Date.now() };
  memory.set(key(session.treeId), next);
  const s = getStore();
  if (!s) return;
  try {
    await set(key(session.treeId), next, s);
  } catch {
    /* quota or private mode: the in-memory copy still works for this visit */
  }
}

/** Deletes the local photos and results for a tree. */
export async function clearSession(treeId: string): Promise<void> {
  memory.delete(key(treeId));
  const s = getStore();
  if (s) await del(key(treeId), s).catch(() => undefined);
}

export function isAccepted(p: StoredPage) {
  const kind = p.result?.verdict.kind;
  return kind === "ok" || (kind === "borderline" && !!p.continuedAnyway);
}
