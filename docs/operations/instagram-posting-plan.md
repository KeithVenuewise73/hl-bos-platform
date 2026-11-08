# Posting to Instagram from JerseySort — the plan

## Status, stated plainly

| Thing                                                           | State                                                                                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stage 1: the **Instagram post maker** in JerseySort             | **Built and tested** (browser test, unit tests). It makes the pictures and the caption. **It posts nothing.**                                                         |
| Stage 2: posting straight to the 5 Star Instagram account       | **Not built.** It needs things only the CEO can grant (below) and one database change that needs his approval.                                                        |
| The platform's existing social module (`social-publish-worker`) | Built and tested against a stand-in for Instagram, never against the real one, not deployed, no account connected. Stage 2 reuses its Instagram code, not its tables. |
| Anything posted to Instagram by us                              | **Nothing.**                                                                                                                                                          |

## Stage 1 (done): what it does

On a game's page, **Instagram** → **Start a new Instagram post**:

1. Choose up to 10 photos (Instagram's limit for one post). They appear in the order they were **taken**.
2. Choose the shape (portrait 4:5 or square 1:1) and whether to fill it (crops the edges) or keep the whole photo (dark bars).
3. Write the caption. It starts from the game (teams, date, place, the brand) with **no names or numbers**, and counts Instagram's limits (2,200 characters, 30 hashtags) as you type.
4. See the pictures, made from the originals, exactly as they will go. A small photo that had to be enlarged is flagged.
5. **Download the pack**: `01.jpg`, `02.jpg`, … and `caption.txt`. Post it yourself from instagram.com (Create → choose the pictures → paste the caption).

Two properties matter because the result is meant to be public:

- **No camera data and no GPS location** is in any picture. A phone photo can carry the place it was taken; the test uses photos that do, and proves none survives.
- The originals are never changed, and nothing leaves the computer.

## Stage 2: posting directly

### What only the CEO can grant

1. **The account.** The 5 Star Sports Media Instagram must be a **Business or Creator** account. A personal account cannot post through Instagram's API at all. (In the Instagram app: Settings → Account type and tools.) Depending on the sign-in route Meta offers, it may also need to be linked to a Facebook Page.
2. **A Meta developer app**, made under his Meta account, with permission to publish. For posting to **his own** account, Meta lets the app's own testers use it before its app review; this must be confirmed when setting up, because Meta's rules change. If review turns out to be needed, it takes days to weeks and is a separate step.
3. **One click to connect**, in a Meta window, to authorize the app for the account.
4. **Approval of one database change** (below). No migration is applied without his explicit approval.

### How it would work

- **Public copies.** Instagram downloads each picture itself, from a public web address; it cannot use the team galleries' private, expiring links. So posting makes a **public copy of only the pictures in the post**, in a new public storage bucket, through the existing gallery service (the same publisher-key trust as "Publish online"). **The copies are deleted once Instagram confirms the post is live.**
- **The login.** The connection's token is kept in Vault (never in the database, never on the laptop), with the platform's existing token-refresh job keeping it fresh. The authorization window needs the app's secret, so it runs in a cloud function, not on the laptop.
- **Carousels.** The existing Instagram code posts one picture. Stage 2 adds the carousel steps (one hidden item per picture, then the post that joins them), tested against the stand-in first.
- **Approval is the CEO's click.** After the preview, a **Post to Instagram now** button, and nothing else posts. No scheduling, no automatic posts. The time of the click and Instagram's own link to the post are recorded.
- **Why not the existing `social.posts` tables.** They assume company tenants, cloud sign-in accounts and a workflow approval engine; JerseySort is one photographer's local app with none of that. Forcing it in would be a large change for little gain. Stage 2 reuses the Instagram _code_ and the evidence-keeping idea (every request and answer recorded), in a small table of its own in the `gallery` schema.

### The one database change (needs approval before it is applied)

A new migration (0055): the public bucket for the post's pictures, and a small table for the connection and the posts' records. Additive, like 0053 and 0054, and applied the same way: one at a time, from the merged file, with the fingerprint and live safety checks, and the advisors compared before and after.

### A decision that is the CEO's

Instagram is public and most of these photos are of minors. A guard worth having: a **"cleared for public posting"** setting per team, that **Post to Instagram now** requires, so a team that has not agreed can never be posted by accident. It is cheap to add and easy to leave out; he decides.

### Limits to know

- Instagram caps how many posts can go through its API per day. Far above what a game needs.
- The API cannot delete a post. A mistaken post is deleted by hand in the Instagram app. That is why the first real post should be one he is happy to have public.
- Stories and Reels are not part of this; only photo posts and carousels.

### Order of work

1. **Done:** carousel support in the Instagram code (`supabase/functions/_shared/social/instagram.ts`): 2 to 10 pictures, the caption on the carousel only, a clear refusal over 10 or with a video among them, and the rule that an unanswered publish is never retried. Tested against the stand-in (not the real Instagram). One picture behaves exactly as before.
   _Once access is granted:_

2. Migration 0055, applied with approval, then verified.
3. The connect window (cloud function) and the token in Vault.
4. The public copies, the **Post to Instagram now** button, and the record of each post.
5. The first real post, together with the CEO, on his account.
