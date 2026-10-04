import "./styles.css";
import { TrackerApp } from "./app";
import { CloudSyncController } from "./data/cloud-sync";
import { IndexedDbStateRepository } from "./data/repository";
import { TrackerStore } from "./state/store";

async function start(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("Routine Command application root is missing.");

  const store = new TrackerStore(new IndexedDbStateRepository());
  await store.initialize();
  const cloudSync = new CloudSyncController(store);
  await cloudSync.initialize();
  new TrackerApp(root, store, cloudSync).start();

  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    const registerServiceWorker = () => {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`);
    };
    if (document.readyState === "complete") registerServiceWorker();
    else window.addEventListener("load", registerServiceWorker, { once: true });
  }
}

void start();
