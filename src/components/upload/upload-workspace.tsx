"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cropImage, ImagePrepError, prepareImage, rotateImage } from "@/client/image";
import {
  canPersist,
  clearSession,
  isAccepted,
  loadSession,
  saveSession,
  type PageError,
  type StoredPage,
} from "@/client/pages-store";
import { useObjectUrl } from "@/client/use-object-url";
import { combinePages, knownPeopleFrom } from "@/lib/ai/combine";
import type { ExtractResponse } from "@/lib/extraction/service";
import { AlbumFrame, Button, buttonClass, Notice } from "@/components/ui";
import {
  CameraIcon,
  CheckIcon,
  CropIcon,
  GalleryIcon,
  RemoveIcon,
  ReplaceIcon,
  RotateIcon,
  UpIcon,
} from "@/components/icons";
import { CropDialog } from "./crop-dialog";

type Reading = { position: number; total: number; retrying: boolean };

/** A new local page. The id doubles as the scope key for the page's person ids. */
const makePage = (img: Pick<StoredPage, "blob" | "width" | "height">): StoredPage => ({
  id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
  ...img,
  addedAt: Date.now(),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Errors that make reading further pages pointless right now. */
const STOP_CODES = new Set(["daily_limit", "ai_not_configured"]);

/** Accepted results of the pages before `index`, in page order, for KNOWN_PEOPLE. */
function acceptedBefore(pages: StoredPage[], index: number) {
  return pages
    .slice(0, index)
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => isAccepted(p))
    .map(({ p, i }) => ({ pageIndex: i, extraction: p.result!.extraction }));
}

export function UploadWorkspace({ treeId }: { treeId: string }) {
  const t = useTranslations("upload");
  const [pages, setPages] = useState<StoredPage[]>([]);
  const pagesRef = useRef<StoredPage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [preparing, setPreparing] = useState(0);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const replaceId = useRef<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    loadSession(treeId).then((s) => {
      setPersistent(canPersist());
      pagesRef.current = s.pages;
      setPages(s.pages);
      setLoaded(true);
    });
  }, [treeId]);

  const commit = useCallback(
    (next: StoredPage[]) => {
      pagesRef.current = next;
      setPages(next);
      void saveSession({ treeId, pages: next, updatedAt: Date.now() });
    },
    [treeId],
  );

  const updatePage = (id: string, patch: Partial<StoredPage>) =>
    commit(pagesRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** A changed photo invalidates whatever was read from the old one. */
  const freshImage = { result: undefined, error: undefined, continuedAnyway: undefined };

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const target = replaceId.current;
    replaceId.current = null;
    setPrepError(null);
    const list = target ? [files[0]] : [...files];
    setPreparing(list.length);
    const added: StoredPage[] = [];
    for (const file of list) {
      try {
        const img = await prepareImage(file);
        added.push(makePage(img));
      } catch (e) {
        setPrepError(e instanceof ImagePrepError ? e.code : "decode_failed");
      }
      setPreparing((n) => n - 1);
    }
    if (!added.length) return;
    if (target) {
      commit(pagesRef.current.map((p) => (p.id === target ? { ...added[0], id: p.id, ...freshImage } : p)));
    } else {
      commit([...pagesRef.current, ...added]);
    }
  }

  function openPicker(kind: "camera" | "gallery", replacing?: string) {
    replaceId.current = replacing ?? null;
    (kind === "camera" ? cameraInput : galleryInput).current?.click();
  }

  async function rotate(page: StoredPage) {
    const img = await rotateImage(page.blob);
    updatePage(page.id, { ...img, ...freshImage });
  }

  async function applyCrop(rect: { x: number; y: number; width: number; height: number }) {
    const page = pagesRef.current.find((p) => p.id === croppingId);
    setCroppingId(null);
    if (!page) return;
    const img = await cropImage(page.blob, rect);
    updatePage(page.id, { ...img, ...freshImage });
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const next = [...pagesRef.current];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    commit(next);
  }

  async function readOne(page: StoredPage, index: number): Promise<{ result?: ExtractResponse; error?: PageError }> {
    const all = pagesRef.current;
    const known = knownPeopleFrom(combinePages(acceptedBefore(all, index)).people);
    const body = new FormData();
    body.append("image", page.blob, "page.jpg");
    body.append("pageIndex", String(index));
    body.append("totalPages", String(all.length));
    body.append("pageScope", page.id);
    body.append("knownPeople", JSON.stringify(known));

    for (let attempt = 1; ; attempt++) {
      let error: PageError;
      try {
        const res = await fetch(`/api/trees/${treeId}/extract`, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(295_000),
        });
        if (res.ok) return { result: (await res.json()) as ExtractResponse };
        const data = (await res.json().catch(() => ({}))) as { error?: string; details?: { retryable?: boolean } };
        error = { code: data.error ?? "generic", retryable: !!data.details?.retryable };
      } catch (e) {
        const timedOut = e instanceof DOMException && e.name === "TimeoutError";
        error = { code: timedOut ? "ai_timeout" : "network", retryable: true };
      }
      // One automatic retry for temporary problems, after a short pause.
      if (!error.retryable || attempt >= 2) return { error };
      setReading((r) => (r ? { ...r, retrying: true } : r));
      await sleep(5000);
      setReading((r) => (r ? { ...r, retrying: false } : r));
    }
  }

  async function read(onlyId?: string) {
    const todo = pagesRef.current
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => (onlyId ? p.id === onlyId : !p.result));
    for (let n = 0; n < todo.length; n++) {
      const { p } = todo[n];
      const index = pagesRef.current.findIndex((x) => x.id === p.id);
      if (index < 0) continue;
      setReading({ position: n + 1, total: todo.length, retrying: false });
      const out = await readOne(pagesRef.current[index], index);
      updatePage(p.id, { result: out.result, error: out.error, continuedAnyway: undefined });
      if (out.error && STOP_CODES.has(out.error.code)) break;
    }
    setReading(null);
    requestAnimationFrame(() => resultsHeading.current?.focus());
  }

  async function startOver() {
    if (!window.confirm(t("startOverConfirm"))) return;
    await clearSession(treeId);
    commit([]);
  }

  const unread = pages.filter((p) => !p.result).length;
  const accepted = pages.filter(isAccepted);
  const combined = useMemo(
    () =>
      combinePages(
        pages
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => isAccepted(p))
          .map(({ p, i }) => ({ pageIndex: i, extraction: p.result!.extraction })),
      ),
    [pages],
  );
  const busy = !!reading || preparing > 0;
  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));

  return (
    <div className="flex flex-col gap-14">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <section aria-label={t("title")} className="flex flex-col gap-8">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <Button type="button" className="min-h-16 text-lg" onClick={() => openPicker("camera")} disabled={busy}>
            <CameraIcon />
            {t("takePhoto")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-16 text-lg"
            onClick={() => openPicker("gallery")}
            disabled={busy}
          >
            <GalleryIcon />
            {t("chooseGallery")}
          </Button>
        </div>

        {!persistent && <Notice tone="notice">{t("noPersist")}</Notice>}
        {prepError && (
          <Notice tone="notice" role="alert">
            {errorText(prepError)}
          </Notice>
        )}
        {preparing > 0 && (
          <p role="status" className="text-ink-muted">
            {t("preparing")}
          </p>
        )}

        {loaded && pages.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="eyebrow">{t("tipsTitle")}</p>
            <ul className="measure flex flex-col border-t border-rule">
              {[t("tip1"), t("tip2"), t("tip3")].map((tip) => (
                <li key={tip} className="border-b border-rule py-3 text-ink-muted">
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {pages.length > 0 && (
        <section aria-labelledby="pages-heading" className="flex flex-col gap-8">
          <h2 id="pages-heading" ref={resultsHeading} tabIndex={-1} className="outline-none">
            {t("pagesHeading")}
          </h2>

          <ol className="grid gap-12 md:grid-cols-2">
            {pages.map((page, index) => (
              <PageCard
                key={page.id}
                page={page}
                index={index}
                disabled={busy}
                onRotate={() => void rotate(page)}
                onCrop={() => setCroppingId(page.id)}
                onReplace={() => openPicker("camera", page.id)}
                onReplaceFromGallery={() => openPicker("gallery", page.id)}
                onRemove={() => commit(pagesRef.current.filter((p) => p.id !== page.id))}
                onMoveUp={() => moveUp(index)}
                onRetry={() => void read(page.id)}
                onContinue={() => updatePage(page.id, { continuedAnyway: true })}
                errorText={errorText}
              />
            ))}
          </ol>

          {reading ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3 border-t border-rule pt-8">
              <p className="font-serif text-2xl">
                {reading.retrying ? t("retrying") : t("reading", { n: reading.position, total: reading.total })}
              </p>
              <progress
                className="silsilah-progress h-2 w-full"
                max={reading.total}
                value={reading.position - 1}
                aria-label={t("progressLabel")}
              />
              <p className="measure text-sm text-ink-muted">{t("readingHint")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 border-t border-rule pt-8">
              {unread === 0 && accepted.length > 0 && (
                <p className="font-serif text-2xl">
                  {t("summary", { people: combined.people.length, pages: accepted.length })}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4">
                {unread > 0 ? (
                  <Button type="button" onClick={() => void read()} disabled={busy}>
                    {unread === pages.length
                      ? t("readPages", { count: unread })
                      : t("readRemaining", { count: unread })}
                  </Button>
                ) : (
                  accepted.length > 0 && (
                    <Link href={`/trees/${treeId}/review`} className={buttonClass("primary")}>
                      {t("review")} →
                    </Link>
                  )
                )}
                <Button type="button" variant="quiet" onClick={() => void startOver()} disabled={busy}>
                  {t("startOver")}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <CropDialog
        blob={pages.find((p) => p.id === croppingId)?.blob ?? null}
        onApply={(rect) => void applyCrop(rect)}
        onClose={() => setCroppingId(null)}
      />
    </div>
  );
}

type CardProps = {
  page: StoredPage;
  index: number;
  disabled: boolean;
  onRotate: () => void;
  onCrop: () => void;
  onReplace: () => void;
  onReplaceFromGallery: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onRetry: () => void;
  onContinue: () => void;
  errorText: (code: string) => string;
};

const toolClass =
  "inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-accent underline decoration-transparent underline-offset-4 hover:text-accent-strong hover:decoration-current disabled:opacity-50 cursor-pointer";

function PageCard(props: CardProps) {
  const { page, index, disabled } = props;
  const t = useTranslations("upload");
  const url = useObjectUrl(page.blob);
  const label = t("pageLabel", { n: index + 1 });
  const verdict = page.result?.verdict;

  return (
    <li className="flex flex-col gap-4">
      <figure className="flex flex-col gap-3">
        <AlbumFrame className={index % 2 ? "rotate-[0.4deg]" : "rotate-[-0.4deg]"}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL
            <img src={url} alt={label} className="mx-auto max-h-80 w-auto object-contain" />
          )}
        </AlbumFrame>
        <figcaption className="text-center font-serif text-xl italic text-ink-muted">{label}</figcaption>
      </figure>

      <div role="group" aria-label={label} className="flex flex-wrap justify-center gap-x-1 border-y border-rule py-1">
        <button type="button" className={toolClass} onClick={props.onRotate} disabled={disabled}>
          <RotateIcon width={18} height={18} />
          {t("rotate")}
        </button>
        <button type="button" className={toolClass} onClick={props.onCrop} disabled={disabled}>
          <CropIcon width={18} height={18} />
          {t("crop")}
        </button>
        <button type="button" className={toolClass} onClick={props.onReplace} disabled={disabled}>
          <ReplaceIcon width={18} height={18} />
          {t("retake")}
        </button>
        {index > 0 && (
          <button type="button" className={toolClass} onClick={props.onMoveUp} disabled={disabled}>
            <UpIcon width={18} height={18} />
            {t("moveUp")}
          </button>
        )}
        <button type="button" className={toolClass} onClick={props.onRemove} disabled={disabled}>
          <RemoveIcon width={18} height={18} />
          {t("remove")}
        </button>
      </div>

      {verdict?.kind === "ok" && page.result && (
        <p className="flex items-start gap-2 text-ink">
          <CheckIcon className="mt-1 shrink-0 text-accent" />
          <span>
            {t("okFound", {
              people: page.result.extraction.people.length,
              links: page.result.extraction.relationships.length,
            })}{" "}
            {page.result.extraction.unclear_items.length > 0 &&
              t("okUnclear", { count: page.result.extraction.unclear_items.length })}
          </span>
        </p>
      )}

      {verdict?.kind === "rejected" && (
        <Notice tone="notice" role="alert">
          <p className="font-semibold">{t("rejectedTitle")}</p>
          {verdict.reason && <p className="mt-1">{verdict.reason}</p>}
          <p className="mt-2 text-sm">{t("rejectedHint")}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" variant="secondary" onClick={props.onReplaceFromGallery} disabled={disabled}>
              {t("chooseDifferent")}
            </Button>
            <Button type="button" variant="quiet" onClick={props.onRemove} disabled={disabled}>
              {t("remove")}
            </Button>
          </div>
        </Notice>
      )}

      {verdict?.kind === "borderline" &&
        (page.continuedAnyway ? (
          <p className="text-ink-muted">{t("continued")}</p>
        ) : (
          <Notice tone="notice" role="alert">
            <p className="font-semibold">{t("borderlineTitle")}</p>
            <ul className="mt-1 list-disc pl-5">
              {verdict.reasons.map((r) => (
                <li key={r}>{t(`borderline_${r}`)}</li>
              ))}
              {page.result!.extraction.unclear_items.slice(0, 3).map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={props.onReplace} disabled={disabled}>
                {t("retakePhoto")}
              </Button>
              <Button type="button" variant="quiet" onClick={props.onContinue} disabled={disabled}>
                {t("continueAnyway")}
              </Button>
            </div>
          </Notice>
        ))}

      {page.error && (
        <Notice tone="notice" role="alert">
          <p className="font-semibold">{t("failedTitle")}</p>
          <p className="mt-1">{props.errorText(page.error.code)}</p>
          {page.error.code !== "daily_limit" && (
            <div className="mt-3">
              <Button type="button" variant="secondary" onClick={props.onRetry} disabled={disabled}>
                {t("tryAgain")}
              </Button>
            </div>
          )}
        </Notice>
      )}
    </li>
  );
}
