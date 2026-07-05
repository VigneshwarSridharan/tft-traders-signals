import { validateEnv } from './config/env.validation';

validateEnv(process.env);

console.log(
  'Worker process started. Send-queue and inbound-mail processing land in later tasks (see docs/TASKS.md).',
);

// Keep the process alive so the container stays up until real job processing is added.
setInterval(() => {}, 1 << 30);
