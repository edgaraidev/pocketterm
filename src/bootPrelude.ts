export function formatLastLoginTimestamp(now: Date): string {
  return now.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const totalPadding = width - text.length;
  const left = Math.floor(totalPadding / 2);
  const right = totalPadding - left;
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`;
}

export function buildLoginPrelude(lastLogin: string): string[] {
  const blockWidth = 57; // Keep <= 60 chars for narrow mobile viewports.
  const sep = '-'.repeat(blockWidth);
  const heading = centerText('Welcome to PocketTerm v0.12.2 (Rocky Linux 9.4 Hybrid)', blockWidth);
  return [
    sep,
    heading,
    '',
    "* Documentation: Type 'man bash' for a shell guide.",
    "* Help: Type 'help' for available utilities.",
    "* Tips: Look for YELLOW NOTES in manuals for sim insights.",
    '',
    'System state: STABLE | Storage: VFS (Browser Local)',
    sep,
    '',
    `Last login: ${lastLogin} on tty1`,
    '',
  ];
}

export function buildBootPreludeLines(lastLogin: string): string[] {
  return [
    'PocketTerm v0.12.2 (Rocky Linux 9.4 Hybrid)',
    'Kernel 6.1.0-pocket-vfs on an x86_64',
    '',
    'pocketterm login: guest (automatic login)',
    ...buildLoginPrelude(lastLogin),
  ];
}
