"use client";

import { useActionState, useEffect, useState } from "react";
import { changePasswordAction, savePreferencesAction, saveProfileAction, subscribePushAction, unsubscribePushAction } from "@/app/me-actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";

export function ProfileForm({ name, email, phone }: { name: string; email: string; phone: string }) {
  const [state, action] = useActionState(saveProfileAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" htmlFor="pf-name" error={e.name}>
          <Input id="pf-name" name="name" defaultValue={name} required />
        </Field>
        <Field label="Email" htmlFor="pf-email" hint="Contact VITICO to change your sign-in email.">
          <Input id="pf-email" value={email} disabled readOnly />
        </Field>
        <Field label="Mobile (for SMS)" htmlFor="pf-phone" error={e.phone} hint="International format, e.g. +679 912 3456">
          <Input id="pf-phone" name="phone" type="tel" defaultValue={phone} />
        </Field>
      </div>
      <SubmitButton size="sm">Save</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" htmlFor="pw-current" error={e.currentPassword}>
          <Input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="New password" htmlFor="pw-new" error={e.password} hint="At least 10 characters, with a letter and a number.">
          <Input id="pw-new" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={e.confirmPassword}>
          <Input id="pw-confirm" name="confirmPassword" type="password" autoComplete="new-password" required />
        </Field>
      </div>
      <SubmitButton size="sm">Change password</SubmitButton>
    </form>
  );
}

export function PreferencesForm({ rows, labels, smsAvailable }: { rows: { category: string; email: boolean; sms: boolean; push: boolean }[]; labels: Record<string, string>; smsAvailable: boolean }) {
  const [state, action] = useActionState(savePreferencesAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th className="py-1 text-left font-medium">Notify me about</th>
            <th className="w-20 py-1 font-medium">Email</th>
            <th className="w-20 py-1 font-medium">SMS</th>
            <th className="w-20 py-1 font-medium">Push</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} className="border-t border-line">
              <td className="py-2">{labels[r.category]}</td>
              {(["email", "sms", "push"] as const).map((ch) => (
                <td key={ch} className="py-2 text-center">
                  <input
                    type="checkbox"
                    name={`${r.category}.${ch}`}
                    defaultChecked={r[ch]}
                    disabled={ch === "sms" && !smsAvailable}
                    aria-label={`${labels[r.category]} by ${ch}`}
                    className="accent-brand-600"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!smsAvailable && <p className="text-xs text-ink-muted">Add your mobile number above to get SMS.</p>}
      <p className="text-xs text-ink-muted">In-app notifications (the bell) are always on. Invites and password resets are always emailed.</p>
      <SubmitButton size="sm">Save notification settings</SubmitButton>
    </form>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Turns browser push notifications on/off for this device. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("busy");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: typeof status;
      if (!vapidPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        try {
          const reg = await navigator.serviceWorker.register("/sw.js");
          next = (await reg.pushManager.getSubscription()) ? "on" : "off";
        } catch {
          next = "unsupported";
        }
      }
      if (!cancelled) setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!) });
      const res = await subscribePushAction(sub.toJSON());
      setStatus(res.ok ? "on" : "off");
    } catch {
      setStatus(Notification.permission === "denied" ? "denied" : "off");
    }
  }

  async function disable() {
    setStatus("busy");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await unsubscribePushAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus("off");
  }

  if (status === "unsupported") return <p className="text-sm text-ink-muted">Push notifications aren&apos;t available in this browser.</p>;
  if (status === "denied") return <p className="text-sm text-ink-muted">Notifications are blocked for this site in your browser settings.</p>;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>{status === "on" ? "Push notifications are on for this device." : "Get alerts on this device even when VITICO isn't open."}</span>
      {status === "on" ? (
        <Button size="sm" variant="secondary" onClick={disable}>
          Turn off
        </Button>
      ) : (
        <Button size="sm" onClick={enable} disabled={status === "busy"}>
          Turn on
        </Button>
      )}
    </div>
  );
}
