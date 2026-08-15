# syntax=docker/dockerfile:1
#
# PeopleNexa — multi-stage build.
#   deps   : install all packages (incl. devDeps for prisma CLI + seed tooling)
#   build  : prisma generate + next build (standalone output)
#   runner : traced server + static assets + prisma CLI (for boot-time db push)
#
# Build-time DATABASE_URL is only needed because prisma.config.ts requires it
# to load; generate/build never connect to the database, so any dummy value
# works. The real URL is injected at runtime by docker-compose.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG DATABASE_URL=postgresql://build:build@localhost:5432/peoplenexa
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

# Traced production server + its pruned node_modules.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Prisma CLI + schema for `prisma db push` at boot, and the seed script
# (runs with tsx when SEED_DB=true).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/lib ./lib
COPY --from=build /app/generated ./generated
# Needed by tsx so the seed script can resolve the @/* path alias.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
