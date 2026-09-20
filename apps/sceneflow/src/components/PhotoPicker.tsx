"use client";

import { useState, useTransition } from "react";

import { uploadPhoto } from "@/actions/sceneflow";
import type { StoredPhoto } from "@/lib/photos";

/**
 * Choosing the photographs a story is built from.
 *
 * The FIRST one is the scene being continued; the rest are extra views of the
 * same people, which is what section 34 of the brief calls a multi-reference
 * strategy — more angles of a face means a better chance of that face surviving
 * six scenes. The order is therefore meaningful and is shown, not just implied.
 */

export const MAX_PHOTOS = 5;

export function PhotoPicker({
  photos,
  onChange,
}: {
  photos: readonly StoredPhoto[];
  onChange: (next: readonly StoredPhoto[]) => void;
}) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length < files.length) {
      setError(`Only ${MAX_PHOTOS} photos can be used at once.`);
    }
    start(async () => {
      const added: StoredPhoto[] = [];
      const problems: string[] = [];
      for (const file of chosen) {
        const res = await uploadPhoto(await file.arrayBuffer());
        if (res.ok) added.push(res.photo);
        else problems.push(`${file.name}: ${res.message}`);
      }
      if (added.length > 0) onChange([...photos, ...added]);
      if (problems.length > 0) setError(problems.join(" "));
    });
  }

  function remove(id: string) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div>
      <label
        style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 5 }}
        htmlFor="photo"
      >
        The photographs {photos.length > 0 && `(${photos.length} of ${MAX_PHOTOS})`}
      </label>
      <input
        id="photo"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
        disabled={pending || photos.length >= MAX_PHOTOS}
        onChange={(e) => add(e.target.files)}
        style={{
          background: "#0d1117",
          border: "1px solid #262c36",
          borderRadius: 8,
          color: "#c9d1d9",
          padding: "6px 8px",
          fontSize: 13,
          width: "100%",
        }}
      />

      {photos.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          {photos.map((photo, index) => (
            <figure key={photo.id} style={{ margin: 0, width: 96 }}>
              {/* A plain img, not next/image: served from a private API route on
                  this machine, not from a public path. */}
              <img
                src={`/api/photo/${photo.id}?ext=${photo.relativePath.split(".").pop() ?? ""}`}
                alt={
                  index === 0
                    ? "The scene being continued"
                    : `Another view of the same people, ${index + 1}`
                }
                style={{
                  width: 96,
                  height: 96,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: index === 0 ? "2px solid #2ea043" : "1px solid #262c36",
                  display: "block",
                }}
              />
              <figcaption
                style={{
                  fontSize: 11,
                  color: "#8b949e",
                  marginTop: 4,
                  lineHeight: 1.4,
                }}
              >
                {index === 0 ? "The scene" : "Another view"}
                <br />
                <button
                  type="button"
                  onClick={() => remove(photo.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#f85149",
                    padding: 0,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {error !== "" && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#f85149" }}>{error}</p>
      )}
      {photos.length === 0 && error === "" && (
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6e7681" }}>
          The first photo is the scene being continued. Any others are extra views of
          the same people, which helps their faces survive across scenes. Stored on this
          machine only — nothing is uploaded anywhere.
        </p>
      )}
    </div>
  );
}
