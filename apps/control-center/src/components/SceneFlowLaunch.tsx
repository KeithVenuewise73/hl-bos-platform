"use client";

import { useState, useTransition } from "react";

import {
  launchSceneFlow,
  readSceneFlowStatus,
  rotateSceneFlowCode,
} from "@/actions/sceneflow";
import type { SceneFlowStatus } from "@/lib/sceneflow-launch";

/**
 * Start SceneFlow, and show the address and code a phone needs.
 *
 * Deliberately not a link straight to the app: until it is running, a link
 * leads to a connection error, and a control that does not do its job is worse
 * than no control. The link appears only once the app has answered.
 */
export function SceneFlowLaunch({ initial }: { initial: SceneFlowStatus }) {
  const [status, setStatus] = useState(initial);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function act(run: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      setNote("");
      const result = await run();
      setNote(result.message);
      setStatus(await readSceneFlowStatus());
    });
  }

  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 14 }}>
        <span
          aria-hidden
          style={{
            display: "inline-block",
            width: 9,
            height: 9,
            borderRadius: 9,
            background: status.running ? "#3fb950" : "#6e7681",
            marginRight: 8,
          }}
        />
        {status.detail}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => act(launchSceneFlow)}
          disabled={pending || status.running}
          style={button(pending || status.running, "#1f6feb")}
        >
          {pending
            ? "Working…"
            : status.running
              ? "Already running"
              : "Start SceneFlow"}
        </button>
        <button
          type="button"
          onClick={() => act(rotateSceneFlowCode)}
          disabled={pending}
          style={button(pending, "#30363d")}
        >
          New code
        </button>
      </div>

      {status.running && status.code !== "" ? (
        <div
          style={{
            background: "#0d1117",
            border: "1px solid #262c36",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 12,
          }}
        >
          {status.phoneUrls.length > 0 ? (
            <>
              <p style={{ margin: "0 0 4px", color: "#8b949e", fontSize: 12.5 }}>
                On your phone, on the same Wi-Fi, open:
              </p>
              {status.phoneUrls.map((url, index) => (
                <p key={url} style={{ margin: "0 0 4px", fontSize: 16 }}>
                  <code>{url}</code>
                  {index > 0 ? (
                    <span style={{ color: "#6e7681", fontSize: 12 }}>
                      {" "}
                      — try this one if the first does not load
                    </span>
                  ) : null}
                </p>
              ))}
            </>
          ) : (
            <p style={{ margin: "0 0 4px", fontSize: 16 }}>
              <code>http://localhost:4100</code>{" "}
              <span style={{ color: "#6e7681", fontSize: 12 }}>
                — this PC only, until it has a home-network address
              </span>
            </p>
          )}
          {/* Always shown once a code is set. A code that is required and not
              displayed anywhere locks the operator out of his own app. */}
          <p style={{ margin: "12px 0 0", color: "#8b949e", fontSize: 12.5 }}>
            Then type this code:
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 26, letterSpacing: 6 }}>
            <code>{status.code}</code>
          </p>
        </div>
      ) : null}

      {note === "" ? null : (
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#c9d1d9" }}>{note}</p>
      )}

      <p style={{ margin: 0, color: "#8b949e", fontSize: 12.5, lineHeight: 1.6 }}>
        SceneFlow listens on your home network so your phone can reach it, which means
        everything else on that Wi-Fi can reach the address too. The code is what stops
        them: without it they get one box and nothing else. Press{" "}
        <strong>New code</strong> to lock every device out again — including this one.
        That does not close SceneFlow; it stays on the network until the PC is
        restarted.
      </p>
    </div>
  );
}

function button(disabled: boolean, background: string) {
  return {
    padding: "9px 16px",
    fontSize: 14,
    background: disabled ? "#1b2027" : background,
    border: "1px solid #30363d",
    borderRadius: 8,
    color: disabled ? "#8b949e" : "#e8eaed",
    cursor: disabled ? "default" : "pointer",
  } as const;
}
