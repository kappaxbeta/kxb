# syntax=docker/dockerfile:1
#
# Uses Next.js standalone output so the runtime image carries only the server
# and its traced dependencies, not the full node_modules tree.

FROM node:22-slim AS deps
WORKDIR /app
RUN npm install -g bun
# The workspace packages have to be here *before* the install, not just before
# the build: `bun install` reads each one's package.json to link it into
# node_modules, and without them the app builds against a `@kxb/xp` that does
# not resolve. Copying the whole directory rather than globbing the manifests -
# a `COPY packages/*/package.json` flattens them all onto one path, which is a
# footgun the moment there is a second package.
COPY package.json bun.lockb* ./
COPY packages ./packages
RUN bun install --frozen-lockfile

FROM node:22-slim AS builder
WORKDIR /app
RUN npm install -g bun
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so they
# have to be present *here*, not just at runtime. compose.yaml passes them as
# build args - setting them only as container env vars gives you a build that
# talks to `undefined`.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
# Also build-time, and easy to miss: it is what Stripe Checkout returns to. Left
# unset, the deployed app sends paying customers back to 127.0.0.1:3000.
ARG NEXT_PUBLIC_APP_URL
# The Telegram Mini App, as `botusername/appshortname`. Optional, and the only
# one of these that is: left unset, share panels offer ordinary https links and
# no Telegram button, which is the right behaviour for a deployment that has not
# registered a bot. Unset here means unset in the *bundle* though - putting it
# in .env on the box and restarting changes nothing, because this is where a
# NEXT_PUBLIC_ value is decided.
ARG NEXT_PUBLIC_TELEGRAM_APP
# Which deployment this is, so a tab left open across one can tell.
#
# Next stamps it onto every asset URL and onto navigation responses; when the
# client sees a response from a different id than its own it does a full reload
# instead of a client-side navigation. Without it, a stale tab keeps calling
# Server Actions by ids that the new build renamed, and the server answers
# "Failed to find Server Action" for every one - a flood in the logs, and a
# window that quietly does nothing when clicked.
#
# Build-time, like the NEXT_PUBLIC_* values above and for the same reason: it is
# baked into the client bundle. Left unset the app builds and runs exactly as
# before, which is what keeps `docker build` by hand working.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_TELEGRAM_APP=$NEXT_PUBLIC_TELEGRAM_APP
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
