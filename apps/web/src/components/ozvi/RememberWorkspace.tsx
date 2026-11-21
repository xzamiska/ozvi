"use client";

import { useEffect } from "react";
import { LAST_WORKSPACE_COOKIE } from "@/lib/last-workspace";

/** Remembers the workspace open in the console, so /app (logo, "Konzola", back from a board) returns to it. */
export function RememberWorkspace({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `${LAST_WORKSPACE_COOKIE}=${id}; path=/app; max-age=${365 * 86_400}; samesite=lax`;
  }, [id]);
  return null;
}
