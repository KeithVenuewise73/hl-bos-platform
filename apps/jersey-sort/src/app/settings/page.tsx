import { addMemberAction } from "@/actions/auth.ts";
import { reanalyzeAction, retryFailedAction } from "@/actions/events.ts";
import { saveProviderAction, saveThresholdsAction } from "@/actions/settings.ts";
import { Notice, param, type SearchParams } from "@/components/Notice.tsx";
import { config } from "@/lib/config.ts";
import { db } from "@/lib/db.ts";
import { providerStatus } from "@/lib/providers.ts";
import { members, progress } from "@/lib/repo/dashboard.ts";
import { getSettings } from "@/lib/repo/settings.ts";
import { requireUser } from "@/lib/session.ts";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireUser();
  const d = db();
  const org = user.organizationId;
  const sp = await searchParams;
  const s = getSettings(d, org);
  const current = providerStatus(s.provider);
  const options = (["claude", "local-ocr", "none"] as const).map((c) =>
    providerStatus(c),
  );
  const people = members(d, org);
  const p = progress(d, org, null);
  const owner = user.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="display text-2xl">Settings</h1>
      <Notice error={param(sp, "error")} notice={param(sp, "notice")} />

      <section className="card p-5">
        <h2 className="display text-lg">Confidence thresholds</h2>
        <p className="mt-1 text-sm text-muted">
          At or above <b>automatic</b>: filed with no review. Between the two: filed and
          marked <b>Needs review</b>. Below <b>review</b>: not filed; the photo is
          Unidentified until someone looks. Changing these re-sorts every photo
          immediately; numbers a person confirmed stay confirmed.
        </p>
        <form
          action={saveThresholdsAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="label" htmlFor="high">
              Automatic (%)
            </label>
            <input
              className="input w-24"
              id="high"
              name="high"
              type="number"
              min={1}
              max={100}
              step={1}
              defaultValue={Math.round(s.thresholds.high * 100)}
            />
          </div>
          <div>
            <label className="label" htmlFor="medium">
              Review (%)
            </label>
            <input
              className="input w-24"
              id="medium"
              name="medium"
              type="number"
              min={1}
              max={99}
              step={1}
              defaultValue={Math.round(s.thresholds.medium * 100)}
            />
          </div>
          <button className="btn-primary" type="submit" disabled={!owner}>
            Save thresholds
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="display text-lg">Photo analysis</h2>
        <p className="mt-1 text-sm">
          Now using: <b>{current.label}</b>{" "}
          {current.ready ? (
            <span className="text-high">· ready</span>
          ) : (
            <span className="text-low">· not ready</span>
          )}
        </p>
        <form action={saveProviderAction} className="mt-3 space-y-2">
          {options.map((o) => (
            <label
              key={o.choice}
              className="flex gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand"
            >
              <input
                type="radio"
                name="provider"
                value={o.choice}
                defaultChecked={o.choice === current.choice}
              />
              <span>
                <span className="block font-semibold">
                  {o.label}{" "}
                  {o.ready ? null : <span className="text-low">(not available)</span>}
                </span>
                <span className="text-muted">{o.detail}</span>
              </span>
            </label>
          ))}
          <button className="btn-primary" type="submit" disabled={!owner}>
            Save
          </button>
        </form>
        {!owner ? (
          <p className="mt-2 text-xs text-muted">
            Only the organization&apos;s owner can change thresholds or the analysis
            provider.
          </p>
        ) : null}
        {!current.claudeKeyPresent ? (
          <p className="mt-3 text-xs text-muted">
            Claude vision needs an Anthropic API key, set as{" "}
            <code>ANTHROPIC_API_KEY</code> where this app runs. Until then, Local OCR is
            used.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Analyzing {config().workers} photo{config().workers === 1 ? "" : "s"} at a
          time.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="display text-lg">Analysis queue</h2>
        <p className="mt-1 text-sm text-muted">
          {p.total.toLocaleString()} photos · {p.queued + p.processing} waiting ·{" "}
          {p.needsReview} need review · {p.failed} failed
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={retryFailedAction}>
            <input type="hidden" name="returnTo" value="/settings" />
            <button className="btn-ghost" type="submit" disabled={p.failed === 0}>
              Retry all failed
            </button>
          </form>
          <form action={reanalyzeAction}>
            <input type="hidden" name="returnTo" value="/settings" />
            <button className="btn-ghost" type="submit" disabled={p.total === 0}>
              Re-analyze every photo
            </button>
          </form>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="display text-lg">People in {user.organizationName}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {people.map((m) => (
            <li key={m.id}>
              {m.display_name}{" "}
              <span className="text-muted">
                · {m.email} · {m.role}
              </span>
            </li>
          ))}
        </ul>
        {user.role === "owner" ? (
          <form action={addMemberAction} className="mt-4 grid gap-2 sm:grid-cols-4">
            <input
              className="input"
              name="name"
              placeholder="Name"
              required
              aria-label="Name"
            />
            <input
              className="input"
              name="email"
              type="email"
              placeholder="Email"
              required
              aria-label="Email"
            />
            <input
              className="input"
              name="password"
              type="password"
              placeholder="Temporary password (10+)"
              minLength={10}
              required
              aria-label="Temporary password"
            />
            <button className="btn-ghost" type="submit">
              Add person
            </button>
          </form>
        ) : (
          <p className="mt-2 text-xs text-muted">Only the owner can add people.</p>
        )}
        <p className="mt-3 text-xs text-muted">
          Everyone here sees every photo in this organization, and nobody outside it
          sees any.
        </p>
      </section>
    </div>
  );
}
