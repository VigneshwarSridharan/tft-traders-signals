import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect } from 'node:tls';

/**
 * Minimal inline-protocol PING (optionally preceded by AUTH), used only to
 * prove the Redis endpoint is reachable and answering — avoids pulling in a
 * redis/ioredis client just for a health check (BullMQ already brings its
 * own, isolated client).
 */
export function pingRedis(url: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    const parsed = new URL(url);
    const port = parsed.port ? Number(parsed.port) : 6379;
    const host = parsed.hostname;
    const socket: Socket =
      parsed.protocol === 'rediss:'
        ? tlsConnect({ host, port })
        : netConnect({ host, port });

    const timer = setTimeout(() => finish(false), timeoutMs);

    socket.on('connect', () => {
      if (parsed.password) {
        const authCmd = parsed.username
          ? `AUTH ${parsed.username} ${parsed.password}\r\n`
          : `AUTH ${parsed.password}\r\n`;
        socket.write(authCmd);
      }
      socket.write('PING\r\n');
    });
    socket.on('data', (data) => {
      buffer += data.toString('utf8');
      if (buffer.includes('+PONG')) finish(true);
    });
    socket.on('error', () => finish(false));
  });
}
