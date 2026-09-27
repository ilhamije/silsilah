"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import ReactCrop, { type PercentCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useObjectUrl } from "@/client/use-object-url";
import { Button } from "@/components/ui";

type Props = {
  blob: Blob | null;
  onApply: (crop: { x: number; y: number; width: number; height: number }) => void;
  onClose: () => void;
};

const initialCrop: PercentCrop = { unit: "%", x: 5, y: 5, width: 90, height: 90 };

/** Free-form crop in a native modal <dialog> (focus trap and Escape for free). Touch-friendly handles. */
export function CropDialog({ blob, onApply, onClose }: Props) {
  const t = useTranslations("upload");
  const ref = useRef<HTMLDialogElement>(null);
  const url = useObjectUrl(blob);
  const [crop, setCrop] = useState<PercentCrop>(initialCrop);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (blob && !dialog.open) {
      setCrop(initialCrop);
      dialog.showModal();
    } else if (!blob && dialog.open) {
      dialog.close();
    }
  }, [blob]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="crop-title"
      className="m-auto w-[min(100vw-2rem,48rem)] max-h-[calc(100dvh-2rem)] border border-rule bg-paper p-0 text-ink backdrop:bg-ink/60"
    >
      <div className="flex flex-col gap-5 p-5 sm:p-8">
        <div className="flex flex-col gap-2">
          <h2 id="crop-title">{t("cropTitle")}</h2>
          <p className="measure text-ink-muted">{t("cropHelp")}</p>
        </div>
        {url && (
          <div className="silsilah-crop flex justify-center bg-mat">
            <ReactCrop crop={crop} onChange={(_, percent) => setCrop(percent)} keepSelection ruleOfThirds>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not an optimizable asset */}
              <img src={url} alt="" className="max-h-[60dvh] w-auto" />
            </ReactCrop>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              onApply({
                x: crop.x / 100,
                y: crop.y / 100,
                width: crop.width / 100,
                height: crop.height / 100,
              })
            }
          >
            {t("cropApply")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => ref.current?.close()}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
