# One image, two entry points — the API and the worker share every dependency
# and all the pipeline code, so building them separately would just be the same
# 500 MB twice. docker-compose picks between them with `command:`.

# ── build ─────────────────────────────────────────────────────────────────────
FROM node:24-slim AS builder
WORKDIR /app

# Deps first, so a source-only change doesn't re-run the install layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

# Must happen *here*, not on the host: the client is generated for the platform
# it's generated on, and `.dockerignore` deliberately excludes the host's
# src/generated so the Windows engine can't shadow the Linux one.
#
# The placeholder URL is not a shortcut. `prisma.config.ts` resolves
# env("DATABASE_URL") when the config loads and throws if it's absent, but
# generation itself reads only the schema and never opens a connection — so any
# syntactically valid URL satisfies it. Passing the real Atlas credentials here
# would bake them into the build cache for no benefit whatsoever; the running
# container gets the genuine DATABASE_URL from its environment.
RUN DATABASE_URL="mongodb://placeholder:27017/placeholder" npx prisma generate

# tsc, then copy-prisma-assets.ts moves the native query engine into build/ —
# tsc alone emits only the TypeScript half of the generated client.
RUN npm run build

# ── runtime ───────────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build

# Needed at runtime, not just build time: src/api/server.ts runs the database
# bootstrap before binding its port, and that shells out to `prisma db push`.
# The Prisma CLI reads these two directly — schema.prisma for the model
# definitions, prisma.config.ts for the datasource URL and migrations path.
# Neither is a .ts file tsc would have carried into build/, and
# prisma.config.ts is explicitly tsconfig-excluded besides. Copied
# unconditionally because api and worker share this one image; only the api
# entry point actually reads them.
COPY prisma.config.ts ./prisma.config.ts
COPY prisma ./prisma

# multer writes to `path.join(process.cwd(), "uploads")`, and the job payload
# carries that absolute path to the worker — so this must exist, and api and
# worker must mount the *same* volume here or the worker gets a filePath it
# cannot open. WORKDIR is /app in both, so both resolve /app/uploads.
RUN mkdir -p uploads && chown -R node:node /app

USER node

# No CMD: docker-compose supplies `node build/api/server.js` or
# `node build/worker.js`. Leaving it unset makes a bare `docker run` fail loudly
# rather than silently starting whichever half happened to be the default.
