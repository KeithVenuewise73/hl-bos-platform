# Herman Legacy Venture Studio (HLVS V2) — production container (Node SSR, standalone).
# Mirrors the Executive Portal deployment pattern (Herman Legacy Cloud / Coolify).
# Publishable key only — never a service-role key. No git/pnpm/shell at runtime.

# ---- Build stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV HL_BOS_ENV=production
ENV NODE_ENV=production

RUN pnpm --filter @hl-bos/venture-studio-app build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HL_BOS_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /repo/apps/venture-studio/.next/standalone ./
COPY --from=builder /repo/apps/venture-studio/.next/static ./apps/venture-studio/.next/static

USER app
EXPOSE 4500
ENV PORT=4500
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/venture-studio/server.js"]
