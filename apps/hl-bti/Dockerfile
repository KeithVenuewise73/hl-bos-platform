# syntax=docker/dockerfile:1
# ===========================================================================
# HL-BTI — production image for the Herman Legacy Cloud (Coolify)
# ===========================================================================
# Build CONTEXT is the repository ROOT (this is a pnpm workspace; the app needs
# @hl-bos/bti-engine and the workspace lockfile). In Coolify set:
#   Build Pack   = Dockerfile
#   Dockerfile   = apps/hl-bti/Dockerfile
#   Base/Context = / (repository root)
#
# The two NEXT_PUBLIC_SUPABASE_* values are needed at BUILD time (Next inlines
# them into the static bundle). Pass them as Coolify "Build Variables". They are
# public by design; the service-role key is never used by this app.
# ---------------------------------------------------------------------------

# ---- Stage 1: build the static export ------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Build-time public config (provided by Coolify Build Variables).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# Copy the whole workspace and install with the committed lockfile (reproducible).
COPY . .
RUN pnpm install --frozen-lockfile

# Build only the HL-BTI app (and its workspace deps). Emits apps/hl-bti/out.
RUN pnpm --filter @hl-bos/hl-bti build

# ---- Stage 2: serve the static files via nginx ----------------------------
FROM nginx:1.27-alpine AS runner
COPY apps/hl-bti/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/hl-bti/out /usr/share/nginx/html
EXPOSE 80
# nginx runs in the foreground by default via its base image CMD.
