import type { AppState } from "../types";

const DATABASE_NAME = "tracker-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const STATE_KEY = "current";
const FALLBACK_KEY = "trackerLocalStateV1";
const MIRROR_KEY = "routineCommandStateMirrorV1";

export interface StateRepository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDbStateRepository implements StateRepository {
  async load(): Promise<AppState | null> {
    const mirror = loadStoredState(MIRROR_KEY);
    if (mirror) return mirror;
    try {
      const database = await openDatabase();
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(STATE_KEY);
        request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn("IndexedDB unavailable; using local storage.", error);
      return loadStoredState(FALLBACK_KEY);
    }
  }

  async save(state: AppState): Promise<void> {
    const snapshot = structuredClone(state);
    saveMirror(snapshot);
    try {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.warn("Could not save to IndexedDB; using local storage.", error);
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(FALLBACK_KEY);
    localStorage.removeItem(MIRROR_KEY);
    try {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(STATE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.warn("Could not clear IndexedDB.", error);
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadStoredState(key: string): AppState | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as AppState) : null;
  } catch {
    return null;
  }
}

function saveMirror(state: AppState): void {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not mirror Routine Command state to local storage.", error);
  }
}
