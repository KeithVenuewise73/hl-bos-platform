import Link from "next/link";

import { PUBLISHING_STATUS } from "@hl-bos/ats-resume";

import {
  Card,
  Empty,
  Flash,
  Notice,
  PageHead,
  ValidationTag,
} from "@/components/ui.tsx";
import {
  createPost,
  generateLinkedIn,
  updateLinkedInItem,
} from "@/lib/career-actions.ts";
import { careerContext } from "@/lib/career.ts";

export const dynamic = "force-dynamic";

export default async function LinkedInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await careerContext();
  const profileItems = ctx.linkedin.filter(
    (x) => x.kind !== "post" && x.status !== "dismissed",
  );
  const posts = ctx.linkedin
    .filter((x) => x.kind === "post")
    .sort((a, b) => (a.scheduledFor ?? "9999").localeCompare(b.scheduledFor ?? "9999"));
  const approved = ctx.baseResumes.some((b) => b.status === "approved");
  const Op = ({ id, op, label }: { id: string; op: string; label: string }) => (
    <form action={updateLinkedInItem} className="inline-form">
      <input type="hidden" name="itemId" value={id} />
      <input type="hidden" name="op" value={op} />
      <button className="btn btn-sm" type="submit">
        {label}
      </button>
    </form>
  );

  return (
    <>
      <PageHead
        title="LinkedIn"
        lead="Suggestions for your profile and posts, built from your verified experience. You review everything; nothing is posted for you."
      />
      <Flash error={error} />
      <Notice>{PUBLISHING_STATUS}</Notice>

      <Card
        title="Profile suggestions"
        sub="Headline, About, experience and skills — consistent with your approved base resume."
      >
        <div id="profile" />
        {approved ? (
          <form action={generateLinkedIn}>
            <button className="btn btn-primary" type="submit">
              {profileItems.length === 0
                ? "Suggest profile improvements"
                : "Refresh suggestions"}
            </button>
          </form>
        ) : (
          <Notice tone="warn">
            Approve your <Link href="/experience#base">base resume</Link> first.
          </Notice>
        )}
        {profileItems.length === 0
          ? null
          : profileItems.map((x) => (
              <div key={x.id} className="line">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{x.label}</strong>
                  <span>
                    <ValidationTag status={x.validation} />{" "}
                    {x.status === "accepted" ? (
                      <span className="tag tag-strong">Using it</span>
                    ) : null}
                  </span>
                </div>
                <div className="pre">{x.text}</div>
                {x.notes.length === 0 ? null : (
                  <div className="small muted">{x.notes.join(" ")}</div>
                )}
                <div className="row" style={{ marginTop: 6 }}>
                  {x.status === "accepted" ? null : (
                    <Op id={x.id} op="accept" label="I'll use this" />
                  )}
                  <Op id={x.id} op="dismiss" label="Dismiss" />
                </div>
              </div>
            ))}
      </Card>

      <Card
        title="Write a post"
        sub="Start from something that actually happened at work and what you learned. The draft keeps your words."
      >
        <form action={createPost}>
          <div className="field">
            <label htmlFor="topic">Topic</label>
            <input id="topic" name="topic" placeholder="Peak season lessons" />
          </div>
          <div className="field">
            <label htmlFor="story">What happened</label>
            <textarea id="story" name="story" rows={3} />
          </div>
          <div className="field">
            <label htmlFor="lesson">What you took from it, or your opinion</label>
            <textarea id="lesson" name="lesson" rows={2} />
          </div>
          <button className="btn" type="submit">
            Create draft
          </button>
        </form>
      </Card>

      <Card title="Content calendar">
        <div id="calendar" />
        {posts.length === 0 ? (
          <Empty>No posts yet.</Empty>
        ) : (
          posts.map((p) => (
            <div key={p.id} className="line">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{p.label}</strong>
                <span className="tag tag-neutral">
                  {p.status === "published_manually"
                    ? "Posted by you"
                    : p.scheduledFor
                      ? `Planned ${p.scheduledFor}`
                      : "Draft"}
                </span>
              </div>
              <form action={updateLinkedInItem}>
                <input type="hidden" name="itemId" value={p.id} />
                <input type="hidden" name="op" value="edit" />
                <textarea
                  name="text"
                  rows={5}
                  defaultValue={p.text}
                  aria-label={`Post: ${p.label}`}
                />
                <button className="btn btn-sm" type="submit">
                  Save edits
                </button>
              </form>
              <div className="row" style={{ marginTop: 6 }}>
                <form action={updateLinkedInItem} className="row">
                  <input type="hidden" name="itemId" value={p.id} />
                  <input type="hidden" name="op" value="schedule" />
                  <input
                    type="date"
                    name="date"
                    aria-label="Planned date"
                    defaultValue={p.scheduledFor ?? ""}
                    style={{ maxWidth: 170 }}
                  />
                  <button className="btn btn-sm" type="submit">
                    Plan
                  </button>
                </form>
                {p.status === "published_manually" ? null : (
                  <Op id={p.id} op="published" label="I posted it" />
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
