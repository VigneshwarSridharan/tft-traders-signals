import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';

export interface ConnectionCredentials {
  email: string;
  password: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}

export interface ConnectionCheckResult {
  ok: boolean;
  message: string;
}

export interface VerifyResult {
  smtp: ConnectionCheckResult;
  imap: ConnectionCheckResult;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown connection error';
}

@Injectable()
export class MailConnectionTester {
  private readonly logger = new Logger(MailConnectionTester.name);

  async verify(credentials: ConnectionCredentials): Promise<VerifyResult> {
    const [smtp, imap] = await Promise.all([
      this.verifySmtp(credentials),
      this.verifyImap(credentials),
    ]);
    return { smtp, imap };
  }

  private async verifySmtp(
    credentials: ConnectionCredentials,
  ): Promise<ConnectionCheckResult> {
    const transporter = nodemailer.createTransport({
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpPort === 465,
      auth: { user: credentials.email, pass: credentials.password },
      connectionTimeout: 10_000,
    });
    try {
      await transporter.verify();
      return { ok: true, message: 'SMTP login succeeded' };
    } catch (error) {
      this.logger.warn(
        `SMTP verification failed for sender account ${credentials.email}: ${toErrorMessage(error)}`,
      );
      return { ok: false, message: toErrorMessage(error) };
    } finally {
      transporter.close();
    }
  }

  private async verifyImap(
    credentials: ConnectionCredentials,
  ): Promise<ConnectionCheckResult> {
    const client = new ImapFlow({
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: true,
      auth: { user: credentials.email, pass: credentials.password },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    try {
      await client.connect();
      return { ok: true, message: 'IMAP login succeeded' };
    } catch (error) {
      this.logger.warn(
        `IMAP verification failed for sender account ${credentials.email}: ${toErrorMessage(error)}`,
      );
      return { ok: false, message: toErrorMessage(error) };
    } finally {
      if (client.usable) {
        await client.logout().catch(() => undefined);
      } else {
        client.close();
      }
    }
  }
}
