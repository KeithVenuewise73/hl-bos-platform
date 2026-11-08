"use client";
export function PrintButton() {
  return (
    <button
      className="rounded border border-line px-3 py-1"
      onClick={() => window.print()}
    >
      Print / PDF
    </button>
  );
}
