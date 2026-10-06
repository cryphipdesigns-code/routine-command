import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { TrackerStore } from "../state/store";
import type { AppState } from "../types";
import { CookieAuthStorage } from "./cookie-auth-storage";
import { appDirectoryUrl } from "./app-location";

export type SyncPhase =
  | "unconfigured"
  | "signed-out"
  | "sending-link"
  | "syncing"
  | "synced"
  | "error";

export interface CloudSyncSnapshot {
  phase: SyncPhase;
  email: string | null;
  message: string;
  lastSyncedAt: string | null;
}

type SyncListener = (snapshot: CloudSyncSnapshot) => void;

interface CloudStateRow {
  state: AppState;
  updated_at: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export class CloudSyncController {
  private readonly client: SupabaseClient | null;
  private readonly listeners = new Set<SyncListener>();
  private session: Session | null = null;
  private applyingRemote = false;
  private pushTimer: number | null = null;
  private reconcilePromise: Promise<void> | null = null;
  private hasHydrated = false;
  private state: CloudSyncSnapshot;

  constructor(private readonly store: TrackerStore) {
    this.client =
      supabaseUrl && supabasePublishableKey
        ? createClient(supabaseUrl, supabasePublishableKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storage: new CookieAuthStorage(),
            },
          })
        : null;
    this.state = this.client
      ? {
          phase: "signed-out",
          email: null,
          message: "Sign in to keep every device in sync.",
          lastSyncedAt: null,
        }
      : {
          phase: "unconfigured",
          email: null,
          message: "Cloud sync is not configured in this build.",
          lastSyncedAt: null,
        };
  }

  get snapshot(): CloudSyncSnapshot {
    return this.state;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async initialize(): Promise<void> {
    if (!this.client) return;

    this.store.subscribe(() => {
      if (this.session && !this.applyingRemote) this.schedulePush();
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      if (!session) {
        this.hasHydrated = false;
        this.setState({
          phase: "signed-out",
          email: null,
          message: "Sign in to keep every device in sync.",
          lastSyncedAt: null,
        });
        return;
      }
      void this.reconcile();
    });

    const { data, error } = await this.client.auth.getSession();
    if (error) {
      this.setError(error.message);
      return;
    }
    this.session = data.session;
    if (this.session) await this.reconcile();

    window.addEventListener("online", () => void this.reconcile());
    window.addEventListener("focus", () => void this.reconcile());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.reconcile();
    });
  }

  async sendSignInLink(email: string): Promise<boolean> {
    if (!this.client) return false;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return false;
    this.setState({
      ...this.state,
      phase: "sending-link",
      email: normalizedEmail,
      message: "Sending a secure sign-in link…",
    });
    const redirectTo = appDirectoryUrl(window.location.href);
    const { error } = await this.client.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      this.setError(error.message);
      return false;
    }
    this.setState({
      ...this.state,
      phase: "signed-out",
      email: normalizedEmail,
      message: "Check your email and open the sign-in link on this device.",
    });
    return true;
  }

  async verifyCode(email: string, token: string): Promise<boolean> {
    if (!this.client) return false;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = token.replace(/\s/g, "");
    if (!normalizedEmail || !normalizedToken) return false;
    this.setState({
      ...this.state,
      phase: "syncing",
      email: normalizedEmail,
      message: "Verifying your sign-in code…",
    });
    const { data, error } = await this.client.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedToken,
      type: "email",
    });
    if (error) {
      this.setError(error.message);
      return false;
    }
    this.session = data.session;
    if (this.session) await this.reconcile();
    return Boolean(this.session);
  }

  async signOut(): Promise<void> {
    if (!this.client) return;
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
    this.pushTimer = null;
    const { error } = await this.client.auth.signOut();
    if (error) this.setError(error.message);
  }

  async syncNow(): Promise<void> {
    await this.reconcile();
  }

  async pushRequest<T>(body: Record<string, unknown>): Promise<T> {
    if (!this.client || !this.session) throw new Error("Sign in to device sync first.");
    const { data, error } = await this.client.functions.invoke("routine-command-push", { body });
    if (error) {
      const response = "context" in error ? error.context as Response : null;
      if (response?.json) {
        const detail = await response.json().catch(() => null);
        if (detail?.error) throw new Error(String(detail.error));
      }
      throw new Error("Push service is unavailable. Check your connection and try again.");
    }
    return data as T;
  }

  async dispatchAccountability(): Promise<void> {
    if (!this.client || !this.session || !navigator.onLine || !this.store.snapshot.settings.notifications.enabled) return;
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
    this.pushTimer = null;
    await this.pushLocalState();
    await this.pushRequest({ action: "dispatch" });
  }

  private schedulePush(): void {
    if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => {
      this.pushTimer = null;
      void this.pushLocalState();
    }, 650);
  }

  private async reconcile(): Promise<void> {
    if (!this.client || !this.session || !navigator.onLine) return;
    if (this.reconcilePromise) return this.reconcilePromise;
    this.reconcilePromise = this.performReconcile().finally(() => {
      this.reconcilePromise = null;
    });
    return this.reconcilePromise;
  }

  private async performReconcile(): Promise<void> {
    if (!this.client || !this.session) return;
    this.setState({
      ...this.state,
      phase: "syncing",
      email: this.session.user.email ?? null,
      message: "Syncing your routines…",
    });

    const { data, error } = await this.client
      .from("routine_command_states")
      .select("state, updated_at")
      .eq("user_id", this.session.user.id)
      .maybeSingle<CloudStateRow>();

    if (error) {
      this.setError(error.message);
      return;
    }

    if (!data) {
      await this.pushLocalState();
      this.hasHydrated = true;
      return;
    }

    const remoteIsNewer = !this.state.lastSyncedAt || data.updated_at > this.state.lastSyncedAt;
    if (!this.hasHydrated || remoteIsNewer) {
      this.applyingRemote = true;
      try {
        // View/date selections belong to this device, not the last device to sync.
        this.store.importState(data.state, { preserveNavigation: true });
      } finally {
        this.applyingRemote = false;
      }
    }
    this.hasHydrated = true;
    this.setSynced(data.updated_at);
  }

  private async pushLocalState(): Promise<void> {
    if (!this.client || !this.session || !navigator.onLine) return;
    const updatedAt = new Date().toISOString();
    this.setState({
      ...this.state,
      phase: "syncing",
      email: this.session.user.email ?? null,
      message: "Saving changes…",
    });
    const { data, error } = await this.client
      .from("routine_command_states")
      .upsert(
        {
          user_id: this.session.user.id,
          state: this.store.snapshot,
          updated_at: updatedAt,
        },
        { onConflict: "user_id" },
      )
      .select("updated_at")
      .single<{ updated_at: string }>();
    if (error) {
      this.setError(error.message);
      return;
    }
    this.hasHydrated = true;
    this.setSynced(data.updated_at);
  }

  private setSynced(lastSyncedAt: string): void {
    this.setState({
      phase: "synced",
      email: this.session?.user.email ?? null,
      message: "Your routines are synced across devices.",
      lastSyncedAt,
    });
  }

  private setError(message: string): void {
    this.setState({
      ...this.state,
      phase: "error",
      email: this.session?.user.email ?? this.state.email,
      message,
    });
  }

  private setState(state: CloudSyncSnapshot): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
