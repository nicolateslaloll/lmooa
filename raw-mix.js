// SAFE load tester with controlled concurrency + keep-alive
const cluster = require("cluster");
const os = require("os");
const http = require("http");
const https = require("https");
const { performance } = require("perf_hooks");

if (process.argv.length < 6) {
    console.log("Usage: node loadtest.js <url> <duration> <rps> <connections> [workers]");
    process.exit(0);
}

const TARGET = process.argv[2];
const DURATION = parseInt(process.argv[3]);
const RPS = parseInt(process.argv[4]);
const CONNECTIONS = parseInt(process.argv[5]);
const WORKERS = parseInt(process.argv[6] || os.cpus().length);

const isHttps = TARGET.startsWith("https://");
const client = isHttps ? https : http;

/* -----------------------------------------------------------
   MASTER PROCESS
----------------------------------------------------------- */
if (cluster.isPrimary) {
    console.log(`\n=== SAFE LOAD TESTER ===`);
    console.log(`Target:       ${TARGET}`);
    console.log(`Duration:     ${DURATION}s`);
    console.log(`RPS:          ${RPS}`);
    console.log(`Connections:  ${CONNECTIONS}`);
    console.log(`Workers:      ${WORKERS}\n`);

    let totalReq = 0;
    let totalOK = 0;
    let totalErr = 0;

    for (let i = 0; i < WORKERS; i++) cluster.fork();

    for (const id in cluster.workers) {
        cluster.workers[id].on("message", msg => {
            totalReq += msg.req;
            totalOK += msg.ok;
            totalErr += msg.err;
        });
    }

    setTimeout(() => {
        for (const id in cluster.workers) {
            cluster.workers[id].kill();
        }

        console.log("\n=== RESULTS ===");
        console.log(`Requests:   ${totalReq}`);
        console.log(`Success:    ${totalOK}`);
        console.log(`Errors:     ${totalErr}`);
        console.log(`Avg RPS:    ${Math.round(totalReq / DURATION)}\n`);

    }, DURATION * 1000);

    return;
}

/* -----------------------------------------------------------
   WORKER PROCESS
----------------------------------------------------------- */
(async () => {
    const agent = new client.Agent({
        keepAlive: true,
        maxSockets: CONNECTIONS,
        maxFreeSockets: CONNECTIONS
    });

    let reqCount = 0;
    let okCount = 0;
    let errCount = 0;

    const INTERVAL = 100;          // run every 100ms
    const PER_TICK = RPS / (1000 / INTERVAL);

    const end = Date.now() + DURATION * 1000;

    while (Date.now() < end) {
        const batch = [];

        for (let i = 0; i < PER_TICK; i++) {
            batch.push(
                new Promise(resolve => {
                    const req = client.get(
                        TARGET,
                        { agent },
                        res => {
                            res.on("data", () => {});
                            res.on("end", () => {
                                okCount++;
                                reqCount++;
                                resolve();
                            });
                        }
                    );

                    req.on("error", () => {
                        errCount++;
                        reqCount++;
                        resolve();
                    });
                })
            );
        }

        await Promise.all(batch);
        await new Promise(res => setTimeout(res, INTERVAL));
    }

    process.send({ req: reqCount, ok: okCount, err: errCount });
    process.exit(0);
})();
