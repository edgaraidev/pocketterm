import { describe, expect, it } from 'vitest';
import { commandRegistry } from './index';
import { AVAILABLE_PACKAGES, PACKAGE_COMMAND_MAP } from './packageMgmt';

describe('package to command coverage contract', () => {
  it('ensures every mapped package exists in available package db', () => {
    for (const pkg of Object.keys(PACKAGE_COMMAND_MAP)) {
      expect(AVAILABLE_PACKAGES[pkg], `Missing package metadata for ${pkg}`).toBeTruthy();
    }
  });

  it('ensures every mapped command exists in command registry', () => {
    for (const [pkg, commands] of Object.entries(PACKAGE_COMMAND_MAP)) {
      for (const cmdName of commands) {
        const def = commandRegistry.get(cmdName);
        expect(def, `Package ${pkg} maps to missing command ${cmdName}`).toBeTruthy();
      }
    }
  });

  it('ensures gated commands use the expected package lock', () => {
    for (const [pkg, commands] of Object.entries(PACKAGE_COMMAND_MAP)) {
      for (const cmdName of commands) {
        const def = commandRegistry.get(cmdName)!;
        // Some commands are intentionally core (always available), e.g. curl/tar.
        // If command is gated, it must gate on the mapped package.
        if (def.requiresPackage) {
          expect(
            def.requiresPackage,
            `Command ${cmdName} should gate on ${pkg} but gates on ${def.requiresPackage}`,
          ).toBe(pkg);
        }
      }
    }
  });
});
