const KEY = "drivee.forecast.automl.v1";

type PrefStore = Record<string, Record<string, string>>;

function readStore(): PrefStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PrefStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: PrefStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

export function getPreferredForecastStrategy(workspaceId: string, metricKey: string): string | null {
  const store = readStore();
  return store[workspaceId]?.[metricKey] ?? null;
}

export function setPreferredForecastStrategy(workspaceId: string, metricKey: string, strategyKey: string) {
  const store = readStore();
  const ws = { ...(store[workspaceId] ?? {}) };
  ws[metricKey] = strategyKey;
  writeStore({ ...store, [workspaceId]: ws });
}

