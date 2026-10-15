"use client";

import { useState, useTransition } from "react";

import { approveDemoSite, buildDemoSite, editDemoSite } from "@/actions/demo";
import type { PresenceResult } from "@/lib/presence";

import { button, C, input, label } from "./presence-style";

function Status({ r }: { r: PresenceResult | null }) {
  if (!r) return null;
  return (
    <div
      role="status"
      style={{
        margin: "10px 0",
        padding: "8px 12px",
        borderRadius: 8,
        border: `1px solid ${r.ok ? "#2ea043" : C.red}`,
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <strong>{r.headline}</strong> <span style={{ color: C.muted }}>{r.meaning}</span>
      {r.ok && r.href ? (
        <>
          {" "}
          <a href={r.href} style={{ color: C.link }}>
            Open the demo →
          </a>
        </>
      ) : null}
    </div>
  );
}

/** The Build / Rebuild button, used on the Lead Card and the demo page. */
export function BuildDemoButton({ id, hasDraft }: { id: string; hasDraft: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  return (
    <form
      action={(fd) =>
        start(async () => {
          fd.set("id", id);
          const r = await buildDemoSite(fd);
          setResult(r);
          // Go to the new demo. (On the Lead Card this button is replaced as soon
          // as a draft exists, so a message left here would never be seen.)
          if (r.ok && r.href && window.location.pathname !== r.href)
            window.location.assign(r.href);
        })
      }
    >
      <button type="submit" disabled={pending} style={button(true, pending)}>
        {pending ? "Building…" : hasDraft ? "Rebuild demo site" : "Build demo site"}
      </button>
      <Status r={result} />
    </form>
  );
}

export function DemoEditor({
  id,
  headline,
  subhead,
  about,
  offerings,
  showRating,
  canShowRating,
  showVideoBlock,
  approved,
}: {
  id: string;
  headline: string;
  subhead: string;
  about: string;
  offerings: string;
  showRating: boolean;
  canShowRating: boolean;
  showVideoBlock: boolean;
  approved: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PresenceResult | null>(null);
  const run = (action: (fd: FormData) => Promise<PresenceResult>) => (fd: FormData) =>
    start(async () => {
      fd.set("id", id);
      setResult(await action(fd));
    });

  return (
    <div>
      <Status r={result} />
      <form action={run(editDemoSite)}>
        <input type="hidden" name="options" value="1" />
        <label style={label} htmlFor="heroHeadline">
          Headline
        </label>
        <input
          id="heroHeadline"
          name="heroHeadline"
          style={{ ...input, marginBottom: 10 }}
          defaultValue={headline}
        />
        <label style={label} htmlFor="heroSubhead">
          Subheading
        </label>
        <textarea
          id="heroSubhead"
          name="heroSubhead"
          rows={2}
          style={{ ...input, marginBottom: 10 }}
          defaultValue={subhead}
        />
        <label style={label} htmlFor="aboutBody">
          About text — writing it here marks it as the owner&rsquo;s, not a sample
        </label>
        <textarea
          id="aboutBody"
          name="aboutBody"
          rows={4}
          style={{ ...input, marginBottom: 10 }}
          defaultValue={about}
        />
        <label style={label} htmlFor="offerings">
          Services / menu — one per line, &ldquo;Name: description&rdquo;. Editing them
          marks them as the owner&rsquo;s.
        </label>
        <textarea
          id="offerings"
          name="offerings"
          rows={5}
          style={{ ...input, marginBottom: 10, fontFamily: "ui-monospace, monospace" }}
          defaultValue={offerings}
        />
        <div
          style={{
            display: "flex",
            gap: 18,
            fontSize: 13,
            margin: "4px 0 12px",
            flexWrap: "wrap",
          }}
        >
          <label style={{ opacity: canShowRating ? 1 : 0.5 }}>
            <input
              type="checkbox"
              name="showRating"
              defaultChecked={showRating}
              disabled={!canShowRating}
            />{" "}
            Show the Google rating {canShowRating ? "" : "(none on file)"}
          </label>
          <label>
            <input
              type="checkbox"
              name="showVideoBlock"
              defaultChecked={showVideoBlock}
            />{" "}
            Show the promo-video placeholder
          </label>
        </div>
        <p
          style={{ margin: "0 0 10px", fontSize: 12, color: C.muted, lineHeight: 1.6 }}
        >
          Every edit is checked the same way Claude&rsquo;s copy is: no prices,
          guarantees, credentials, history, ratings, links or numbers that are not the
          business&rsquo;s own.
        </p>
        <button type="submit" disabled={pending} style={button(false, pending)}>
          Save changes
        </button>
      </form>
      <form action={run(approveDemoSite)} style={{ marginTop: 14 }}>
        <button
          type="submit"
          disabled={pending || approved}
          style={button(true, pending || approved)}
        >
          {approved ? "Approved" : "Approve as fit to show the owner"}
        </button>
        <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>
          Internal sign-off only. Nothing is published or sent.
        </span>
      </form>
    </div>
  );
}
