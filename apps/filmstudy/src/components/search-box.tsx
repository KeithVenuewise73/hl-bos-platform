"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBox({
  initial,
  samples,
}: {
  initial: string;
  samples: readonly string[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);

  function go(query: string) {
    router.push(
      query.trim().length === 0 ? "/search" : `/search?q=${encodeURIComponent(query)}`,
    );
  }

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          go(value);
        }}
      >
        <div className="row">
          <input
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="third and long, explosive runs, Cover 3, #24&hellip;"
            style={{ flex: 1 }}
            aria-label="Search plays"
          />
          <button className="btn primary" type="submit">
            Search
          </button>
        </div>
      </form>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="tiny faint">Try</span>
        {samples.map((sample) => (
          <button
            key={sample}
            type="button"
            className="badge"
            style={{ cursor: "pointer", background: "transparent" }}
            onClick={() => {
              setValue(sample);
              go(sample);
            }}
          >
            {sample}
          </button>
        ))}
      </div>
    </>
  );
}
