import { beforeEach, describe, expect, it } from 'vitest';
import { buildBootPreludeLines } from './bootPrelude';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.has(key) ? this.data.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('boot prelude contract', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('keeps startup order: banner -> auto-login -> MOTD -> last login', () => {
    const prelude = buildBootPreludeLines('Fri Mar 13 12:34:56');
    const bannerIdx = prelude.indexOf('PocketTerm v0.12.2 (Rocky Linux 9.4 Hybrid)');
    const autoLoginIdx = prelude.indexOf('pocketterm login: guest (automatic login)');
    const motdIdx = prelude.indexOf('---------------------------------------------------------');
    const lastLoginIdx = prelude.indexOf('Last login: Fri Mar 13 12:34:56 on tty1');

    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(autoLoginIdx).toBeGreaterThan(bannerIdx);
    expect(motdIdx).toBeGreaterThan(autoLoginIdx);
    expect(lastLoginIdx).toBeGreaterThan(motdIdx);
  });
});
