"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function SharedRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (
        document.visibilityState === "visible" &&
        !document.activeElement?.matches(
          "input:not([type=hidden]), textarea, select",
        )
      )
        router.refresh();
    };
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
