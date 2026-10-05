"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts for the review queue:
 *   Enter  done (accept what is shown, next photo)
 *   N      no jersey visible
 *   U      unusable
 *   S      skip
 *   0–9    start typing a number to add
 * Ignored while typing in a field, so a number can be typed normally.
 */
export function ReviewKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      )
        return;
      const click = (op: string) => {
        const button = document.querySelector<HTMLButtonElement>(
          `[data-review-op="${op}"]`,
        );
        if (button) {
          e.preventDefault();
          button.click();
        }
      };
      if (e.key === "Enter") click("reviewed");
      else if (e.key === "n" || e.key === "N") click("no_jersey");
      else if (e.key === "u" || e.key === "U") click("unusable");
      else if (e.key === "s" || e.key === "S") click("skip");
      else if (/^[0-9]$/.test(e.key)) {
        const input = document.getElementById("add-number") as HTMLInputElement | null;
        if (input) {
          e.preventDefault();
          input.focus();
          input.value = e.key;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
