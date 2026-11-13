# JerseySort approval review (on hold)

**Status: on hold. Never merged.** Built 2026-11-13, then set aside when the CEO decided to
review photos on 5starsportsmedia.com instead of inside JerseySort. Kept so it is never
rebuilt from scratch. The website review area reuses its ideas and, where possible, its code.

## What it does

An **Approve** page inside JerseySort (`/approve`, `/approve/<game>`):

- Every photo is *waiting* until decided (photos from before the page existed too).
- **Only the owner** can approve, reject or move photos. The rule is enforced in the data
  layer (`apps/jersey-sort/src/lib/repo/approvals.ts`, `relabel.ts`), not just hidden
  buttons; tests prove a member is refused.
- Reject keeps a photo here and never publishes it, with an optional reason.
- *Approve all waiting* never overrides a rejection.
- Photos are shown in the order taken, with a marker at long pauses ("possibly a different
  game"), and a warning when several games fall on one day.
- **Move** photos to another game, or **start a new game from the ticked photos**; a moved
  photo goes back to waiting.
- **Quality hints** per photo (`quality-core.ts`): *Possibly soft*, *Very dark*, *Very bright*,
  *Low resolution*. Sharpness uses the sharpest tile of the picture, so a sharp player in front
  of a deliberately blurred background is not called soft. The cut-offs are first guesses and
  were never tuned on real game photos.
- Publishing to the website (`online-core.ts`) uploads **only approved photos** and takes down
  any that stop being approved.
- Decisions live in local tables (`photo_approvals`, `photo_quality`) and do not change the
  Supabase schema (migration 0052).
- DateSort's *Publish to 5 Star* handoff became "send for review".

## What was run

Typecheck, lint, Prettier, `next build` clean; 109 JerseySort tests passed (18 new approval
tests, plus quality, relabel and publishing-gate tests); driven in a real browser (approve,
split a game, menu badge). Not run on real photos. Not run on Windows.

## Why it is on hold

JerseySort is slow to use and each jersey read costs money, so the CEO prefers to review on
the website. The pieces worth reusing there are the rules above, the time-gap suggestion
(`relabel-core.ts`) and the quality hints.

## Bringing it back

    git checkout archive/jerseysort-approval-review
    git log -3

It was built on top of `main` as of commit `5eeab65` (#131) and has not been rebased since; expect to
rebase before merging.
