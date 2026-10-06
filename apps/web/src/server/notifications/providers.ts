import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import webpush from "web-push";
import { emailHtml } from "./templates";

/** Thrown for failures that retrying won't fix (e.g. an expired push subscription). */
export class PermanentDeliveryError extends Error {}

export type Providers = {
  email(to: string, subject: string, text: string, link: string | null): Promise<void>;
  sms(to: string, text: string): Promise<void>;
  push(sub: { endpoint: string; p256dh: string; auth: string }, payload: { title: string; body: string; link: string | null }): Promise<void>;
};

const log = (channel: string) => async (...args: unknown[]) => {
  console.info(`[${channel}:log]`, ...args.map((a) => (typeof a === "string" ? a.slice(0, 200) : a)));
};

function emailProvider(): Providers["email"] {
  if (process.env.EMAIL_PROVIDER !== "ses") return log("email");
  const ses = new SESv2Client({});
  const from = process.env.EMAIL_FROM ?? "VITICO Wholesale <no-reply@example.com>";
  return async (to, subject, text, link) => {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: emailHtml(subject, text, link), Charset: "UTF-8" } },
          },
        },
        ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
      }),
    );
  };
}

function smsProvider(): Providers["sms"] {
  const kind = process.env.SMS_PROVIDER;
  if (kind === "sns") {
    const sns = new SNSClient({});
    return async (to, text) => {
      await sns.send(
        new PublishCommand({
          PhoneNumber: to,
          Message: text,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
            ...(process.env.SMS_SENDER_ID && { "AWS.SNS.SMS.SenderID": { DataType: "String", StringValue: process.env.SMS_SENDER_ID } }),
          },
        }),
      );
    };
  }
  if (kind === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM!;
    return async (to, text) => {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ To: to, From: from, Body: text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 400) throw new PermanentDeliveryError(`Twilio rejected: ${await res.text()}`);
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
    };
  }
  return log("sms");
}

export const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

function pushProvider(): Providers["push"] {
  if (!pushConfigured()) return log("push");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return async (sub, payload) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 86_400 });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) throw new PermanentDeliveryError("Push subscription expired");
      throw e;
    }
  };
}

export function defaultProviders(): Providers {
  return { email: emailProvider(), sms: smsProvider(), push: pushProvider() };
}
