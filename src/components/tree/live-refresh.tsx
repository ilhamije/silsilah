"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Keeps the tree fresh while several relatives edit it: reloads the data when
 * the page comes back into view, and says so when someone else changed it
 * ("Updated by Rina a moment ago").
 */
export function LiveRefresh({ updatedAt, otherEditor }: { updatedAt: string; otherEditor: string | null }) {
  const t = useTranslations("tree");
  const router = useRouter();
  const seen = useRef(updatedAt);
  const lastRefresh = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefresh.current < 5000) return; // focus and visibilitychange often fire together
      lastRefresh.current = now;
      router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  // New data arrived: tell the user if the change came from someone else.
  useEffect(() => {
    if (updatedAt > seen.current && otherEditor) {
      setNotice(t("updatedMoment", { name: otherEditor }));
      const timer = setTimeout(() => setNotice(null), 8000);
      seen.current = updatedAt;
      return () => clearTimeout(timer);
    }
    seen.current = updatedAt;
  }, [updatedAt, otherEditor, t]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      {notice && (
        <p className="pointer-events-auto rounded-full border-3 border-ink bg-yellow px-5 py-3 font-semibold text-on-brand shadow-neo-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
