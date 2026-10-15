"use client";

import { useState, useTransition } from "react";

import {
  launchSceneFlow,
  readSceneFlowStatus,
  rotateSceneFlowCode,
  sceneFlowDiagnostics,
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
  const [detail, setDetail] = useState("");
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  /**
   * Run one of the buttons, and say something whatever happens.
   *
   * The try/catch is the point. Without it, anything thrown on the server --
   * including the server action failing to reach the server at all -- rejected
   * quietly, the button went back to idle, and the operator saw NOTHING. That
   * is what he reported: "I pressed Start SceneFlow and nothing happened." A
   * button that fails in silence is worse than one that is missing, because it
   * looks like it worked.
   */
  function act(run: () => Promise<{ ok: boolean; message: string; detail?: string }>) {
    start(async () => {
      setNote("");
      setDetail("");
      try {
        const result = await run();
        setNote(result.message);
        setDetail(result.detail ?? "");
      } catch (error) {
        setNote(
          `Something went wrong before SceneFlow could start, and it was not caught where it happened. Send Claude this: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      try {
        setStatus(await readSceneFlowStatus());
      } catch {
        // Reading the status back is a nicety; failing to do so must not erase
        // the message above, which is the part that explains anything.
      }
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
        <button
          type="button"
          onClick={() => {
            setCopied(false);
            start(async () => {
              try {
                const text = await sceneFlowDiagnostics();
                setReport(text);
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                } catch {
                  // Clipboard permission can be refused. The text is on screen
                  // either way, which is the part that matters.
                }
              } catch (error) {
                setReport(
                  `The report could not be gathered: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                );
              }
            });
          }}
          disabled={pending}
          style={button(pending, "#30363d")}
        >
          Report for Claude
        </button>
      </div>

      {report === "" ? null : (
        // Built because four rounds were spent asking him to read things off a
        // screen and relay them. It contains no secrets -- the access code is
        // reported as set or not set, never as its value.
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: "0 0 6px", color: "#8b949e", fontSize: 12.5 }}>
            {copied
              ? "Copied. Paste this into the chat with Claude."
              : "Select this and copy it into the chat with Claude."}
          </p>
          <textarea
            readOnly
            value={report}
            onFocus={(e) => e.currentTarget.select()}
            rows={16}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "#0d1117",
              border: "1px solid #262c36",
              borderRadius: 8,
              color: "#8b949e",
              fontSize: 11.5,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              padding: "10px 12px",
            }}
          />
        </div>
      )}

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

      {status.running ? (
        <div
          style={{
            background: "#0d1117",
            border: "1px solid #262c36",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 13 }}>Away from home</strong>
          {status.awayUrls.length > 0 ? (
            <>
              <p
                style={{
                  margin: "6px 0 4px",
                  color: "#8b949e",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                Your private network is up. This address works from anywhere — hotel
                Wi-Fi, a coffee shop, cellular — on any device signed into your
                Tailscale account. Same code.
              </p>
              {status.awayUrls.map((url) => (
                <p key={url} style={{ margin: "0 0 4px", fontSize: 16 }}>
                  <code>{url}</code>
                </p>
              ))}
            </>
          ) : (
            <>
              <p
                style={{
                  margin: "6px 0 0",
                  color: "#8b949e",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                Not set up yet. The address above only works inside the house. To use
                SceneFlow anywhere, install{" "}
                <a
                  href="https://tailscale.com/download"
                  style={{ color: "#58a6ff" }}
                  target="_blank"
                  rel="noreferrer"
                >
                  Tailscale
                </a>{" "}
                on this PC and on your phone, and sign into the same account on both. It
                is free for personal use, and it is two ordinary app installs — no
                settings to change on your router.
              </p>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#6e7681",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                }}
              >
                This puts your phone and this PC on a private network of their own.
                SceneFlow gets no public web address and nothing on the internet can
                reach it — which is why it is this rather than a public link. Creating
                the account is yours to decide; once both are signed in, the address
                appears here by itself.
              </p>
            </>
          )}
        </div>
      ) : null}

      {note === "" ? null : (
        <div style={{ margin: "0 0 12px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#c9d1d9", lineHeight: 1.6 }}>
            {note}
          </p>
          {detail === "" ? null : (
            // Collapsed, and never the headline. The raw output is for whoever
            // debugs it; it is not an answer to somebody who pressed a button.
            <details style={{ marginTop: 8 }}>
              <summary style={{ color: "#6e7681", fontSize: 12, cursor: "pointer" }}>
                Technical detail, for Claude
              </summary>
              <pre
                style={{
                  margin: "8px 0 0",
                  padding: "10px 12px",
                  background: "#0d1117",
                  border: "1px solid #262c36",
                  borderRadius: 8,
                  color: "#8b949e",
                  fontSize: 11.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {detail}
              </pre>
            </details>
          )}
        </div>
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
