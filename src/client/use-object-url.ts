"use client";

import { useEffect, useState } from "react";

/** Object URL for a Blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // Syncing with an external resource (a browser object URL) is what effects
    // are for; the URL must be created and revoked alongside the blob.
    const next = blob ? URL.createObjectURL(blob) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setUrl(next);
    if (!next) return;
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
