"use client";

import { useEffect } from "react";
import { getCore, pendingCount } from "@/lib/store";
import { flushOutbox } from "@/lib/sync";
import { useAuth } from "@/lib/auth";
import { useOnline, useStore } from "@/lib/hooks";

/**
 * What the app actually knows about syncing, said out loud.
 *
 * This component never claims a state it has not verified. "Saved on this
 * device" is always true and always shown; anything about the server is shown
 * only when there is a server, an account, and something to report.
 */
export function SyncStatus() {
  const { state } = useAuth();
  const online = useOnline();
  const pending = useStore(pendingCount);
  const error = useStore(() => getCore().lastSyncError);

  // Drain the queue when connectivity returns. The interval is a safety net
  // for the case where the `online` event never fires -- a captive portal, a
  // flaky tower, a web view that reports online while nothing resolves.
  useEffect(() => {
    if (state.status !== "signed-in") return;
    void flushOutbox();
    const id = setInterval(() => void flushOutbox(), 30_000);
    return () => clearInterval(id);
  }, [state.status, online, pending]);

  if (state.status === "unavailable") {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        Saved on this device. This build has no account service, so nothing is uploaded
        anywhere.
      </div>
    );
  }

  if (state.status === "signed-out") {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        Saved on this device. Sign in to back your games up.
      </div>
    );
  }

  if (!online) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        Offline. Everything is saved on this device
        {pending > 0
          ? `; ${pending} change${pending === 1 ? "" : "s"} will upload when you are back online.`
          : "."}
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        Saved on this device. Last upload failed: {error}
      </div>
    );
  }

  if (pending > 0) {
    return (
      <div className="muted" style={{ marginTop: 4 }}>
        Saved on this device. Uploading {pending} change{pending === 1 ? "" : "s"}…
      </div>
    );
  }

  return (
    <div className="muted" style={{ marginTop: 4 }}>
      Saved on this device and backed up.
    </div>
  );
}
