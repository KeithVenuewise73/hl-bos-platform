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

## The access code

`.sceneflow/access-code.txt`. The console writes it; this app reads it on every
request.

- **A code is set** → it is required from every visitor, including the PC.
- **No code is set** → the app is open to whatever the operating system lets
  reach it. Started by hand with `pnpm start` that is this machine only.

There is deliberately no "only ask when the request came from the network"
exemption. Deciding that from the `Host` header is a check anything on the
network can switch off by sending `Host: localhost`.

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
node scripts/local-test/verify-sceneflow-access.cjs   http://127.0.0.1:4100
node scripts/local-test/verify-sceneflow-director.cjs http://127.0.0.1:4100
```

The first reads the served bytes and proves a locked visitor receives nothing
of the app. The second drives the director in a real browser and proves the
safety boundary refuses what it should in the thing you actually click.

Neither runs in CI: both need a running server, and a gate that cannot run in CI
is a gate that gets ignored. `pnpm --filter @hl-bos/sceneflow-app test` is the
part that does.
