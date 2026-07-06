import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { MailConnectionTester } from './mail-connection-tester.service';

jest.mock('nodemailer');
jest.mock('imapflow');

describe('MailConnectionTester', () => {
  const credentials = {
    email: 'sales@company.com',
    password: 'app-password',
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    imapHost: 'imap.zoho.com',
    imapPort: 993,
  };

  it('reports both checks ok when SMTP and IMAP succeed', async () => {
    const verify = jest.fn().mockResolvedValue(true);
    const close = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      verify,
      close,
    });

    const connect = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn().mockResolvedValue(undefined);
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => ({
      connect,
      logout,
      usable: true,
      close: jest.fn(),
    }));

    const tester = new MailConnectionTester();
    const result = await tester.verify(credentials);

    expect(result.smtp.ok).toBe(true);
    expect(result.imap.ok).toBe(true);
    expect(verify).toHaveBeenCalled();
    expect(connect).toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it('surfaces a friendly failure message when SMTP auth fails', async () => {
    const verify = jest
      .fn()
      .mockRejectedValue(new Error('Invalid login or password'));
    const close = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      verify,
      close,
    });

    const connect = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn().mockResolvedValue(undefined);
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => ({
      connect,
      logout,
      usable: true,
      close: jest.fn(),
    }));

    const tester = new MailConnectionTester();
    const result = await tester.verify(credentials);

    expect(result.smtp.ok).toBe(false);
    expect(result.smtp.message).toContain('Invalid login or password');
    expect(result.imap.ok).toBe(true);
  });

  it('surfaces a friendly failure message when IMAP auth fails', async () => {
    const verify = jest.fn().mockResolvedValue(true);
    const close = jest.fn();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      verify,
      close,
    });

    const connect = jest
      .fn()
      .mockRejectedValue(new Error('AUTHENTICATIONFAILED'));
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => ({
      connect,
      logout: jest.fn(),
      usable: false,
      close: jest.fn(),
    }));

    const tester = new MailConnectionTester();
    const result = await tester.verify(credentials);

    expect(result.imap.ok).toBe(false);
    expect(result.imap.message).toContain('AUTHENTICATIONFAILED');
  });
});
