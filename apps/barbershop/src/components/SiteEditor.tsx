"use client";

import { useState, useTransition } from "react";
import {
  DAYS,
  LINK_KINDS,
  money,
  toCents,
  type SiteContent,
  type ShopPermissions,
} from "@/lib/barberos";
import {
  publishPage,
  removeService,
  saveDay,
  saveDetails,
  saveLink,
  saveOneService,
  unpublishPage,
  type Result,
} from "@/app/shop/[tenant]/actions";
import { Card, button, input } from "./ui";

/**
 * The page editor.
 *
 * Every section saves on its own, because a barber edits this between customers
 * and a single giant Save that loses everything on one bad field is the wrong
 * shape for that. Each section reports what the DATABASE said, not a generic
 * success.
 *
 * `can.editPage` and `can.publish` come from the database's own answer about
 * this person. When either is false the controls are not rendered disabled --
 * they are replaced by a sentence saying who can do it. A greyed-out button
 * invites someone to keep clicking it.
 */

function Note({ r }: { r: Result | null }) {
  if (r === null) return null;
  return (
    <p
      style={{ margin: "10px 0 0", fontSize: 13, color: r.ok ? "#3fb950" : "#f85149" }}
    >
      {r.message}
    </p>
  );
}

export function SiteEditor({
  tenantId,
  site,
  can,
  publicUrl,
  missing,
}: {
  tenantId: string;
  site: SiteContent | null;
  can: ShopPermissions;
  publicUrl: string;
  missing: string[];
}) {
  if (!can.editPage) {
    return (
      <Card title="Your page">
        <p style={{ margin: 0, fontSize: 14, color: "#8b949e" }}>
          You can see this shop, but editing the page is not something your account is
          allowed to do. The shop&apos;s owner or manager can change that.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Details tenantId={tenantId} site={site} />
      {site !== null && (
        <>
          <Hours tenantId={tenantId} site={site} />
          <Services tenantId={tenantId} site={site} />
          <Links tenantId={tenantId} site={site} />
          <Publish
            tenantId={tenantId}
            site={site}
            can={can}
            publicUrl={publicUrl}
            missing={missing}
          />
        </>
      )}
    </>
  );
}

function Details({ tenantId, site }: { tenantId: string; site: SiteContent | null }) {
  const [f, setF] = useState({
    slug: site?.slug ?? "",
    headline: site?.headline ?? "",
    about: site?.about ?? "",
    phone: site?.phone ?? "",
    address: site?.addressLine1 ?? "",
    locality: site?.locality ?? "",
    region: site?.region ?? "",
    postal: site?.postalCode ?? "",
    bookingUrl: site?.bookingUrl ?? "",
    mapUrl: site?.mapUrl ?? "",
  });
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => {
    setF({ ...f, [k]: e.target.value });
    setR(null);
  };
  const blank = (s: string) => (s.trim() === "" ? null : s.trim());

  return (
    <Card
      title={site === null ? "Set up your page" : "Your shop"}
      sub={
        site === null
          ? "This is what customers will see. Nothing goes on the internet until you publish it."
          : undefined
      }
    >
      <Field
        label="Web address"
        hint="The end of your page's link. Letters and dashes."
      >
        <input value={f.slug} onChange={set("slug")} style={input} />
      </Field>
      <Field label="Headline" hint="One line. What the shop is known for.">
        <input value={f.headline} onChange={set("headline")} style={input} />
      </Field>
      <Field label="About">
        <textarea
          value={f.about}
          rows={3}
          onChange={set("about")}
          style={{ ...input, resize: "vertical" }}
        />
      </Field>
      <Two>
        <Field label="Phone">
          <input value={f.phone} onChange={set("phone")} style={input} />
        </Field>
        <Field label="Booking link" hint="If you already book somewhere else.">
          <input value={f.bookingUrl} onChange={set("bookingUrl")} style={input} />
        </Field>
      </Two>
      <Field label="Street address">
        <input value={f.address} onChange={set("address")} style={input} />
      </Field>
      <Two>
        <Field label="Town">
          <input value={f.locality} onChange={set("locality")} style={input} />
        </Field>
        <Field label="State">
          <input value={f.region} onChange={set("region")} style={input} />
        </Field>
      </Two>
      <Two>
        <Field label="ZIP">
          <input value={f.postal} onChange={set("postal")} style={input} />
        </Field>
        <Field label="Map link">
          <input value={f.mapUrl} onChange={set("mapUrl")} style={input} />
        </Field>
      </Two>
      <button
        disabled={busy}
        style={button(!busy)}
        onClick={() =>
          start(async () =>
            setR(
              await saveDetails(tenantId, {
                slug: f.slug.trim(),
                headline: blank(f.headline),
                about: blank(f.about),
                phone: blank(f.phone),
                address: blank(f.address),
                locality: blank(f.locality),
                region: blank(f.region),
                postal: blank(f.postal),
                bookingUrl: blank(f.bookingUrl),
                mapUrl: blank(f.mapUrl),
              }),
            ),
          )
        }
      >
        {busy ? "Saving…" : site === null ? "Create my page" : "Save"}
      </button>
      <Note r={r} />
    </Card>
  );
}

function Hours({ tenantId, site }: { tenantId: string; site: SiteContent }) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const byDay = new Map(site.hours.map((h) => [h.day, h]));
  const [draft, setDraft] = useState(() =>
    DAYS.map((_, day) => {
      const h = byDay.get(day);
      return {
        closed: h === undefined ? true : h.closed,
        opens: h?.opens?.slice(0, 5) ?? "",
        closes: h?.closes?.slice(0, 5) ?? "",
        known: h !== undefined,
      };
    }),
  );

  return (
    <Card
      title="Opening hours"
      sub="The most asked question on a barbershop page. A day you have not set is not shown at all."
    >
      {DAYS.map((name, day) => {
        const d = draft[day]!;
        return (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 0",
              borderBottom: "1px solid #21262d",
            }}
          >
            <span style={{ width: 92, fontSize: 14 }}>{name}</span>
            <label style={{ fontSize: 13, color: "#8b949e" }}>
              <input
                type="checkbox"
                checked={d.closed}
                onChange={(e) => {
                  const next = [...draft];
                  next[day] = { ...d, closed: e.target.checked };
                  setDraft(next);
                  setR(null);
                }}
              />{" "}
              Closed
            </label>
            {!d.closed && (
              <>
                <input
                  type="time"
                  value={d.opens}
                  onChange={(e) => {
                    const next = [...draft];
                    next[day] = { ...d, opens: e.target.value };
                    setDraft(next);
                    setR(null);
                  }}
                  style={{ ...input, width: 118 }}
                />
                <input
                  type="time"
                  value={d.closes}
                  onChange={(e) => {
                    const next = [...draft];
                    next[day] = { ...d, closes: e.target.value };
                    setDraft(next);
                    setR(null);
                  }}
                  style={{ ...input, width: 118 }}
                />
              </>
            )}
            <button
              disabled={busy}
              style={{
                ...button(!busy, "#21262d"),
                marginLeft: "auto",
                padding: "6px 12px",
                fontSize: 13,
              }}
              onClick={() =>
                start(async () =>
                  setR(await saveDay(tenantId, day, d.closed, d.opens, d.closes)),
                )
              }
            >
              {d.known ? "Update" : "Set"}
            </button>
          </div>
        );
      })}
      <Note r={r} />
    </Card>
  );
}

function Services({ tenantId, site }: { tenantId: string; site: SiteContent }) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [mins, setMins] = useState("");

  return (
    <Card
      title="Services and prices"
      sub="A price you leave blank is simply not shown."
    >
      {site.services.length === 0 ? (
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#8b949e" }}>
          Nothing listed yet.
        </p>
      ) : (
        site.services.map((s) => (
          <div
            key={s.name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid #21262d",
            }}
          >
            <span style={{ flex: 1, fontSize: 14 }}>{s.name}</span>
            <span style={{ fontSize: 14, color: "#8b949e" }}>
              {money(s.priceCents) ?? "—"}
            </span>
            <span
              style={{ fontSize: 13, color: "#6e7681", width: 64, textAlign: "right" }}
            >
              {s.durationMinutes === null ? "" : `${s.durationMinutes} min`}
            </span>
            <button
              disabled={busy}
              style={{ ...button(!busy, "#21262d"), padding: "6px 12px", fontSize: 13 }}
              onClick={() =>
                start(async () => setR(await removeService(tenantId, s.name)))
              }
            >
              Remove
            </button>
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          placeholder="Skin fade"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setR(null);
          }}
          style={{ ...input, flex: 1 }}
        />
        <input
          placeholder="$35"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setR(null);
          }}
          style={{ ...input, width: 92 }}
        />
        <input
          placeholder="45 min"
          value={mins}
          onChange={(e) => {
            setMins(e.target.value);
            setR(null);
          }}
          style={{ ...input, width: 92 }}
        />
        <button
          disabled={busy}
          style={button(!busy)}
          onClick={() =>
            start(async () => {
              // A price that cannot be read is sent as NO price. Storing 0
              // because somebody typed "ask" would put "$0.00" on a public page.
              const cents = price.trim() === "" ? null : toCents(price);
              if (price.trim() !== "" && cents === null) {
                setR({
                  ok: false,
                  message: `"${price.trim()}" is not a price. Use something like 35 or 35.50, or leave it blank.`,
                });
                return;
              }
              const r = await saveOneService(
                tenantId,
                name,
                cents,
                /^\d+$/.test(mins.trim()) ? Number(mins.trim()) : null,
              );
              setR(r);
              if (r.ok) {
                setName("");
                setPrice("");
                setMins("");
              }
            })
          }
        >
          Add
        </button>
      </div>
      <Note r={r} />
    </Card>
  );
}

function Links({ tenantId, site }: { tenantId: string; site: SiteContent }) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();
  const current = new Map(site.links.map((l) => [l.kind, l.url]));
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(LINK_KINDS.map((k) => [k, current.get(k) ?? ""])),
  );

  return (
    <Card title="Where else you are" sub="Clear a box to take that link off your page.">
      {LINK_KINDS.map((k) => (
        <div
          key={k}
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}
        >
          <span style={{ width: 128, fontSize: 13, color: "#8b949e" }}>
            {k.replace("_", " ")}
          </span>
          <input
            value={draft[k] ?? ""}
            onChange={(e) => {
              setDraft({ ...draft, [k]: e.target.value });
              setR(null);
            }}
            style={{ ...input, flex: 1 }}
          />
          <button
            disabled={busy}
            style={{ ...button(!busy, "#21262d"), padding: "7px 13px", fontSize: 13 }}
            onClick={() =>
              start(async () => setR(await saveLink(tenantId, k, draft[k] ?? "")))
            }
          >
            Save
          </button>
        </div>
      ))}
      <Note r={r} />
    </Card>
  );
}

function Publish({
  tenantId,
  site,
  can,
  publicUrl,
  missing,
}: {
  tenantId: string;
  site: SiteContent;
  can: ShopPermissions;
  publicUrl: string;
  missing: string[];
}) {
  const [r, setR] = useState<Result | null>(null);
  const [busy, start] = useTransition();

  if (!can.publish) {
    return (
      <Card title="Putting your page on the internet">
        <p style={{ margin: 0, fontSize: 14, color: "#8b949e" }}>
          You can edit this page, but publishing it is the owner&apos;s decision. Ask
          them to put it live when you are happy with it.
        </p>
      </Card>
    );
  }

  const live = site.status === "published";
  return (
    <Card title={live ? "Your page is live" : "Put your page on the internet"}>
      {live ? (
        <p style={{ margin: "0 0 14px", fontSize: 14 }}>
          Customers can see it at{" "}
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#58a6ff" }}
          >
            {publicUrl}
          </a>
        </p>
      ) : missing.length > 0 ? (
        // Said BEFORE the button is pressed. The database will refuse anyway
        // and its message is the authority, but a barber should not have to
        // press a button to find out what is missing.
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#d29922" }}>
          Before this can go live it still needs {missing.join(", ")}.
        </p>
      ) : (
        <p style={{ margin: "0 0 14px", fontSize: 14, color: "#8b949e" }}>
          It will be live at {publicUrl}
        </p>
      )}
      <button
        disabled={busy}
        style={button(!busy, live ? "#21262d" : "#238636")}
        onClick={() =>
          start(async () =>
            setR(live ? await unpublishPage(tenantId) : await publishPage(tenantId)),
          )
        }
      >
        {busy ? "Working…" : live ? "Take it down" : "Publish"}
      </button>
      <Note r={r} />
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, marginBottom: 2 }}>{label}</div>
      {hint !== undefined && (
        <div style={{ fontSize: 12, color: "#6e7681", marginBottom: 6 }}>{hint}</div>
      )}
      {children}
    </div>
  );
}

function Two({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {children}
    </div>
  );
}
