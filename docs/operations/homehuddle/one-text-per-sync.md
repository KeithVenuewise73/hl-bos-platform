# HomeHuddle — one schedule text per family per sync

**Database:** Venuewise Platform (`urwnbskrtoplgnkkxuvl`).
**Applied:** 2026-09-28, with Keith's approval.
**Migrations:** `homehuddle_one_text_per_sync`, `homehuddle_digest_wording`.

## Why

`trg_events_sms` queued one text per changed event, per family member. When
TeamSnap published 34 new events on 2026-09-23, HomeHuddle queued **136 texts
in 3 seconds**. They only failed because the Twilio account was suspended
(for an unpaid balance). With Twilio live, every one is charged, and a burst
like this is what got the account suspended in June.

## What changed

- `trg_events_sms` keeps its filters (future, not duplicate, real change,
  known family) and its "never text the same change twice" identity, but now
  writes to `public.schedule_change_queue` instead of `sms_outbox`. A failure
  there can never block an event from saving.
- `public.flush_schedule_digests()` runs every 2 minutes (cron
  `flush-schedule-digests`). Once a family's changes have been quiet for 3
  minutes (the sync takes ~10 s), it sends **one** text:
  - 1 change: exactly the text families already got, e.g.
    `D'Amico-Herman Family — Schedule change: … Sat Oct 31 at 3:40 PM`
  - several: `D'Amico-Herman Family: 33 schedule updates for Cazenovia Chiefs
Bantam Major TB (33 new). Next: Thu Oct 7 9:00pm Practice; Fri Oct 8 vs
TBD; Sat Oct 9 vs TBD. Full schedule: venuewise.net` (plain characters,
    about 200 characters)
- `public.schedule_when()` formats dates; all-day events show the date only
  instead of "12:00 AM".
- Nightly reminders, business alerts and member confirmations are unchanged.

## Proven (in a rolled-back transaction on production data)

| Case                                    | Before        | After                           |
| --------------------------------------- | ------------- | ------------------------------- |
| Replay of the 2026-09-23 TeamSnap burst | 136 texts     | 4 (one per family phone)        |
| One game moved by an hour               | 4 texts       | 4 texts, same wording as before |
| Same change seen again by the next sync | not re-texted | not re-texted                   |

## Undo

Restore the previous `trg_events_sms` (it called
`enqueue_sms_for_family(...)` directly; the pre-change definition is in the
project's migration history before `homehuddle_one_text_per_sync`), then
`select cron.unschedule('flush-schedule-digests');` and drop
`schedule_change_queue`, `flush_schedule_digests`, `schedule_when`.
