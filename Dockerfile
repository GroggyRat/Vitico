# One image for the web app, the worker and the migration task:
#   web:     pnpm --filter @vitico/web start           (default)
#   worker:  pnpm --filter @vitico/web worker
#   migrate: pnpm --filter @vitico/db migrate:deploy
# Official Node image via AWS ECR Public (avoids Docker Hub rate limits in CI).
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/pricing/package.json packages/pricing/
# The db package generates the Prisma client on install, so it needs its schema first.
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @vitico/db generate && pnpm --filter @vitico/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@vitico/web", "start"]
