import { beforeEach, describe, expect, it } from 'vitest';
import { exportSystemState, importSystemState } from './storage';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('importSystemState', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('rejects malformed JSON with Invalid Snapshot', () => {
    const result = importSystemState('{not-json');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid Snapshot');
  });

  it('rejects non-pocketterm payload keys', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const result = importSystemState(payload);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Invalid Snapshot');
  });

  it('imports valid payload and round-trips via export', () => {
    const payload = JSON.stringify({
      'pocketterm-vfs': '{"name":"/","type":"directory"}',
      'pocketterm-services': '{"sshd":"active"}',
    });
    const result = importSystemState(payload);
    expect(result.ok).toBe(true);
    expect(result.keysWritten).toBe(2);

    const snapshot = JSON.parse(exportSystemState()) as Record<string, string>;
    expect(snapshot['pocketterm-vfs']).toBe('{"name":"/","type":"directory"}');
    expect(snapshot['pocketterm-services']).toBe('{"sshd":"active"}');
  });

  it('rolls back to previous state when write fails mid-import', () => {
    localStorage.setItem('pocketterm-vfs', 'old-vfs');
    localStorage.setItem('pocketterm-services', 'old-services');

    const originalSetItem = localStorage.setItem.bind(localStorage);
    let writeCount = 0;
    localStorage.setItem = ((key: string, value: string) => {
      writeCount++;
      if (writeCount === 2) {
        throw new Error('quota');
      }
      originalSetItem(key, value);
    }) as Storage['setItem'];

    const payload = JSON.stringify({
      'pocketterm-vfs': 'new-vfs',
      'pocketterm-services': 'new-services',
    });
    const result = importSystemState(payload);
    expect(result.ok).toBe(false);
    expect(result.keysWritten).toBe(1);

    // Rollback should restore old values.
    expect(localStorage.getItem('pocketterm-vfs')).toBe('old-vfs');
    expect(localStorage.getItem('pocketterm-services')).toBe('old-services');
  });
});
