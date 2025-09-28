type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ConsumerSession {
  email: string;
  tenantSlug: string;
  consumerData?: unknown;
}

export const CONSUMER_SESSION_KEY = "consumerSession";
export const CONSUMER_TOKEN_KEY = "consumerToken";

function isStorageAvailable(storage: Storage | undefined): storage is Storage {
  if (!storage) {
    return false;
  }

  try {
    const testKey = "__storage_test__";
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return true;
  } catch (error) {
    console.warn("Storage unavailable", error);
    return false;
  }
}

function getStorages(): StorageLike[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storages: StorageLike[] = [];

  if (isStorageAvailable(window.localStorage)) {
    storages.push(window.localStorage);
  }

  if (isStorageAvailable(window.sessionStorage)) {
    storages.push(window.sessionStorage);
  }

  return storages;
}

function getFirstValue(key: string): string | null {
  for (const storage of getStorages()) {
    const value = storage.getItem(key);
    if (value) {
      return value;
    }
  }
  return null;
}

function setValue(key: string, value: string): boolean {
  let stored = false;
  for (const storage of getStorages()) {
    try {
      storage.setItem(key, value);
      stored = true;
    } catch (error) {
      console.warn(`Failed to write ${key} to storage`, error);
    }
  }
  return stored;
}

function removeValue(key: string): void {
  for (const storage of getStorages()) {
    try {
      storage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key} from storage`, error);
    }
  }
}

export function clearConsumerAuth(): void {
  removeValue(CONSUMER_SESSION_KEY);
  removeValue(CONSUMER_TOKEN_KEY);
}

export function getStoredConsumerToken(): string | null {
  return getFirstValue(CONSUMER_TOKEN_KEY);
}

export function getStoredConsumerSession(): ConsumerSession | null {
  const raw = getFirstValue(CONSUMER_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ConsumerSession;
    if (!parsed?.email || !parsed?.tenantSlug) {
      throw new Error("Invalid consumer session payload");
    }
    return parsed;
  } catch (error) {
    console.error("Failed to parse consumer session", error);
    clearConsumerAuth();
    return null;
  }
}

export function persistConsumerAuth({
  session,
  token,
}: {
  session: ConsumerSession;
  token: string;
}): { sessionStored: boolean; tokenStored: boolean } {
  const sessionStored = setValue(CONSUMER_SESSION_KEY, JSON.stringify(session));
  const tokenStored = setValue(CONSUMER_TOKEN_KEY, token);

  if (!sessionStored || !tokenStored) {
    console.error("Failed to persist consumer auth", { sessionStored, tokenStored });
  }

  return {
    sessionStored,
    tokenStored,
  };
}
