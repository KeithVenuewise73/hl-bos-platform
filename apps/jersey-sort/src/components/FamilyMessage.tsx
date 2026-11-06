"use client";

import { useState } from "react";

/**
 * A message for the team's families, ready to text or email: the gallery's
 * website link and the team password.
 *
 * JerseySort never keeps the team password (only a scrambled check of it),
 * so it cannot fill it in. It is typed here, used only in this message, and
 * not saved or sent anywhere.
 */
export function FamilyMessage({ title, link }: { title: string; link: string }) {
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const message = [
    `Hi families! The game photos for ${title} are on 5-Star Sports Media:`,
    link,
    `Team password: ${password.trim() === "" ? "(ask the coach)" : password.trim()}`,
    "You can view them and download any photo, or a whole game at once. Please keep the link and password within the team.",
  ].join("\n");
  return (
    <div
      className="mt-4 space-y-2 border-t border-line pt-3"
      data-testid="family-message"
    >
      <h3 className="font-semibold">Message for the families</h3>
      <label className="label" htmlFor="fm-pass">
        Team password to put in the message (not saved)
      </label>
      <input
        className="input max-w-64"
        id="fm-pass"
        autoComplete="off"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setCopied(false);
        }}
        data-testid="family-password"
      />
      <textarea
        className="input h-32 w-full font-mono text-xs"
        readOnly
        value={message}
        aria-label="Message for the families"
        data-testid="family-text"
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className="btn-primary"
        data-testid="family-copy"
        onClick={() => {
          void navigator.clipboard?.writeText(message).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied: paste it into a text or email" : "Copy the message"}
      </button>
    </div>
  );
}
