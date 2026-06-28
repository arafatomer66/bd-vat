import { prisma } from "../prisma.js";

/**
 * Notification boundary (email / SMS). No provider is wired by default, so the
 * `ConsoleNotificationAdapter` logs the message and records it. A real adapter
 * (SMTP / Twilio / local SMS gateway) drops in behind the same interface.
 */
export interface NotificationMessage {
  channel: "EMAIL" | "SMS";
  recipient: string;
  subject?: string;
  body: string;
}

export interface NotificationAdapter {
  send(tenantId: string, msg: NotificationMessage): Promise<{ status: "SENT" | "LOGGED" }>;
}

export class ConsoleNotificationAdapter implements NotificationAdapter {
  async send(tenantId: string, msg: NotificationMessage) {
    // eslint-disable-next-line no-console
    console.log(`[notify:${msg.channel}] -> ${msg.recipient}: ${msg.subject ?? ""} ${msg.body}`);
    await prisma.notificationLog.create({
      data: {
        tenantId,
        channel: msg.channel,
        recipient: msg.recipient,
        subject: msg.subject,
        body: msg.body,
        status: "LOGGED",
      },
    });
    return { status: "LOGGED" as const };
  }
}

export function getNotificationAdapter(): NotificationAdapter {
  return new ConsoleNotificationAdapter();
}
