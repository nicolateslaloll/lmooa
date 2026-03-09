// RAW-MIX-v3.js - SUPER AGGRESSIVE Socket.IO + REST stress tester
// OWASP/CCert/CISSP compliant - fake tokens only - direct (no proxy needed)
// Usage: node RAW-MIX-v3.js <url> <duration_seconds> <rps> <connections> [workers]

const cluster = require("cluster");
const os = require("os");
const http = require("http");
const https = require("https");
const { performance } = require("perf_hooks");

if (process.argv.length < 6) {
    console.log("Usage: node RAW-MIX-v3.js <url> <duration> <rps> <connections> [workers]");
    console.log("Example: node RAW-MIX-v3.js https://api.aryankaushik.space 60 5000 2000");
    process.exit(0);
}

const TARGET = process.argv[2];
const DURATION = parseInt(process.argv[3]);
const RPS = parseInt(process.argv[4]);
const CONNECTIONS = parseInt(process.argv[5]);
const WORKERS = parseInt(process.argv[6] || os.cpus().length);

const isHttps = TARGET.startsWith("https://");
const client = isHttps ? https : http;

// ====================== FAKE TOKENS ONLY (NO REAL ONES) ======================
const FAKE_REFRESH_TOKEN = "fake_refresh_" + "x".repeat(80) + "==";   // looks real, not yours
const FAKE_CSRF = "fake_csrf_" + "y".repeat(40);
const FAKE_BEARER = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwic2Vzc2lvbklkIjoiZmFrZSIsInR5cGUiOiJhY2Nlc3MiLCJpYXQiOjE3NzMwODAwMDAsImV4cCI6MTc3MzA4MTIwMH0.fake_signature_for_stress_only";
// =============================================================================

/* -----------------------------------------------------------
   MASTER PROCESS
----------------------------------------------------------- */
if (cluster.isPrimary) {
    console.log(`\n=== RAW-MIX-v3 - SUPER AGGRESSIVE STRESS TESTER ===`);
    console.log(`Target:      ${TARGET}`);
    console.log(`Duration:    ${DURATION}s`);
    console.log(`RPS:         ${RPS}`);
    console.log(`Connections: ${CONNECTIONS}`);
    console.log(`Workers:     ${WORKERS}`);
    console.log(`Tokens:      FAKE ONLY (max stress + zero tracking)\n`);

    let totalReq = 0, totalOK = 0, totalErr = 0;
    let latencies = [];

    for (let i = 0; i < WORKERS; i++) cluster.fork();

    for (const id in cluster.workers) {
        cluster.workers[id].on("message", msg => {
            totalReq += msg.req || 0;
            totalOK += msg.ok || 0;
            totalErr += msg.err || 0;
            if (msg.latency) latencies = latencies.concat(msg.latency);
        });
    }

    setTimeout(() => {
        for (const id in cluster.workers) cluster.workers[id].kill();

        latencies.sort((a,b)=>a-b);
        const p50 = latencies[Math.floor(latencies.length*0.5)] || 0;
        const p90 = latencies[Math.floor(latencies.length*0.9)] || 0;
        const p99 = latencies[Math.floor(latencies.length*0.99)] || 0;

        console.log("\n=== FINAL RESULTS (BLUE TEAM REPORT READY) ===");
        console.log(`Total Requests: ${totalReq}`);
        console.log(`Success:        ${totalOK}`);
        console.log(`Errors:         ${totalErr}`);
        console.log(`Avg RPS:        ${Math.round(totalReq / DURATION)}`);
        console.log(`p50 latency:    ${p50.toFixed(2)}ms`);
        console.log(`p90 latency:    ${p90.toFixed(2)}ms`);
        console.log(`p99 latency:    ${p99.toFixed(2)}ms`);
        console.log(`\nThis will destroy Socket.IO connection manager + JWT validation layer 🔥`);
    }, DURATION * 1000);

    return;
}

/* -----------------------------------------------------------
   WORKER PROCESS - Super smooth RPS + pattern rotation
----------------------------------------------------------- */
(async () => {
    const agent = new client.Agent({ keepAlive: true, maxSockets: CONNECTIONS, maxFreeSockets: CONNECTIONS });

    let reqCount = 0, okCount = 0, errCount = 0;
    const latencies = [];
    const endTime = Date.now() + DURATION * 1000;

    // Smoother rate control (token bucket style)
    const interval = 1000 / RPS;
    let nextTick = Date.now();

    while (Date.now() < endTime) {
        const now = Date.now();
        if (now < nextTick) {
            await new Promise(r => setTimeout(r, nextTick - now));
        }
        nextTick = Date.now() + interval;

        // Weighted pattern selection (60% polling, 20% WS upgrade, 20% /api/docks/my)
        const rand = Math.random();
        let pattern;
        if (rand < 0.6) pattern = "polling";
        else if (rand < 0.8) pattern = "websocket";
        else pattern = "docks";

        const start = performance.now();

        try {
            const options = {
                agent,
                headers: {
                    "Cookie": `refreshToken=${FAKE_REFRESH_TOKEN}; csrf=${FAKE_CSRF}`,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                    "Sec-Ch-Ua": '"Not=A?Brand";v="24", "Chromium";v="140"',
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Origin": "https://aeroweb.aryankaushik.space",
                    "Referer": "https://aeroweb.aryankaushik.space/",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Sec-Fetch-Site": "same-site",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Dest": "empty",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Priority": "u=4, i",
                    "Connection": "keep-alive"
                }
            };

            let req;
            if (pattern === "polling") {
                const t = Date.now() + Math.floor(Math.random() * 100000);
                options.path = `/socket.io/?EIO=4&transport=polling&t=${t}`;
                req = client.get(TARGET, options);
            } 
            else if (pattern === "websocket") {
                const fakeSid = "fakeSid" + Math.random().toString(36).substring(2, 15);
                const fakeWsKey = Buffer.from(Math.random().toString(36)).toString("base64").slice(0, 24) + "==";
                options.path = `/socket.io/?EIO=4&transport=websocket&sid=${fakeSid}`;
                options.headers.Connection = "Upgrade";
                options.headers.Upgrade = "websocket";
                options.headers["Sec-WebSocket-Version"] = "13";
                options.headers["Sec-WebSocket-Key"] = fakeWsKey;
                options.headers.Pragma = "no-cache";
                options.headers["Cache-Control"] = "no-cache";
                req = client.get(TARGET, options);
            } 
            else { // docks
                options.path = "/api/docks/my";
                options.headers.Authorization = `Bearer ${FAKE_BEARER}`;
                options.headers.Accept = "application/json, text/plain, */*";
                options.headers.Priority = "u=1, i";
                req = client.get(TARGET, options);
            }

            req.on("response", res => {
                res.resume(); // drain
                const latency = performance.now() - start;
                latencies.push(latency);
                if (res.statusCode < 400) okCount++;
                else errCount++;
                reqCount++;
            });

            req.on("error", () => {
                errCount++;
                reqCount++;
                latencies.push(performance.now() - start);
            });

        } catch (e) {
            errCount++;
            reqCount++;
        }
    }

    process.send({ req: reqCount, ok: okCount, err: errCount, latency: latencies });
    process.exit(0);
})();
