# Store listing copy

Every claim here is one the shipped build makes good on. Nothing describes a
feature that is not in the app — the acceptance run in `../qa` is what keeps
that true, and the screenshots are produced by driving the real application.

---

## App name

**PlayTime Tracker**

## Subtitle (Apple, 30 characters)

`Who played, and for how long`

## Short description (Google Play, 80 characters)

`Tap players on and off. See exactly how long every athlete actually played.`

## Full description

> Know exactly how long every athlete played — even when there is no signal at
> the field.
>
> PlayTime Tracker is for the coach, parent or team manager who wants to be
> able to answer one question honestly: how much did each child actually play?
>
> **The live tracker is one screen.** Big cards, big jersey numbers. Tap a
> player to send them on. Tap again to take them off. That is the whole
> interaction — designed to be used outdoors, in one hand, while you are
> watching the game instead of the phone.
>
> **It keeps time properly.** PlayTime Tracker does not run a stopwatch that
> the phone can quietly stop. It records the moment of every tap and works out
> the durations from those. Lock your phone, switch to the camera, or have the
> app closed by the system — the totals are still right to the second when you
> come back.
>
> **It works with no signal.** Everything is saved on your device the instant
> you tap, so a dead zone at the field changes nothing. If you have an account,
> your games upload on their own once you are back in coverage.
>
> **It shows who is short of minutes.** Set your own participation target — a
> percentage of game time, or a number of minutes — and the app flags anyone
> falling behind while there is still time to do something about it.
>
> **Share a clear report.** Playing time, participation percentage, number of
> entries, and whether your target was met, for every athlete. Send it through
> your phone's normal share sheet.
>
> Football, basketball, soccer, hockey, baseball, or anything else you set up
> yourself.
>
> No ads. No tracking. No device permissions at all — not the camera, not your
> location, not your contacts. Delete your account and everything in it from
> inside the app, whenever you like.
>
> PlayTime Tracker measures against the target YOU set. It does not know your
> league's rules and makes no claim about them.

## Keywords (Apple, 100 characters)

`playing time,youth sports,substitution,coach,roster,minutes,fair play,team,game clock,participation`

## Category

- Apple: Sports (secondary: Productivity)
- Google Play: Sports

## Age rating

- Apple: 4+ — no objectionable content, no user-generated content shown to
  other users, no web browsing, no ads.
- Google Play: Everyone.

Note for both questionnaires: the app is intended for adults (coaches, parents,
team managers). It is not directed at children, though the athlete names an
adult enters will often be children's. It has no social features, no messaging,
no user-to-user visibility of any kind.

---

## Required URLs

| Field | Value |
| --- | --- |
| Privacy Policy | `/legal/privacy/` (in-app), plus a public copy on the marketing site |
| Terms of Use | `/legal/terms/` (in-app), plus a public copy |
| Support URL | `/support/` (in-app), plus a public copy |
| Marketing URL | optional |

**Both stores require these as public HTTPS URLs**, not only as in-app screens.
The in-app pages are the source text; hosting them is a deployment step, listed
as a blocker in `NATIVE.md`.

---

## Permission descriptions

There are none, and that is the answer.

PlayTime Tracker requests **no** device permissions. The Android manifest
declares exactly one: `android.permission.INTERNET`, which is not a runtime
permission and produces no prompt. The iOS project contains no `NS*UsageDescription`
key, because there is no API that would need one.

No camera, microphone, location, contacts, photos, calendar, Bluetooth, motion,
notifications, or background execution. Sharing a report uses the Web Share API,
which the system share sheet already serves without a permission.

---

## Apple: App Privacy answers

| Question | Answer |
| --- | --- |
| Does the app collect data? | Yes |
| Contact Info → Email Address | Collected, linked to identity, for **App Functionality** (the account). Not used for tracking. |
| User Content → Other User Content | Team names, athlete names, jersey numbers, positions, games and the substitution log. Linked to identity, for **App Functionality**. Not used for tracking. |
| Identifiers | Not collected. No advertising identifier, no device identifier. |
| Usage Data | Not collected. There is no analytics package in the build. |
| Diagnostics | Not collected. There is no crash reporter in the build. |
| Tracking (ATT) | No. The app does not track and does not present the ATT prompt. |
| Third-party SDKs | None that collect data. The only network dependency is the app's own backend. |

Account deletion: **Account → Delete my account permanently**, reachable
without contacting support, as Apple requires of any app that offers account
creation.

---

## Google Play: Data safety answers

| Question | Answer |
| --- | --- |
| Data collected | Email address (account); app-entered content (teams, athletes, games, substitutions). |
| Data shared with third parties | None. |
| Data encrypted in transit | Yes (HTTPS). |
| Can users request deletion? | Yes, in-app: Account → Delete my account permanently. |
| Data used for advertising or analytics | No. |
| Committed to the Play Families Policy? | The app is not in the Designed for Families programme and its target audience is adults. |

---

## Screenshots

Generated from the running application:

```bash
pnpm --filter @hl-bos/playtime-tracker build
node qa/serve.mjs out 4700 &
node qa/screenshots.mjs
```

Output lands in `store/screenshots/`, at the sizes each store asks for. The
roster in them is invented; a listing has no business showing real children's
names. Every number on them is computed by the shipped engine.
