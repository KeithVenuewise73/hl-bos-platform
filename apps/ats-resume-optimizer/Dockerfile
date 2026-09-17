# ATS Resume Optimizer — production container (Node SSR, standalone).
# Mirrors the Venture Studio / Executive Portal pattern for Herman Legacy Cloud
# (Coolify). Publishable key only — never a service-role key. No git, pnpm or
# shell at runtime.
#
# PERSISTENCE: this app keeps each account's career database in a JSON file
# under ATS_DATA_DIR. A container filesystem does not survive a redeploy, so
# Coolify MUST mount a persistent volume at that path or every deployment
# silently destroys the user's resume, applications and history. The default
# below points at /data for exactly that reason — see DEPLOYMENT.md.

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

RUN pnpm --filter @hl-bos/ats-resume-optimizer build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HL_BOS_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app

COPY --from=builder /repo/apps/ats-resume-optimizer/.next/standalone ./
COPY --from=builder /repo/apps/ats-resume-optimizer/.next/static ./apps/ats-resume-optimizer/.next/static

# The career store lives here and must be a mounted volume in Coolify.
ENV ATS_DATA_DIR=/data
RUN mkdir -p /data && chown -R app:app /data
VOLUME ["/data"]

USER app
EXPOSE 4600
ENV PORT=4600
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/ats-resume-optimizer/server.js"]
