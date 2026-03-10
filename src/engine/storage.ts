const POCKETTERM_PREFIX = 'pocketterm-';

export function clearPocketTermStorage(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POCKETTERM_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

/**
 * Safely write to localStorage, catching QuotaExceededError.
 * Returns true on success. On failure, returns false and sets
 * the provided errorRef (if any) with a human-readable message.
 */
export function safePersist(key: string, value: string): { ok: boolean; error?: string } {
  try {
    localStorage.setItem(key, value);
    return { ok: true };
  } catch (err: unknown) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      return { ok: false, error: 'No space left on device (localStorage quota exceeded)' };
    }
    return { ok: false, error: `write error: ${String(err)}` };
  }
}

/**
 * Serialize all pocketterm-* localStorage keys into a single JSON string.
 * This captures VFS, packages, services, journal, and hardware state.
 */
export function exportSystemState(): string {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POCKETTERM_PREFIX)) {
      snapshot[key] = localStorage.getItem(key) ?? '';
    }
  }
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Restore system state from a JSON string produced by exportSystemState().
 * Replaces all pocketterm-* keys. Returns true on success.
 */
/**
 * Trigger a real browser file download with the given content.
 */
export function triggerBrowserDownload(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Open a browser file picker and return the text content of the selected file.
 * Returns null if the user cancels.
 */
export function triggerBrowserUpload(accept = '.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    });

    input.addEventListener('cancel', () => resolve(null));

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}

function readPocketTermStorage(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(POCKETTERM_PREFIX)) {
      snapshot[key] = localStorage.getItem(key) ?? '';
    }
  }
  return snapshot;
}

function validateSnapshotPayload(parsed: unknown): { ok: boolean; entries: [string, string][] } {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, entries: [] };
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return { ok: false, entries: [] };

  const normalized: [string, string][] = [];
  for (const [key, value] of entries) {
    if (!key.startsWith(POCKETTERM_PREFIX) || typeof value !== 'string') {
      return { ok: false, entries: [] };
    }
    normalized.push([key, value]);
  }

  return { ok: true, entries: normalized };
}

export function importSystemState(json: string): { ok: boolean; error?: string; keysWritten: number } {
  // Basic size guard against oversized uploads that can freeze parsing/rendering.
  if (json.length > 5_000_000) {
    return { ok: false, error: 'Invalid Snapshot', keysWritten: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid Snapshot', keysWritten: 0 };
  }

  try {
    const validation = validateSnapshotPayload(parsed);
    if (!validation.ok) {
      return { ok: false, error: 'Invalid Snapshot', keysWritten: 0 };
    }

    const backup = readPocketTermStorage();
    clearPocketTermStorage();

    let written = 0;
    for (const [key, val] of validation.entries) {
      const result = safePersist(key, val);
      if (!result.ok) {
        // Best-effort rollback to previous state to avoid leaving a half-applied import.
        clearPocketTermStorage();
        for (const [backupKey, backupVal] of Object.entries(backup)) {
          safePersist(backupKey, backupVal);
        }
        return { ok: false, error: result.error ?? 'Invalid Snapshot', keysWritten: written };
      }
      written++;
    }

    return { ok: true, keysWritten: written };
  } catch {
    return { ok: false, error: 'Invalid Snapshot', keysWritten: 0 };
  }
}
