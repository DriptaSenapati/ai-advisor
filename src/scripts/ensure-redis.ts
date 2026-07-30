/**
 * Brings Redis up before the API and worker start, so `npm run dev:all` is a
 * single command rather than "docker compose up" in one terminal and two
 * `npm run dev:*` in others.
 *
 *   npm run dev:redis          # on its own
 *   npm run dev:all            # runs this first, then api + worker
 *
 * Pings REDIS_URL first and exits immediately if something already answers —
 * a natively installed Redis, Memurai, or one inside WSL is just as good as the
 * container, and forcing Docker on someone who doesn't need it would be rude.
 * Only when nothing answers does it reach for docker compose.
 */

import "../envConfig.js";
import { spawn } from "node:child_process";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const log = (msg: string) => console.log(`[redis] ${msg}`);
const fail = (msg: string): never => {
    console.error(`[redis] ${msg}`);
    process.exit(1);
};

/** One PING attempt. Never throws — an unreachable Redis is the normal case here. */
async function ping(timeoutMs = 1500): Promise<boolean> {
    const client = new Redis(REDIS_URL, {
        lazyConnect: true,
        connectTimeout: timeoutMs,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // one shot; we run our own poll loop
    });
    // ioredis emits 'error' on an unreachable host, and an unhandled 'error'
    // event takes the process down with it.
    client.on("error", () => {});
    try {
        await client.connect();
        return (await client.ping()) === "PONG";
    } catch {
        return false;
    } finally {
        client.disconnect();
    }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Polls until Redis answers or the budget runs out. */
async function waitForRedis(seconds: number): Promise<boolean> {
    const deadline = Date.now() + seconds * 1000;
    while (Date.now() < deadline) {
        if (await ping()) return true;
        await sleep(1000);
    }
    return false;
}

/**
 * Runs a command to completion, inheriting stdio so docker's own output shows.
 * No `shell: true` — docker is a real .exe, so Windows resolves it without one,
 * and shelling out just earns a DEP0190 warning about unescaped arguments.
 */
function run(cmd: string, args: string[], quiet = false): Promise<number> {
    return new Promise(resolve => {
        const child = spawn(cmd, args, {
            stdio: quiet ? "ignore" : "inherit",
        });
        child.on("error", () => resolve(1));
        child.on("close", code => resolve(code ?? 1));
    });
}

async function dockerReady(): Promise<boolean> {
    return (await run("docker", ["info"], true)) === 0;
}

/**
 * `--check-only` verifies Redis is reachable and never tries to start anything.
 * That's the right behaviour for a production start: Redis there is managed or
 * a sibling container, and a server's start command has no business launching
 * Docker Desktop. It exists because the alternative is worse — with no Redis
 * both processes come up fine and then spam ECONNREFUSED indefinitely without
 * ever exiting, so the deployment looks healthy while nothing works.
 */
const checkOnly = process.argv.includes("--check-only");

async function main() {
    if (await ping()) {
        log(`up at ${REDIS_URL}`);
        return;
    }

    if (checkOnly) {
        fail(
            `no Redis at ${REDIS_URL}.\n` +
                "        Check REDIS_URL and that the instance is reachable from this host.\n" +
                "        (In development, `npm run dev:redis` will start one for you.)"
        );
    }

    log(`nothing answering at ${REDIS_URL} — starting the container`);

    if (!(await dockerReady())) {
        log("docker daemon isn't running — starting Docker Desktop");
        // `docker desktop start` ships with Docker Desktop 4.37+; on Linux, where
        // the daemon is a service, this fails fast and the message below applies.
        if ((await run("docker", ["desktop", "start"])) !== 0) {
            fail(
                "couldn't start the docker daemon.\n" +
                    "        Start Docker Desktop (or `sudo systemctl start docker`) and re-run,\n" +
                    "        or point REDIS_URL at a Redis you're running yourself."
            );
        }
        // The CLI returns before the engine finishes booting.
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline && !(await dockerReady())) await sleep(2000);
        if (!(await dockerReady())) fail("docker daemon didn't come up within 2 minutes.");
        log("docker daemon ready");
    }

    // `redis` is named explicitly and must stay that way: compose also defines
    // `api` and `worker`, and a bare `up` would start those containers too —
    // which then fight the host's `npm run dev:api` for port 3001.
    if ((await run("docker", ["compose", "up", "-d", "--wait", "redis"])) !== 0) {
        fail("`docker compose up redis` failed — see the output above.");
    }

    // --wait already gates on the container healthcheck; this covers the gap
    // between the container being healthy and the published port being usable.
    if (!(await waitForRedis(30))) {
        fail(`container is up but ${REDIS_URL} still isn't answering. Check REDIS_URL and the port mapping.`);
    }

    log(`up at ${REDIS_URL}`);
}

main().catch(err => fail(String(err)));
