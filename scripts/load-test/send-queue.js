#!/usr/bin/env node
// Send-queue throughput test: enqueues a burst of real sends through the
// public REST API (Task 23), then polls until every message reaches a
// terminal status, measuring end-to-end enqueue→terminal-status throughput
// for the BullMQ send worker.
//
// This exercises the real pipeline (rate limiting, SMTP handoff, retries),
// so point it at a sender account backed by GreenMail
// (docker-compose's `greenmail` service) — never at a real Zoho account,
// this will generate real outbound mail otherwise.
//
// Prerequisites (create once via the dashboard or public API):
//   - An API key with the "send" and "read:messages" scopes
//   - A sender account (ideally GreenMail-backed) and at least one customer
//
// Usage:
//   TFT_API_URL=http://localhost:3000 \
//   TFT_API_KEY=sk_... \
//   TFT_SENDER_ACCOUNT_ID=... \
//   TFT_CUSTOMER_ID=... \
//   node scripts/load-test/send-queue.js [--count 200] [--concurrency 20] [--poll-timeout-ms 60000]

function parseArgs(argv) {
  const args = { count: 200, concurrency: 20, pollTimeoutMs: 60_000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--count') args.count = Number(argv[++i]);
    else if (arg === '--concurrency') args.concurrency = Number(argv[++i]);
    else if (arg === '--poll-timeout-ms') args.pollTimeoutMs = Number(argv[++i]);
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function sendOne(apiUrl, apiKey, senderAccountId, customerId, index) {
  const res = await fetch(`${apiUrl}/v1/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      senderAccountId,
      customerIds: [customerId],
      subject: `Load test ${index} — ${new Date().toISOString()}`,
      bodyHtml: `<p>Load test message ${index}.</p>`,
      trackingEnabled: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`send #${index} failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const result = body.results[0];
  if (!result.ok || !result.messageId) {
    throw new Error(`send #${index} rejected: ${result.error ?? 'unknown error'}`);
  }
  return result.messageId;
}

async function pollUntilTerminal(apiUrl, apiKey, messageId, timeoutMs) {
  const terminal = new Set(['sent', 'delivered', 'bounced', 'failed']);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${apiUrl}/v1/messages/${messageId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const body = await res.json();
      if (terminal.has(body.status)) return { id: messageId, status: body.status };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { id: messageId, status: 'timeout' };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiUrl = process.env.TFT_API_URL ?? 'http://localhost:3000';
  const apiKey = requireEnv('TFT_API_KEY');
  const senderAccountId = requireEnv('TFT_SENDER_ACCOUNT_ID');
  const customerId = requireEnv('TFT_CUSTOMER_ID');

  console.log(`Enqueueing ${args.count} sends (concurrency ${args.concurrency})...`);
  const enqueueStart = Date.now();
  const messageIds = await runWithConcurrency(
    Array.from({ length: args.count }, (_, i) => i),
    args.concurrency,
    (index) => sendOne(apiUrl, apiKey, senderAccountId, customerId, index),
  );
  const enqueueMs = Date.now() - enqueueStart;
  console.log(
    `Enqueued ${messageIds.length} messages in ${enqueueMs}ms (${(messageIds.length / (enqueueMs / 1000)).toFixed(1)} req/s).`,
  );

  console.log('Polling for terminal status...');
  const drainStart = Date.now();
  const results = await runWithConcurrency(
    messageIds,
    args.concurrency,
    (id) => pollUntilTerminal(apiUrl, apiKey, id, args.pollTimeoutMs),
  );
  const drainMs = Date.now() - drainStart;

  const byStatus = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\nDrained in ${drainMs}ms.`);
  console.log('Status breakdown:', byStatus);
  console.log(
    `End-to-end throughput: ${(args.count / ((enqueueMs + drainMs) / 1000)).toFixed(1)} messages/s`,
  );

  if (byStatus.timeout) {
    console.warn(
      `WARNING: ${byStatus.timeout} message(s) did not reach a terminal status within ${args.pollTimeoutMs}ms — the send queue may be falling behind under this load.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
