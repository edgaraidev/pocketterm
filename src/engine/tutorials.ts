export interface TutorialCartridge {
  id: string;
  title: string;
  instructionBlock: string;
}

const MAX_ID_LENGTH = 100;
const MAX_TITLE_LENGTH = 100;
const MAX_INSTRUCTION_LENGTH = 3000;
const ALLOWED_KEYS = new Set(['id', 'title', 'instructionBlock']);
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export const DEFAULT_TUTORIAL_IDS = ['help', 'navigation', 'copying', 'permissions', 'status'] as const;

export const DEFAULT_TUTORIALS: TutorialCartridge[] = [
  {
    id: 'help',
    title: 'How to Get Help (man & flags)',
    instructionBlock: 'TASK: Learn to read manuals. Type man ls to see the manual for the list command.',
  },
  {
    id: 'navigation',
    title: 'File System Navigation (cd, ls, pwd)',
    instructionBlock: 'TASK: Find the hidden logs. Navigate to /var/log using cd /var/log, then type ls -la.',
  },
  {
    id: 'copying',
    title: 'File Copying & Moving (cp, mv, rm)',
    instructionBlock: 'TASK: Back up the welcome message. Use cp /etc/motd /home/guest/backup.txt.',
  },
  {
    id: 'permissions',
    title: 'User Permissions (chmod, chown)',
    instructionBlock: 'TASK: Lock down a file. Create a file with touch secret.txt, then remove read permissions for others using chmod 600 secret.txt.',
  },
  {
    id: 'status',
    title: 'Machine Status (systemctl, df, top)',
    instructionBlock: 'TASK: Diagnose the server. Run df -h to check disk space, and systemctl status sshd to check the daemon.',
  },
];
const RESERVED_DEFAULT_IDS = new Set(DEFAULT_TUTORIALS.map((t) => t.id));

export function isTutorialCartridge(value: unknown): value is TutorialCartridge {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.title === 'string' && typeof v.instructionBlock === 'string';
}

export function stripUnsafeHtml(text: string): string {
  // Remove high-risk embedded blocks first, then strip any remaining tags.
  const noDangerBlocks = text
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<img[\s\S]*?>/gi, '');
  return noDangerBlocks.replace(/<[^>]*>?/gm, '');
}

export function parseTutorialCartridgePayload(payload: unknown): TutorialCartridge | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;

  // Reject unexpected fields to prevent hidden nested payload structures.
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) return null;
  }

  if (typeof obj.id !== 'string' || typeof obj.title !== 'string' || typeof obj.instructionBlock !== 'string') {
    return null;
  }
  if (obj.id.length > MAX_ID_LENGTH || obj.title.length > MAX_TITLE_LENGTH || obj.instructionBlock.length > MAX_INSTRUCTION_LENGTH) {
    return null;
  }

  const id = stripUnsafeHtml(obj.id).trim();
  const title = stripUnsafeHtml(obj.title).trim();
  const instructionBlock = stripUnsafeHtml(obj.instructionBlock).trim();
  if (!id || !title || !instructionBlock) return null;
  if (id.length > MAX_ID_LENGTH || title.length > MAX_TITLE_LENGTH || instructionBlock.length > MAX_INSTRUCTION_LENGTH) {
    return null;
  }
  if (!SAFE_ID_PATTERN.test(id)) return null;
  if (RESERVED_DEFAULT_IDS.has(id)) return null;

  return { id, title, instructionBlock };
}

export function loadTutorialFromSearch(search: string): TutorialCartridge | null {
  const params = new URLSearchParams(search);
  try {
    const encoded = params.get('tutorialBase64');
    if (encoded) {
      const decoded = atob(encoded);
      const parsed = JSON.parse(decoded) as unknown;
      const safe = parseTutorialCartridgePayload(parsed);
      if (safe) return safe;
      console.warn('Invalid tutorial payload rejected');
      return null;
    }

    const modJson = params.get('mod');
    if (modJson) {
      const parsed = JSON.parse(modJson) as unknown;
      const safe = parseTutorialCartridgePayload(parsed);
      if (safe) return safe;
      console.warn('Invalid tutorial payload rejected');
      return null;
    }
  } catch {
    console.warn('Invalid tutorial payload rejected');
  }
  return null;
}
