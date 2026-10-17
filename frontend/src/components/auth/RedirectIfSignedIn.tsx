"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRefreshToken, safeNextPath } from "@/lib/api";

/** A returning user with a saved session goes straight to the dashboard; AuthGuard sends them back to /login if the session has actually expired. */
export default function RedirectIfSignedIn() {
  const router = useRouter();
  useEffect(() => {
    if (getRefreshToken()) router.replace(safeNextPath() ?? "/dashboard");
  }, [router]);
  return null;
}
