# The shop website server.
#
# Build context is the REPOSITORY ROOT, not this folder, because the server
# imports the same handler the Supabase deployment uses and there is deliberately
# only one copy of it. The paths below mirror the repository layout so those
# relative imports resolve unchanged inside the image.
#
# In Coolify: set the Base Directory to `/` and the Dockerfile path to
# `apps/shop-pages/Dockerfile`.

# Pinned. Deno ships breaking changes in minor releases and this is the one
# process standing between a shop and its customers.
FROM denoland/deno:alpine-2.9.6

WORKDIR /app

# Only what the server actually needs. The rest of the repository -- the
# console, the migrations, the tests -- has no business in a public-facing
# image.
COPY supabase/functions/_shared/barberos/site_render.ts ./supabase/functions/_shared/barberos/site_render.ts
COPY supabase/functions/_shared/barberos/site_server.ts ./supabase/functions/_shared/barberos/site_server.ts
COPY supabase/functions/_shared/barberos/site_source_rest.ts ./supabase/functions/_shared/barberos/site_source_rest.ts
COPY apps/shop-pages/server.ts ./apps/shop-pages/server.ts

# Type-check and cache at BUILD time, so a mistake fails the build rather than
# the first customer's request.
RUN deno check apps/shop-pages/server.ts

# Least privilege: network in and out (it answers requests and calls PostgREST),
# and the three environment variables it reads. No filesystem write, no
# subprocesses, no FFI.
#
# The deno image already runs as the non-root `deno` user.
USER deno
EXPOSE 3000
ENV PORT=3000

CMD ["run", "--allow-net", "--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SITE_PUBLIC_BASE,PORT", "apps/shop-pages/server.ts"]
