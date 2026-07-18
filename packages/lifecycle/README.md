# @hl-bos/lifecycle

**The Herman Legacy company lifecycle.**

Every Herman Legacy company — and, later, every external customer — moves through
the same six stages, operated through Headquarters and its hosted cloud plane:

**Provision → Operate → Monitor → Update → Back up → Retire.**

This package names those stages and their actions, and fixes the **remote-safety
class** of each action in the model itself:

| Class              | Runs where                                                |
| ------------------ | --------------------------------------------------------- |
| `remote-safe`      | the hosted cloud plane                                    |
| `local-privileged` | the local operator plane (Headquarters) only              |
| `promoted`         | the cloud plane, behind an authenticated + authorized API |

So the security boundary is not prose to remember — it is data both planes read,
and a test asserts that destructive or OS-level actions (`purge-tenant`,
`restore-backup`, `apply-migration`) are never classified `remote-safe`.

## Status

This is **design encoded as a model**, not yet implementation. It states the
capability Headquarters is being built to deliver end to end, and where each
action is allowed to run. Actions become real as the platform lands them —
every one already knows which plane it belongs to.

## Not here

No execution, no side effects, no provider or database calls. Pure types and
data. The cloud plane renders it; the platform will implement the actions behind
it, each on its declared plane.
