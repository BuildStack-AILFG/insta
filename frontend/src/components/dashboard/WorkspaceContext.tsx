"use client";

import { createContext, useContext } from "react";
import type { MeResponse } from "@/lib/api";

export type WorkspaceContextValue = MeResponse & {
  /** Re-fetch /auth/me so the top bar and sidebar pick up changes (e.g. a renamed workspace). */
  refresh: () => Promise<void>;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** Only ever rendered under AuthGuard, which guarantees this is populated before children mount. */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within AuthGuard's WorkspaceContext.Provider");
  }
  return ctx;
}
