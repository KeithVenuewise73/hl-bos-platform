# HSCS Website — preview/production container (Node SSR, standalone).
# Mirrors the Herman Legacy Digital / Executive Portal deployment pattern
# (Herman Legacy Cloud / Coolify). Multi-stage: build the monorepo app, then
# run only the Next.js standalone server. No git/pnpm/shell at runtime.
#
# This app takes NO environment variables and NO secrets (no Supabase, no API
# keys) — so, unlike the sibling apps, there are deliberately no build args and
# nothing sensitive is ever passed in. It serves the HSCS marketing site only.

# ---- Build stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
RUN pnpm --filter @hl-bos/hscs-website build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /repo/apps/hscs-website/.next/standalone ./
COPY --from=builder /repo/apps/hscs-website/.next/static ./apps/hscs-website/.next/static

USER app
EXPOSE 4600
ENV PORT=4600
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/hscs-website/server.js"]
