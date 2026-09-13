# BarberOS — the shop's app. Production container (Node SSR, standalone).
#
# Multi-stage: build the monorepo app, then run only the standalone server.
# No git, no pnpm and no shell tooling at runtime.
#
# THE ONLY SECRETS-ADJACENT VALUES HERE ARE BROWSER-SAFE BY DESIGN. The Supabase
# URL and the publishable key are inlined at BUILD time because Next only
# inlines literal `process.env.NEXT_PUBLIC_*` dot-access. The publishable key is
# public by the platform's ENV_SPEC -- RLS is the boundary, not secrecy -- and
# the service-role key is never read by this app at any depth. If you ever find
# yourself adding it here, the app has been built wrong.

# ---- Build stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# The whole monorepo: workspace deps are needed to build the app.
COPY . .
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV HL_BOS_ENV=production
ENV NODE_ENV=production

RUN pnpm --filter @hl-bos/barbershop build

# ---- Runtime stage --------------------------------------------------------
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV HL_BOS_ENV=production
WORKDIR /app

RUN groupadd -r app && useradd -r -g app app

# Next standalone output already carries a pruned node_modules.
COPY --from=builder /repo/apps/barbershop/.next/standalone ./
COPY --from=builder /repo/apps/barbershop/.next/static ./apps/barbershop/.next/static

USER app
EXPOSE 4400
ENV PORT=4400
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/barbershop/server.js"]
