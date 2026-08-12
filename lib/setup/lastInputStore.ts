import { MAX_SETUP_TEXT_LENGTH } from "@/lib/state/constants";

export type LastSetupInputSource = "text" | "file";

export interface LastSetupInputEntry {
  text: string;
  source: LastSetupInputSource;
  fileName?: string;
  fileType?: string;
  savedAt: string;
}

export interface LastSetupInputValue {
  text: string;
  source: LastSetupInputSource;
  fileName?: string;
  fileType?: string;
}

export interface LastSetupInputSnapshot {
  version: 1;
  ownerId: string;
  cv?: LastSetupInputEntry;
  jd?: LastSetupInputEntry;
}

export interface LastSetupInputPair {
  cv: LastSetupInputValue;
  jd: LastSetupInputValue;
}

export const LAST_SETUP_INPUT_STORAGE_KEY_PREFIX =
  "passbuddy.juju.last-setup-input.v1";

const LAST_SETUP_INPUT_CHANGED_EVENT = "passbuddy:juju-last-setup-input-changed";
const MAX_FILE_NAME_LENGTH = 255;
const MAX_FILE_TYPE_LENGTH = 32;

function normalizeOwnerId(ownerId: string) {
  return ownerId.trim();
}

function emptySnapshot(ownerId: string): LastSetupInputSnapshot {
  return {
    version: 1,
    ownerId: normalizeOwnerId(ownerId)
  };
}

function storageKey(ownerId: string) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  return normalizedOwnerId
    ? `${LAST_SETUP_INPUT_STORAGE_KEY_PREFIX}:${encodeURIComponent(normalizedOwnerId)}`
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function normalizeEntry(value: unknown): LastSetupInputEntry | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > MAX_SETUP_TEXT_LENGTH ||
    (value.source !== "text" && value.source !== "file") ||
    typeof value.savedAt !== "string" ||
    Number.isNaN(Date.parse(value.savedAt))
  ) {
    return undefined;
  }

  const entry: LastSetupInputEntry = {
    text: value.text,
    source: value.source,
    savedAt: value.savedAt
  };
  if (value.source === "file") {
    entry.fileName = normalizeOptionalString(value.fileName, MAX_FILE_NAME_LENGTH);
    entry.fileType = normalizeOptionalString(value.fileType, MAX_FILE_TYPE_LENGTH);
  }
  return entry;
}

function buildEntry(
  value: LastSetupInputValue,
  savedAt: string
): LastSetupInputEntry | undefined {
  if (
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > MAX_SETUP_TEXT_LENGTH ||
    (value.source !== "text" && value.source !== "file")
  ) {
    return undefined;
  }

  const entry: LastSetupInputEntry = {
    text: value.text,
    source: value.source,
    savedAt
  };
  if (value.source === "file") {
    entry.fileName = normalizeOptionalString(value.fileName, MAX_FILE_NAME_LENGTH);
    entry.fileType = normalizeOptionalString(value.fileType, MAX_FILE_TYPE_LENGTH);
  }
  return entry;
}

export function readLastSetupInput(ownerId: string): LastSetupInputSnapshot {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const key = storageKey(normalizedOwnerId);
  if (!key || typeof window === "undefined") return emptySnapshot(normalizedOwnerId);

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return emptySnapshot(normalizedOwnerId);
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      parsed.ownerId !== normalizedOwnerId
    ) {
      return emptySnapshot(normalizedOwnerId);
    }

    const cv = normalizeEntry(parsed.cv);
    const jd = normalizeEntry(parsed.jd);
    // A saved run is an atomic CV/JD pair. Reject partial or malformed data so
    // a corrupt browser value can never masquerade as the user's last input.
    if (!cv || !jd) return emptySnapshot(normalizedOwnerId);
    return { version: 1, ownerId: normalizedOwnerId, cv, jd };
  } catch {
    return emptySnapshot(normalizedOwnerId);
  }
}

export function saveLastSetupInput(
  ownerId: string,
  input: LastSetupInputPair
): LastSetupInputSnapshot {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const key = storageKey(normalizedOwnerId);
  if (!key || typeof window === "undefined") return emptySnapshot(normalizedOwnerId);

  const savedAt = new Date().toISOString();
  const cv = buildEntry(input.cv, savedAt);
  const jd = buildEntry(input.jd, savedAt);
  if (!cv || !jd) return emptySnapshot(normalizedOwnerId);

  const snapshot: LastSetupInputSnapshot = {
    version: 1,
    ownerId: normalizedOwnerId,
    cv,
    jd
  };

  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    window.dispatchEvent(
      new CustomEvent(LAST_SETUP_INPUT_CHANGED_EVENT, { detail: { key } })
    );
    return snapshot;
  } catch {
    // Private browsing/storage quota failures must not block profile creation.
    return emptySnapshot(normalizedOwnerId);
  }
}

export function subscribeLastSetupInput(
  ownerId: string,
  listener: (snapshot: LastSetupInputSnapshot) => void
) {
  const normalizedOwnerId = normalizeOwnerId(ownerId);
  const key = storageKey(normalizedOwnerId);
  if (!key || typeof window === "undefined") return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === window.localStorage && event.key === key) {
      listener(readLastSetupInput(normalizedOwnerId));
    }
  };
  const onLocalChange = (event: Event) => {
    if (
      event instanceof CustomEvent &&
      isRecord(event.detail) &&
      event.detail.key === key
    ) {
      listener(readLastSetupInput(normalizedOwnerId));
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(LAST_SETUP_INPUT_CHANGED_EVENT, onLocalChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LAST_SETUP_INPUT_CHANGED_EVENT, onLocalChange);
  };
}
