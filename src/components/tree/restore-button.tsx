"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { restorePersonAction } from "@/app/trees/[treeId]/actions";
import { Button } from "@/components/ui";
import { errorMessage } from "./types";

/** Puts a person (and the connections hidden with them) back in the tree. */
export function RestoreButton({ treeId, personId, name }: { treeId: string; personId: string; name: string }) {
  const t = useTranslations("deleted");
  const tt = useTranslations("tree");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        aria-label={t("restoreLabel", { name })}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await restorePersonAction(treeId, personId);
          setBusy(false);
          if (!res.ok) return setError(errorMessage(tt, res.error));
          router.refresh();
        }}
      >
        {t("restore")}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
