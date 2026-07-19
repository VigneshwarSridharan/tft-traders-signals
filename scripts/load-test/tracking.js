#!/usr/bin/env node
// Scanner-storm load test for the public tracking endpoints (/o/:token.gif,
// /c/:token). Simulates the worst realistic case — a security scanner or bot
// hammering these unauthenticated, high-volume endpoints — since that's
// exactly what TRACKING_RATE_LIMIT_MAX/WINDOW_MS and the bot-heuristics
// pipeline exist to survive without falling over.
//
// Usage:
//   node scripts/load-test/tracking.js [--url http://localhost:3000] [--duration 30] [--connections 50]
//
// Acceptance target (docs/TASKS.md Task 24): p95 < 100ms.
//
// The endpoints respond 200/302 regardless of whether the token is real
// (an unknown token just means no tracking event gets enqueued — see
// TrackingController) — so this can run against garbage tokens without any
// DB seeding, which is also the realistic scanner-storm shape.
const autocannon = require('autocannon');

function parseArgs(argv) {
  const args = { url: 'http://localhost:3000', duration: 20, connections: 50 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') args.url = argv[++i];
    else if (arg === '--duration') args.duration = Number(argv[++i]);
    else if (arg === '--connections') args.connections = Number(argv[++i]);
  }
  return args;
}

function randomToken() {
  return Math.random().toString(36).slice(2, 18);
}

async function runScenario(name, opts) {
  console.log(`\n--- ${name} ---`);
  const result = await autocannon(opts);
  // autocannon doesn't expose an exact p95 bucket — p97_5 is the nearest one
  // it reports, and using it as the acceptance-criteria proxy is a strictly
  // tighter bound than p95, so passing it implies p95 passes too.
  const { p50, p97_5: p97point5, p99, mean } = result.latency;
  console.log(
    `requests: ${result.requests.total}, 2xx/3xx: ${result['2xx'] + result['3xx']}, errors: ${result.errors}, timeouts: ${result.timeouts}`,
  );
  console.log(
    `latency ms — mean: ${mean}, p50: ${p50}, p97.5: ${p97point5}, p99: ${p99}`,
  );
  if (p97point5 >= 100) {
    console.warn(
      `WARNING: p97.5 latency (${p97point5}ms) exceeds the 100ms p95 target for tracking endpoints.`,
    );
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await runScenario('open pixel (/o/:token.gif) scanner storm', {
    url: `${args.url}/o/${randomToken()}.gif`,
    connections: args.connections,
    duration: args.duration,
    setupClient: (client) => {
      client.setHeaders({ 'user-agent': 'load-test-scanner/1.0' });
    },
    requests: [{ setupRequest: (req) => ({ ...req, path: `/o/${randomToken()}.gif` }) }],
  });

  await runScenario('click redirect (/c/:token) scanner storm', {
    url: `${args.url}/c/${randomToken()}`,
    connections: args.connections,
    duration: args.duration,
    requests: [{ setupRequest: (req) => ({ ...req, path: `/c/${randomToken()}` }) }],
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
