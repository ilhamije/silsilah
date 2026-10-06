"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { unlinkAction } from "@/app/trees/[treeId]/merges/actions";
import { Button } from "@/components/ui";

export function UnlinkButton({ linkId }: { linkId: string }) {
  const t = useTranslations("merge");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await unlinkAction(linkId);
        setBusy(false);
        router.refresh();
      }}
    >
      {t("unlink")}
    </Button>
  );
}
