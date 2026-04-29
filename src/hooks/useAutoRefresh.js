import { useEffect, useRef } from "react";
import { useOffline } from "../context/OfflineContext";

export default function useAutoRefresh(callback, intervalMs = 15000) {
  const { isOnline } = useOffline();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!isOnline) return;

    const tick = () => callbackRef.current();

    const id = setInterval(tick, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isOnline, intervalMs]);
}
