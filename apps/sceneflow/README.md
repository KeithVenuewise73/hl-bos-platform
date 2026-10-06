# SceneFlow

Direct a scene, or plan a story, from your own photographs — on your own
machine, and from your phone if you want it.

## Start it

You do not start this yourself. Open the Development Control Center, go to
**SceneFlow**, and press **Start SceneFlow**. The console builds it, starts it,
waits until it actually answers, and then shows you two things:

- the address to open on your phone, e.g. `http://192.168.1.42:4100`
- the access code to type

Both phones and the PC use the same address rules: anything on your Wi-Fi can
reach it, and nothing without the code gets past the first screen.

## Why this is a separate app

The Development Control Center can run `git`, `pnpm`, `node` and PowerShell on
the machine it is running on. That is why it listens on `localhost` and must
never be reachable from anywhere else — anything that could reach it could run
those.

SceneFlow carries none of that. Its entire command surface is the local image
worker, invoked with a fixed argument array where everything the operator typed
travels inside a JSON file rather than on a command line
(`src/lib/shell.ts`, `src/lib/worker.ts`). That is what makes it safe to put on
the home network, and it is why splitting the two apart was the prerequisite for
using SceneFlow from a phone rather than something that could be bolted on
afterwards.

## Using it away from home

The address above only works inside the house. To reach SceneFlow from a hotel,
a coffee shop or a phone on cellular, install
[Tailscale](https://tailscale.com/download) on this PC and on the phone and sign
into the same account on both. Free for personal use, two ordinary app installs,
nothing to change on the router.

Once both are signed in, the console shows a second address (a `100.x.x.x` one)
that works from anywhere. Same access code.

**This is deliberately not a public web address.** A tunnel that gives SceneFlow
a real internet URL would work too, and would put photographs behind nothing but
a six-digit code on an address that automated scanners find. Tailscale instead
puts the phone and the PC on a private network of their own: nothing on the
internet can reach SceneFlow, and only devices signed into the account know it
exists.

Detection does not run anything. A machine on a tailnet has an address in
`100.64.0.0/10`, and that address exists only when Tailscale is installed AND
signed in AND running — so reading the machine's own network interfaces answers
all three at once. Shelling out to `tailscale status` would need a new name on
the console's command allow-list, and on Windows the binary is not reliably on
the PATH, so the check would report "not set up" on a machine where it is.

## The access code

`.sceneflow/access-code.txt`. The console writes it; this app reads it on every
request.

- **A code is set** → it is required from every visitor, including the PC.
- **No code is set** → the app is open to whatever the operating system lets
  reach it. Started by hand with `pnpm start` that is this machine only,
  because that script passes `--hostname 127.0.0.1`. Worth knowing that this
  is a flag and not a default: `next start` binds every interface unless told
  otherwise, and for a while both scripts did.

There is deliberately no "only ask when the request came from the network"
exemption. Deciding that from the `Host` header is a check anything on the
network can switch off by sending `Host: localhost`.

**Guessing it gets slower.** Three attempts are free, because people mistype;
after that each wrong answer doubles the wait, to a ceiling of thirty seconds.
At the ceiling a million combinations takes about a year, and a correct code
clears the counter instantly. The correct code is refused during a wait too —
otherwise the delay would be something an attacker walks straight past on the
one attempt that counts.

The counter is global rather than per-address, and that is the honest version of
what this can enforce: behind a tunnel every request arrives from the tunnel's
own local connection, so a per-address key would collapse to one bucket anyway
and read as a defence that is none. It delays rather than locks precisely so a
stranger guessing cannot keep the owner out.

Changing the code is the off switch: every device that was let in holds a cookie
derived from the old one, so **New code** in the console locks all of them out
at once. It does not stop SceneFlow listening — it stays on the network until
the PC is restarted — which is why the code, not the binding, is the control.

The gate is Node middleware (`src/middleware.ts`), not a check inside the
layout. A layout that renders an unlock screen instead of `children` still ran
the page, and its whole content still travels in the response payload. That was
the first version, and reading the served bytes is what found it. The route
handlers and server actions check for themselves as well.

## What it does not do

It does not generate a picture. It composes the instruction — cast, focus pair,
interaction, intimacy ceiling, reciprocal affection, setting, wardrobe, mood —
and shows you exactly what would be sent. No image model is connected to this
repository. Press **Make the picture** and it tells you precisely what is
missing; it never substitutes a placeholder for a real result.

Photographs stay under `.sceneflow/`, which is gitignored so one cannot be
committed by accident. Nothing is uploaded anywhere.

## Verifying it

Against a running copy:

```
node scripts/local-test/verify-sceneflow-access.cjs    http://127.0.0.1:4100
node scripts/local-test/verify-sceneflow-throttle.cjs  http://127.0.0.1:4100
node scripts/local-test/verify-sceneflow-director.cjs  http://127.0.0.1:4100
```

The first reads the served bytes and proves a locked visitor receives nothing
of the app. The second proves guessing the code actually gets slower in the
shipped unlock screen, including that the right code is refused mid-wait. The
third drives the director in a real browser and proves the safety boundary
refuses what it should in the thing you actually click.

Neither runs in CI: both need a running server, and a gate that cannot run in CI
is a gate that gets ignored. `pnpm --filter @hl-bos/sceneflow-app test` is the
part that does.
