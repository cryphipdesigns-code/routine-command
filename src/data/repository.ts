import type { AppState } from "../types";

const DATABASE_NAME = "tracker-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const STATE_KEY = "current";
const FALLBACK_KEY = "trackerLocalStateV1";

export interface StateRepository {
  load(): Promise<AppState | null>;
  save(state: AppState): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDbStateRepository implements StateRepository {
  async load(): Promise<AppState | null> {
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
      return loadFallback();
    }
  }

  async save(state: AppState): Promise<void> {
    const snapshot = structuredClone(state);
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
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(FALLBACK_KEY);
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

function loadFallback(): AppState | null {
  try {
    const value = localStorage.getItem(FALLBACK_KEY);
    return value ? (JSON.parse(value) as AppState) : null;
  } catch {
    return null;
  }
}
