"use client";

import { useState } from "react";

import {
  hashtagCount,
  MAX_CAPTION,
  MAX_HASHTAGS,
  MAX_PHOTOS,
} from "@/lib/instagram-rules.ts";

/** The caption, with Instagram's two limits counted as you type, and a copy button. */
export function CaptionField({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [copied, setCopied] = useState(false);
  const length = [...value].length;
  const tags = hashtagCount(value);
  const over = length > MAX_CAPTION || tags > MAX_HASHTAGS;
  return (
    <div>
      <label className="label" htmlFor="ig-caption">
        Caption
      </label>
      <textarea
        id="ig-caption"
        name="caption"
        className="input h-36 w-full"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setCopied(false);
        }}
        data-testid="ig-caption"
      />
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <span
          className={over ? "text-red-300" : "text-muted"}
          data-testid="ig-caption-count"
        >
          {length.toLocaleString("en-US")} of {MAX_CAPTION.toLocaleString("en-US")}{" "}
          characters · {tags} of {MAX_HASHTAGS} hashtags
        </span>
        <button
          type="button"
          className="btn-ghost"
          data-testid="ig-copy-caption"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy the caption"}
        </button>
      </div>
    </div>
  );
}

export interface PickerPhoto {
  readonly id: string;
  readonly filename: string;
}

/** The game's photos, tick up to 10. The post follows the order they were taken. */
export function PhotoPicker({
  photos,
  chosen,
}: {
  photos: readonly PickerPhoto[];
  chosen: readonly string[];
}) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(chosen));
  const full = picked.size >= MAX_PHOTOS;
  return (
    <div>
      <p className="mb-2 text-sm" data-testid="ig-picked">
        <strong>{picked.size}</strong> of {MAX_PHOTOS} photos chosen
        {full ? " (that is the most one post can hold)" : ""}
      </p>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((p) => {
          const on = picked.has(p.id);
          return (
            <li key={p.id}>
              <label className="card block cursor-pointer overflow-hidden has-[:checked]:ring-2 has-[:checked]:ring-brand">
                <img
                  src={`/api/photos/${p.id}/thumb`}
                  alt={p.filename}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <span className="flex items-center gap-2 px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    name="photo"
                    value={p.id}
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setPicked(next);
                    }}
                    data-testid="ig-photo"
                  />
                  {p.filename}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
