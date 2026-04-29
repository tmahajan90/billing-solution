import { createContext, useContext, useState, useEffect, useRef } from "react";
import { syncService } from "../services/sync";
import { useAuth } from "./AuthContext";
import db from "../db";

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncVersion, setSyncVersion] = useState(0);
  const syncingRef = useRef(false);
  const { isLoggedIn } = useAuth();

  const doSync = async () => {
    if (syncingRef.current) return;
    if (!localStorage.getItem("auth_token")) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await syncService.fullSync();
      setLastSync(new Date());
      setSyncVersion((v) => v + 1);
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  const refreshData = async () => {
    if (syncingRef.current || !navigator.onLine) return;
    if (!localStorage.getItem("auth_token")) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await db.sync_meta.clear();
      await syncService.pullFromServer();
      await syncService.pushPendingOrders();
      setLastSync(new Date());
      setSyncVersion((v) => v + 1);
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  useEffect(() => {
    if (isLoggedIn && navigator.onLine) {
      doSync();
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (isLoggedIn) doSync();
    };
    const handleOffline = () => setIsOnline(false);

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine && isLoggedIn) {
        doSync();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isLoggedIn]);

  const triggerSync = async () => {
    await doSync();
  };

  return (
    <OfflineContext.Provider value={{ isOnline, syncing, lastSync, syncVersion, triggerSync, refreshData }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
