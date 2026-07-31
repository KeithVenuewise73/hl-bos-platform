# Herman Legacy Digital — production container (Node SSR, standalone).
# Mirrors the Executive Portal deployment pattern (Herman Legacy Cloud / Coolify).
# Multi-stage: build the monorepo app, then run only the standalone server.
# NEXT_PUBLIC_* are inlined at BUILD time (publishable key only — never a
# service-role key). No git/pnpm/shell at runtime.

# ---- Build stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

# Build-time public env (provided by Coolify build args). Publishable key only.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV HL_BOS_ENV=production
ENV NODE_ENV=production

RUN pnpm --filter @hl-bos/herman-legacy-digital build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HL_BOS_ENV=production
WORKDIR /app

RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /repo/apps/herman-legacy-digital/.next/standalone ./
COPY --from=builder /repo/apps/herman-legacy-digital/.next/static ./apps/herman-legacy-digital/.next/static

USER app
EXPOSE 4400
ENV PORT=4400
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/herman-legacy-digital/server.js"]
