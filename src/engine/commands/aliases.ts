export type AliasEntry = { cmd: string; prependArgs: string[] };

export const ALIASES: Record<string, AliasEntry> = {
  ll: { cmd: 'ls', prependArgs: ['-la'] },
  la: { cmd: 'ls', prependArgs: ['-al'] },
  vi: { cmd: 'vim', prependArgs: [] },
  '.': { cmd: 'source', prependArgs: [] },
  pt: { cmd: 'pocketterm', prependArgs: [] },
};
