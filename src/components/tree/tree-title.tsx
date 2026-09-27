"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { renameTreeAction } from "@/app/trees/[treeId]/actions";
import { Button, Input, Notice } from "@/components/ui";

/** The tree's name as the page title; owners can rename it in place. */
export function TreeTitle({ treeId, name, canRename }: { treeId: string; name: string; canRename: boolean }) {
  const t = useTranslations("tree");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameButton = useRef<HTMLButtonElement>(null);

  function stop() {
    setEditing(false);
    setValue(name);
    setError(null);
    // Back to the button that opened the editor, for keyboard users.
    requestAnimationFrame(() => renameButton.current?.focus());
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next || next === name) return stop();
    setBusy(true);
    setError(null);
    const res = await renameTreeAction(treeId, next);
    setBusy(false);
    if (!res.ok) return setError(res.error === "invalid_name" ? t("renameInvalid") : t("errorGeneric"));
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="break-words">{name}</h1>
        {canRename && (
          <Button ref={renameButton} type="button" variant="secondary" onClick={() => setEditing(true)} aria-label={t("renameLabel", { name })}>
            <span aria-hidden>✎</span> {t("rename")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
      <h1 className="sr-only">{name}</h1>
      <label htmlFor="tree-name" className="font-semibold">
        {t("renameField")}
      </label>
      <Input
        id="tree-name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && stop()}
        required
        maxLength={120}
        autoFocus
        className="font-display text-2xl font-bold"
      />
      {error && (
        <Notice tone="notice" role="alert">
          {error}
        </Notice>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? t("saving") : t("renameSave")}
        </Button>
        <Button type="button" variant="quiet" onClick={stop}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
