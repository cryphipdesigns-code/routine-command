import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import webpush from "npm:web-push@3.6.7";
import { notificationCandidates, notificationClock, type AccountabilityNotice } from "../../../src/domain/notifications.ts";
import type { AppState } from "../../../src/types.ts";

const appUrl = "https://cryphipdesigns-code.github.io/routine-command/";
const allowedOrigins = new Set([new URL(appUrl).origin, "http://127.0.0.1:4175", "http://localhost:4175"]);
const database = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const publicKey = Deno.env.get("ROUTINE_PUSH_PUBLIC_KEY");
const privateKey = Deno.env.get("ROUTINE_PUSH_PRIVATE_KEY");
const cronSecret = Deno.env.get("ROUTINE_PUSH_CRON_SECRET");

type SubscriptionRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; created_at: string };

function validEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      (url.hostname === "fcm.googleapis.com" || url.hostname.endsWith(".push.apple.com") || url.hostname === "updates.push.services.mozilla.com" || url.hostname.endsWith(".push.services.mozilla.com") || url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : new URL(appUrl).origin, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" };
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return respond({ error: "Origin not allowed" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond({ error: "Use POST" }, 405);
  try {
    const body = await request.json();
    if (body.action === "config") return respond({ configured: Boolean(publicKey && privateKey && cronSecret), publicKey: publicKey ?? null });
    if (!publicKey || !privateKey || !cronSecret) return respond({ error: "Push service is being configured" }, 503);
    if (body.action === "scheduled") {
      if (request.headers.get("x-routine-cron-secret") !== cronSecret) return respond({ error: "Unauthorized" }, 401);
      return respond(await dispatch());
    }
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Sign in to use push notifications" }, 401);
    const { data: { user }, error: authError } = await database.auth.getUser(token);
    if (authError || !user) return respond({ error: "Sign in again to use push notifications" }, 401);

    if (body.action === "subscribe") {
      const subscription = body.subscription;
      if (!validEndpoint(subscription?.endpoint) || !/^[A-Za-z0-9_-]{87}=?$/.test(subscription?.keys?.p256dh ?? "") || !/^[A-Za-z0-9_-]{22}(==)?$/.test(subscription?.keys?.auth ?? "")) return respond({ error: "Invalid push subscription" }, 400);
      const { error } = await database.from("routine_command_push_subscriptions").upsert({ user_id: user.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }, { onConflict: "endpoint" });
      if (error) throw error;
      return respond({ subscribed: true });
    }
    if (body.action === "unsubscribe") {
      const { error } = await database.from("routine_command_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", String(body.endpoint ?? ""));
      if (error) throw error;
      return respond({ unsubscribed: true });
    }
    if (body.action === "dispatch") return respond(await dispatch(user.id));
    if (body.action === "test") {
      const { data, error } = await database.from("routine_command_push_subscriptions").select("*").eq("user_id", user.id).eq("endpoint", String(body.endpoint ?? "")).single();
      if (error || !data) return respond({ error: "Enable notifications on this device first" }, 400);
      // A 60-second key limits accidental repeated test taps using the same quota.
      const today = notificationClock(new Date(), String(body.timezone ?? "America/Los_Angeles")).localDate;
      const result = await send(data, { key: `test:${Math.floor(Date.now() / 60000)}`, kind: "evening", localDate: today, title: "Routine Command is on watch", body: "Push is working. The next move is yours. Open the app and put one honest check on the board.", challenge: "", quote: null, remaining: 0 }, today);
      if (result === "sent") return respond({ sent: true });
      if (result === "expired") return respond({ error: "This device subscription expired. Enable this device again, then send a test." }, 400);
      if (result === "failed") return respond({ error: "The push provider could not accept the test. Wait a moment and try again." }, 502);
      return respond({ error: "Daily notification limit reached, or this test was already sent. Try again later." }, 429);
    }
    return respond({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("Routine Command push request failed", error instanceof Error ? error.name : "database error");
    return respond({ error: "Push service could not complete this request. Your habit data is safe; try again." }, 500);
  }
});

async function dispatch(userId?: string): Promise<{ sent: number }> {
  let query = database.from("routine_command_push_subscriptions").select("*");
  if (userId) query = query.eq("user_id", userId);
  const { data: subscriptions, error } = await query;
  if (error) throw error;
  const grouped = new Map<string, SubscriptionRow[]>();
  for (const subscription of subscriptions ?? []) grouped.set(subscription.user_id, [...(grouped.get(subscription.user_id) ?? []), subscription]);
  let sent = 0;
  for (const [id, devices] of grouped) {
    const { data, error: stateError } = await database.from("routine_command_states").select("state").eq("user_id", id).maybeSingle();
    if (stateError) throw stateError;
    if (!data) continue;
    const state = data.state as AppState;
    const now = new Date();
    const today = notificationClock(now, state.settings.timezone).localDate;
    const candidates = notificationCandidates(state, now);
    for (const device of devices) for (const notice of candidates) {
      if (notice.eventAt && Date.parse(notice.eventAt) < Date.parse(device.created_at)) continue;
      if (await send(device, notice, today) === "sent") sent++;
    }
  }
  return { sent };
}

async function send(subscription: SubscriptionRow, notice: AccountabilityNotice, quotaDate: string): Promise<"sent" | "limited" | "failed" | "expired"> {
  if (!validEndpoint(subscription.endpoint)) return "expired";
  const { data: claimed, error } = await database.rpc("routine_command_claim_push", { p_subscription_id: subscription.id, p_key: notice.key, p_local_date: quotaDate });
  if (error) throw error;
  if (!claimed) return "limited";
  const url = new URL(appUrl);
  url.searchParams.set("date", notice.localDate);
  if (notice.habitId) url.searchParams.set("habit", notice.habitId);
  const payload = JSON.stringify({ title: notice.title, body: notice.body, tag: notice.key, data: { url: url.href, remaining: notice.remaining, badgeEnabled: notice.badgeEnabled ?? false, kind: notice.kind } });
  let status = 0;
  try {
    const details = webpush.generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: notice.kind === "evening" ? 3600 : 3600 * 6, urgency: "normal", vapidDetails: { subject: "mailto:cryphipdesigns@gmail.com", publicKey: publicKey!, privateKey: privateKey! } });
    const response = await fetch(details.endpoint, { method: "POST", headers: details.headers, body: details.body, signal: AbortSignal.timeout(15000), redirect: "error" });
    status = response.status;
    if (status === 404 || status === 410) {
      await database.from("routine_command_push_subscriptions").delete().eq("id", subscription.id);
      return "expired";
    }
  } catch { status = 0; }
  const success = status >= 200 && status < 300;
  const { error: updateError } = await database.from("routine_command_push_deliveries").update({ status: success ? "sent" : "failed", sent_at: success ? new Date().toISOString() : null, error_code: success ? null : status }).eq("subscription_id", subscription.id).eq("notification_key", notice.key);
  if (updateError) throw updateError;
  return success ? "sent" : "failed";
}
