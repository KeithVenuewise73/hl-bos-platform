# Herman Legacy Executive Portal — production container (Node SSR, standalone).
# Multi-stage: build the monorepo app, then run only the standalone server.
# Read-only app: no git/pnpm/shell at runtime. NEXT_PUBLIC_* are inlined at BUILD
# time (publishable key only — never the service-role key).

# ---- Build stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Copy the whole monorepo (workspace deps are needed to build the app).
COPY . .
RUN pnpm install --frozen-lockfile

# Build-time public env (provided by Coolify build args). Publishable key only.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV HL_BOS_ENV=production
ENV NODE_ENV=production

RUN pnpm --filter @hl-bos/executive-portal build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HL_BOS_ENV=production
# PORTAL_DEV_ROLE is intentionally NOT set; the dev bypass is impossible in
# production anyway (guarded on NODE_ENV/HL_BOS_ENV).
WORKDIR /app

# Non-root user.
RUN groupadd -r app && useradd -r -g app app

# Next standalone output already contains a pruned node_modules.
COPY --from=builder /repo/apps/executive-portal/.next/standalone ./
COPY --from=builder /repo/apps/executive-portal/.next/static ./apps/executive-portal/.next/static

USER app
EXPOSE 4300
ENV PORT=4300
ENV HOSTNAME=0.0.0.0

# The standalone server for this app.
CMD ["node", "apps/executive-portal/server.js"]
