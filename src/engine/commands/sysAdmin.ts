import type { CommandDefinition } from './types';
import { sleep } from './types';

function requireRoot(ctx: { user: string; sudo: boolean; out: (s: string) => void }): boolean {
  if (ctx.user === 'root' || ctx.sudo) return true;
  ctx.out('Authentication is required to manage system services.');
  return false;
}

// ── systemctl ──

const SERVICE_DESCRIPTIONS: Record<string, string> = {
  sshd: 'OpenSSH server daemon',
  firewalld: 'firewalld - dynamic firewall daemon',
  crond: 'Command Scheduler',
  chronyd: 'NTP client/server',
  rsyslog: 'System Logging Service',
  NetworkManager: 'Network Manager',
  'systemd-logind': 'User Login Management',
  dbus: 'D-Bus System Message Bus',
  httpd: 'The Apache HTTP Server',
  nginx: 'The nginx HTTP and reverse proxy server',
  mariadb: 'MariaDB 10.5 database server',
  postgresql: 'PostgreSQL database server',
  docker: 'Docker Application Container Engine',
};

function fmtTimestamp(): string {
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = now.getDate();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${months[now.getMonth()]} ${String(d).padStart(2, '0')} ${h}:${m}:${s}`;
}

function stableServiceSeed(name: string): number {
  return name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function stableServicePid(name: string): number {
  return 500 + (stableServiceSeed(name) * 37) % 7000;
}

function stableServiceMem(name: string): string {
  const mb = 3 + (stableServiceSeed(name) % 40);
  return `${mb.toFixed(1)}M`;
}

function appendJournal(ctx: { addJournalEntry: (entry: string) => void }, message: string): void {
  ctx.addJournalEntry(`${fmtTimestamp()} pocket-term ${message}`);
}

function printServiceStatus(
  ctx: { out: (s: string) => void },
  name: string,
  state: 'active' | 'inactive',
) {
  const desc = SERVICE_DESCRIPTIONS[name] ?? name;
  const loaded = `loaded (/usr/lib/systemd/system/${name}.service; enabled; preset: enabled)`;
  const ts = fmtTimestamp();
  const pid = state === 'active' ? stableServicePid(name) : 0;
  const memUsage = state === 'active' ? stableServiceMem(name) : '0B';

  if (state === 'active') {
    ctx.out(`\x1b[1;32m●\x1b[0m ${name}.service - ${desc}`);
    ctx.out(`     Loaded: ${loaded}`);
    ctx.out(`     Active: \x1b[1;32mactive (running)\x1b[0m since ${ts}; 1h 23min ago`);
    ctx.out(`   Main PID: ${pid} (${name})`);
    ctx.out(`      Tasks: ${Math.floor(Math.random() * 8) + 1} (limit: 23567)`);
    ctx.out(`     Memory: ${memUsage}`);
    ctx.out(`        CPU: ${(80 + (stableServiceSeed(name) % 160)).toFixed(0)}ms`);
    ctx.out(`     CGroup: /system.slice/${name}.service`);
    ctx.out(`             └─${pid} /usr/sbin/${name} -D`);
    ctx.out('');
    ctx.out(`${ts} pocket-term systemd[1]: Starting ${desc}...`);
    ctx.out(`${ts} pocket-term ${name}[${pid}]: Listening on 0.0.0.0.`);
    ctx.out(`${ts} pocket-term ${name}[${pid}]: Ready to accept connections.`);
    ctx.out(`${ts} pocket-term systemd[1]: Started ${desc}.`);
  } else {
    ctx.out(`\x1b[1;31m●\x1b[0m ${name}.service - ${desc}`);
    ctx.out(`     Loaded: ${loaded}`);
    ctx.out(`     Active: \x1b[1;31minactive (dead)\x1b[0m since ${ts}; 5min ago`);
    ctx.out(`   Main PID: ${pid} (${name})`);
    ctx.out(`     Memory: ${memUsage}`);
    ctx.out('');
    ctx.out(`${ts} pocket-term systemd[1]: Stopping ${desc}...`);
    ctx.out(`${ts} pocket-term ${name}[1422]: Received shutdown signal.`);
    ctx.out(`${ts} pocket-term ${name}[1422]: Exiting cleanly.`);
    ctx.out(`${ts} pocket-term systemd[1]: Stopped ${desc}.`);
  }
}

const systemctl: CommandDefinition = {
  name: 'systemctl',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();
    const unit = args[1]?.replace(/\.service$/, '');

    if (!sub) {
      ctx.out('systemctl: missing subcommand');
      ctx.out('usage: systemctl {status|start|stop|restart|enable|disable|list-units} [UNIT]');
      return;
    }

    if (sub === 'list-units' || sub === 'list') {
      ctx.out('  UNIT                        LOAD   ACTIVE SUB     DESCRIPTION');
      for (const [name, state] of ctx.services) {
        const desc = SERVICE_DESCRIPTIONS[name] ?? name;
        const active = state === 'active' ? 'active ' : 'inactive';
        const subState = state === 'active' ? 'running' : 'dead   ';
        const dot = state === 'active' ? '\x1b[32m●\x1b[0m' : '○';
        ctx.out(`${dot} ${(name + '.service').padEnd(28)} loaded ${active} ${subState} ${desc}`);
      }
      ctx.out('');
      ctx.out(`${ctx.services.size} loaded units listed.`);
      return;
    }

    if (!unit) {
      ctx.out(`systemctl ${sub}: missing unit name`);
      return;
    }

    if (!ctx.services.has(unit)) {
      ctx.out(`Failed to ${sub} ${unit}.service: Unit ${unit}.service not found.`);
      return;
    }

    switch (sub) {
      case 'status': {
        const state = ctx.services.get(unit)!;
        printServiceStatus(ctx, unit, state);
        break;
      }
      case 'start': {
        if (!requireRoot(ctx)) return;
        if (ctx.services.get(unit) === 'active') {
          ctx.out(`${unit}.service is already active.`);
          return;
        }
        ctx.services.set(unit, 'active');
        ctx.persistServices();
        ctx.out(`Starting ${unit}.service...`);
        await sleep(400);
        ctx.out(`Started ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        appendJournal(ctx, `systemd[1]: Started ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        break;
      }
      case 'stop': {
        if (!requireRoot(ctx)) return;
        if (ctx.services.get(unit) === 'inactive') {
          ctx.out(`${unit}.service is not active.`);
          return;
        }
        ctx.services.set(unit, 'inactive');
        ctx.persistServices();
        ctx.out(`Stopping ${unit}.service...`);
        await sleep(300);
        ctx.out(`Stopped ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        appendJournal(ctx, `systemd[1]: Stopped ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        break;
      }
      case 'restart': {
        if (!requireRoot(ctx)) return;
        ctx.services.set(unit, 'inactive');
        ctx.persistServices();
        ctx.out(`Stopping ${unit}.service...`);
        await sleep(300);
        ctx.out(`Stopped ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        appendJournal(ctx, `systemd[1]: Stopped ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        ctx.services.set(unit, 'active');
        ctx.persistServices();
        ctx.out(`Starting ${unit}.service...`);
        await sleep(500);
        ctx.out(`Started ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        appendJournal(ctx, `systemd[1]: Started ${SERVICE_DESCRIPTIONS[unit] ?? unit}.`);
        break;
      }
      case 'enable': {
        if (!requireRoot(ctx)) return;
        ctx.out(`Created symlink /etc/systemd/system/multi-user.target.wants/${unit}.service → /usr/lib/systemd/system/${unit}.service.`);
        break;
      }
      case 'disable': {
        if (!requireRoot(ctx)) return;
        ctx.out(`Removed /etc/systemd/system/multi-user.target.wants/${unit}.service.`);
        break;
      }
      default:
        ctx.out(`Unknown subcommand: ${sub}`);
        ctx.out('usage: systemctl {status|start|stop|restart|enable|disable|list-units} [UNIT]');
    }
  },
  man: `SYSTEMCTL(1)                 System Manager                SYSTEMCTL(1)

NAME
       systemctl - control the systemd system and service manager

SYNOPSIS
       systemctl {status|start|stop|restart|enable|disable|list-units} [UNIT]

DESCRIPTION
       systemctl is used to introspect and control the state of the systemd
       system and service manager. It can start, stop, restart, and query
       the status of system services (units).

       Most operations require root privileges (use sudo).

SUBCOMMANDS
       status [UNIT]      Show current status of a service.
       start UNIT         Start (activate) a service.
       stop UNIT          Stop (deactivate) a service.
       restart UNIT       Stop then start a service.
       enable UNIT        Enable a service to start at boot.
       disable UNIT       Disable a service from starting at boot.
       list-units         List all known service units and their states.

       Unit names can be given with or without the .service suffix.

EXAMPLES
       systemctl status sshd          Check if SSH daemon is running.
       sudo systemctl start nginx     Start the nginx web server.
       sudo systemctl restart httpd   Restart Apache.
       systemctl list-units           List all services.

SEE ALSO
       journalctl(1), service(8)`,
};

const journalctl: CommandDefinition = {
  name: 'journalctl',
  async execute(args, ctx) {
    const showExtended = args.includes('-xe') || args.includes('-x') || args.includes('-e');
    if (args.length > 0 && !showExtended) {
      ctx.out('usage: journalctl -xe');
      ctx.out('journalctl: only -xe style output is supported in this simulation');
      return;
    }

    const entries = ctx.getJournalEntries();
    const lines: string[] = [];
    if (entries.length === 0) {
      lines.push('-- No entries --');
    } else {
      const tail = entries.slice(-120);
      for (const line of tail) {
        lines.push(line);
        if (showExtended && /Stopped|inactive|failed/i.test(line)) {
          lines.push('  Hint: Check unit status and logs with `systemctl status <unit>`.');
        }
        if (showExtended && /Started/i.test(line)) {
          lines.push('  Subject: Unit start operation completed successfully');
        }
      }
      lines.push('-- Journal ends --');
    }

    const pageSize = 24;
    let offset = Math.max(0, lines.length - pageSize);
    let quit = false;
    const maxOffset = () => Math.max(0, lines.length - pageSize);
    const clamp = (n: number) => Math.max(0, Math.min(maxOffset(), n));

    const render = () => {
      ctx.rawOut('\x1b[2J\x1b[H');
      const page = lines.slice(offset, offset + pageSize);
      for (const l of page) ctx.out(l);
      const percent = lines.length === 0 ? 100 : Math.min(100, Math.floor(((offset + page.length) / lines.length) * 100));
      const end = offset + pageSize >= lines.length;
      const prompt = end ? `: END ${percent}% (q to quit)` : `: ${percent}% (q to quit, j/k scroll)`;
      ctx.rawOut(`\x1b[7m${prompt}\x1b[0m`);
    };

    ctx.setLiveMode(true);
    try {
      render();
      while (!ctx.isInterrupted() && !quit) {
        const key = ctx.readLiveInput();
        if (key === null) {
          await sleep(50);
          continue;
        }
        switch (key) {
          case 'q':
            quit = true;
            break;
          case 'j':
          case '\x1b[B':
            offset = clamp(offset + 1);
            render();
            break;
          case 'k':
          case '\x1b[A':
            offset = clamp(offset - 1);
            render();
            break;
          case ' ':
            offset = clamp(offset + pageSize);
            render();
            break;
          case 'b':
            offset = clamp(offset - pageSize);
            render();
            break;
          case 'g':
            offset = 0;
            render();
            break;
          case 'G':
            offset = maxOffset();
            render();
            break;
          default:
            break;
        }
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
      ctx.rawOut('\x1b[2J\x1b[H');
    }
  },
  man: `JOURNALCTL(1)                User Commands               JOURNALCTL(1)

NAME
       journalctl - query the systemd journal

SYNOPSIS
       journalctl -xe

DESCRIPTION
       journalctl shows entries from the systemd journal. In this simulation,
       service transitions (start/stop/restart) are recorded and visible here.

OPTIONS
       -x     Add explanatory help text.
       -e     Jump to end of journal.
       -xe    Combined "end + explain" view.

EXAMPLES
       journalctl -xe
       sudo systemctl restart nginx && journalctl -xe

SEE ALSO
       systemctl(1), dmesg(1)`,
};

const firewall_cmd: CommandDefinition = {
  name: 'firewall-cmd',
  async execute(args, ctx) {
    if (args.length === 0 || args.includes('--help')) {
      ctx.out('usage: firewall-cmd [OPTIONS...]');
      ctx.out('  --state                         Show firewalld state');
      ctx.out('  --add-port=<port>/tcp          Add TCP port');
      ctx.out('  --remove-port=<port>/tcp       Remove TCP port');
      ctx.out('  --add-service=<service>        Add service');
      ctx.out('  --remove-service=<service>     Remove service');
      ctx.out('  --reload                        Reload firewall rules');
      return;
    }

    if (args.includes('--state')) {
      ctx.out('running');
      return;
    }

    if (ctx.user !== 'root' && !ctx.sudo) {
      ctx.out('Authentication is required to run firewall-cmd.');
      return;
    }

    const hasRuleMutation = args.some((a) =>
      a.startsWith('--add-port=') ||
      a.startsWith('--remove-port=') ||
      a.startsWith('--add-service=') ||
      a.startsWith('--remove-service=')
    );
    if (hasRuleMutation) {
      ctx.out('success');
      return;
    }

    if (args.includes('--reload')) {
      await sleep(200);
      ctx.out('success');
      return;
    }

    ctx.out('firewall-cmd: invalid option set');
    ctx.out("Try 'firewall-cmd --help' for more information.");
  },
  man: `FIREWALL-CMD(1)              User Commands             FIREWALL-CMD(1)

NAME
       firewall-cmd - firewalld command line client

SYNOPSIS
       firewall-cmd [OPTIONS...]

DESCRIPTION
       firewall-cmd is the command line interface to firewalld. Use it to
       inspect state, add/remove ports and services, and reload rules.

       Rule changes require root privileges (use sudo).

EXAMPLES
       firewall-cmd --state
       sudo firewall-cmd --add-port=8080/tcp --permanent
       sudo firewall-cmd --reload

SEE ALSO
       firewalld(1), systemctl(1)`,
};

// ── useradd ──

function getNextUID(passwdContent: string): number {
  let maxUID = 1000;
  for (const line of passwdContent.split('\n')) {
    const parts = line.split(':');
    const uid = parseInt(parts[2], 10);
    if (!isNaN(uid) && uid >= 1000 && uid < 65534) {
      maxUID = Math.max(maxUID, uid);
    }
  }
  return maxUID + 1;
}

const useradd: CommandDefinition = {
  name: 'useradd',
  async execute(args, ctx) {
    const username = args.find(a => !a.startsWith('-'));
    if (!username) {
      ctx.out('usage: useradd [options] LOGIN');
      return;
    }

    if (ctx.user !== 'root' && !ctx.sudo) {
      ctx.out('useradd: Permission denied.');
      return;
    }

    if (!/^[a-z_][a-z0-9_-]*$/.test(username)) {
      ctx.out(`useradd: invalid user name '${username}'`);
      return;
    }

    // Check /etc/passwd for existing user
    const passwdPath = '/etc/passwd';
    const passwdContent = ctx.fs.readFile(passwdPath, 'root') ?? '';
    const lines = passwdContent.split('\n').filter(Boolean);
    for (const line of lines) {
      const existing = line.split(':')[0];
      if (existing === username) {
        ctx.out(`useradd: user '${username}' already exists`);
        return;
      }
    }

    const uid = getNextUID(passwdContent);
    const gid = uid;

    // Append to /etc/passwd
    const newPasswdLine = `${username}:x:${uid}:${gid}::/home/${username}:/bin/bash`;
    ctx.fs.writeFile(passwdPath, passwdContent.trimEnd() + '\n' + newPasswdLine + '\n', 'root', true);

    // Append to /etc/shadow
    const shadowPath = '/etc/shadow';
    const shadowContent = ctx.fs.readFile(shadowPath, 'root') ?? '';
    const newShadowLine = `${username}:!!:19836:0:99999:7:::`;
    ctx.fs.writeFile(shadowPath, shadowContent.trimEnd() + '\n' + newShadowLine + '\n', 'root', true);

    // Append to /etc/group
    const groupPath = '/etc/group';
    const groupContent = ctx.fs.readFile(groupPath, 'root') ?? '';
    const newGroupLine = `${username}:x:${gid}:`;
    ctx.fs.writeFile(groupPath, groupContent.trimEnd() + '\n' + newGroupLine + '\n', 'root', true);

    // Create home directory
    const homePath = `/home/${username}`;
    ctx.fs.mkdir(homePath, 'root', true);

    // Set ownership on the new home directory
    const homeNode = ctx.fs.getNode(homePath);
    if (homeNode) {
      ctx.fs.chown(homePath, username, username, 'root', true);
    }

    // Create .bashrc in the new home
    ctx.fs.writeFile(`${homePath}/.bashrc`, `# .bashrc for ${username}\n`, 'root', true);
    const bashrcNode = ctx.fs.getNode(`${homePath}/.bashrc`);
    if (bashrcNode) {
      ctx.fs.chown(`${homePath}/.bashrc`, username, username, 'root', true);
    }

    ctx.out(`useradd: user '${username}' created (UID ${uid})`);
  },
  man: `USERADD(8)               System Manager's Manual        USERADD(8)

NAME
       useradd - create a new user

SYNOPSIS
       useradd [options] LOGIN

DESCRIPTION
       useradd creates a new user account. It adds an entry to /etc/passwd
       and /etc/shadow, creates a home directory at /home/LOGIN, and sets
       ownership.

       Requires root privileges (use sudo).

OPTIONS
       LOGIN    The login name of the new user. Must start with a lowercase
                letter or underscore and contain only lowercase letters,
                digits, underscores, and hyphens.

EXAMPLES
       sudo useradd alice         Create user alice.
       sudo useradd testuser      Create user testuser.

FILES
       /etc/passwd    User account information.
       /etc/shadow    Secure user password hashes.
       /etc/group     Group information.

SEE ALSO
       passwd(1), userdel(8), su(1)`,
};

// ── passwd ──

const passwd_cmd: CommandDefinition = {
  name: 'passwd',
  async execute(args, ctx) {
    const target = args[0] ?? ctx.user;

    // Non-root users can only change their own password
    if (target !== ctx.user && ctx.user !== 'root' && !ctx.sudo) {
      ctx.out(`passwd: Only root can specify a user name.`);
      return;
    }

    // Verify user exists in /etc/passwd
    const passwdContent = ctx.fs.readFile('/etc/passwd', 'root') ?? '';
    const exists = passwdContent.split('\n').some(line => line.split(':')[0] === target);
    if (!exists) {
      ctx.out(`passwd: user '${target}' does not exist`);
      return;
    }

    ctx.out(`Changing password for user ${target}.`);

    if (ctx.user !== 'root' && !ctx.sudo) {
      await ctx.promptPassword('Current password: ');
    }

    await ctx.promptPassword('New password: ');
    await ctx.promptPassword('Retype new password: ');

    // Mock updating /etc/shadow
    const shadowPath = '/etc/shadow';
    const shadowContent = ctx.fs.readFile(shadowPath, 'root') ?? '';
    const shadowLines = shadowContent.split('\n');
    let updated = false;
    const newShadowLines = shadowLines.map(line => {
      if (line.startsWith(target + ':')) {
        updated = true;
        const parts = line.split(':');
        parts[1] = '$6$rounds=4096$fakesalt$fakehashedpassword' + target;
        return parts.join(':');
      }
      return line;
    });
    if (updated) {
      ctx.fs.writeFile(shadowPath, newShadowLines.join('\n'), 'root', true);
    }

    ctx.out(`passwd: all authentication tokens updated successfully.`);
  },
  man: `PASSWD(1)                    User Commands                    PASSWD(1)

NAME
       passwd - update user's authentication tokens

SYNOPSIS
       passwd [username]

DESCRIPTION
       passwd changes passwords for user accounts. A normal user may only
       change the password for their own account; the superuser (root) may
       change the password for any account.

       You will be prompted for the new password twice to confirm it.

       Requires root privileges to change another user's password.

EXAMPLES
       passwd              Change your own password.
       sudo passwd alice   Change alice's password as root.

FILES
       /etc/shadow    Secure password hashes (updated on success).

SEE ALSO
       useradd(8), su(1), chage(1)`,
};

// ── userdel ──

const userdel: CommandDefinition = {
  name: 'userdel',
  async execute(args, ctx) {
    const removeHome = args.includes('-r');
    const username = args.find(a => !a.startsWith('-'));

    if (!username) {
      ctx.out('usage: userdel [-r] LOGIN');
      return;
    }

    if (ctx.user !== 'root' && !ctx.sudo) {
      ctx.out('userdel: Permission denied.');
      return;
    }

    if (username === 'root' || username === 'guest') {
      ctx.out(`userdel: user '${username}' cannot be removed (system account)`);
      return;
    }

    // Check /etc/passwd
    const passwdPath = '/etc/passwd';
    const passwdContent = ctx.fs.readFile(passwdPath, 'root') ?? '';
    const passwdLines = passwdContent.split('\n').filter(Boolean);
    const filtered = passwdLines.filter(line => line.split(':')[0] !== username);
    if (filtered.length === passwdLines.length) {
      ctx.out(`userdel: user '${username}' does not exist`);
      return;
    }

    ctx.fs.writeFile(passwdPath, filtered.join('\n') + '\n', 'root', true);

    // Remove from /etc/shadow
    const shadowPath = '/etc/shadow';
    const shadowContent = ctx.fs.readFile(shadowPath, 'root') ?? '';
    const shadowFiltered = shadowContent.split('\n').filter(line => !line.startsWith(username + ':'));
    ctx.fs.writeFile(shadowPath, shadowFiltered.join('\n'), 'root', true);

    // Remove from /etc/group
    const groupPath = '/etc/group';
    const groupContent = ctx.fs.readFile(groupPath, 'root') ?? '';
    const groupFiltered = groupContent.split('\n').filter(line => line.split(':')[0] !== username);
    ctx.fs.writeFile(groupPath, groupFiltered.join('\n'), 'root', true);

    if (removeHome) {
      const homePath = `/home/${username}`;
      const homeNode = ctx.fs.getNode(homePath);
      if (homeNode) {
        ctx.fs.remove(homePath, 'root', true, true);
        ctx.out(`userdel: home directory '${homePath}' removed`);
      }
    }

    ctx.out(`userdel: user '${username}' removed`);
  },
  man: `USERDEL(8)               System Manager's Manual        USERDEL(8)

NAME
       userdel - delete a user account

SYNOPSIS
       userdel [-r] LOGIN

DESCRIPTION
       userdel removes a user account from the system. It deletes the
       entry from /etc/passwd, /etc/shadow, and /etc/group. With -r,
       it also removes the user's home directory.

       System accounts (root, guest) cannot be removed.

       Requires root privileges (use sudo).

OPTIONS
       -r     Remove the user's home directory and its contents.

EXAMPLES
       sudo userdel alice       Remove user alice (keep home).
       sudo userdel -r alice    Remove alice and their home directory.

FILES
       /etc/passwd    User account information.
       /etc/shadow    Password hashes.
       /etc/group     Group information.

SEE ALSO
       useradd(8), passwd(1)`,
};

// ── id command ──

const id: CommandDefinition = {
  name: 'id',
  async execute(args, ctx) {
    const target = args[0] ?? ctx.user;
    const passwdContent = ctx.fs.readFile('/etc/passwd', 'root') ?? '';
    let found = false;
    for (const line of passwdContent.split('\n')) {
      const parts = line.split(':');
      if (parts[0] === target) {
        const uid = parts[2];
        const gid = parts[3];
        const groupContent = ctx.fs.readFile('/etc/group', 'root') ?? '';
        let groupName = target;
        for (const gl of groupContent.split('\n')) {
          const gp = gl.split(':');
          if (gp[2] === gid) { groupName = gp[0]; break; }
        }
        const groups = [`${gid}(${groupName})`];
        for (const gl of groupContent.split('\n')) {
          const gp = gl.split(':');
          if (gp[3] && gp[3].split(',').includes(target) && gp[2] !== gid) {
            groups.push(`${gp[2]}(${gp[0]})`);
          }
        }
        ctx.out(`uid=${uid}(${target}) gid=${gid}(${groupName}) groups=${groups.join(',')}`);
        found = true;
        break;
      }
    }
    if (!found) {
      ctx.out(`id: '${target}': no such user`);
    }
  },
  man: `ID(1)                        User Commands                        ID(1)

NAME
       id - print real and effective user and group IDs

SYNOPSIS
       id [USERNAME]

DESCRIPTION
       Print user and group information for the specified USERNAME, or the
       current user if none is given. Shows the numeric UID, GID, and all
       group memberships.

EXAMPLES
       id                Show current user's identity.
       id root           Show root's identity.
       id alice          Show alice's identity.

SEE ALSO
       whoami(1), groups(1)`,
};

// ── groups command ──

const groups: CommandDefinition = {
  name: 'groups',
  async execute(args, ctx) {
    const target = args[0] ?? ctx.user;
    const groupContent = ctx.fs.readFile('/etc/group', 'root') ?? '';
    const memberOf: string[] = [];
    for (const line of groupContent.split('\n')) {
      const parts = line.split(':');
      if (!parts[0]) continue;
      if (parts[0] === target) {
        memberOf.push(parts[0]);
      } else if (parts[3] && parts[3].split(',').includes(target)) {
        memberOf.push(parts[0]);
      }
    }
    if (memberOf.length === 0) {
      ctx.out(`groups: '${target}': no such user`);
    } else {
      ctx.out(`${target} : ${memberOf.join(' ')}`);
    }
  },
  man: `GROUPS(1)                    User Commands                    GROUPS(1)

NAME
       groups - print the groups a user is in

SYNOPSIS
       groups [USERNAME]

DESCRIPTION
       Print the group memberships for the specified USERNAME, or for the
       current user if none is given.

EXAMPLES
       groups             Show groups for current user.
       groups alice       Show groups for alice.

SEE ALSO
       id(1), useradd(8)`,
};

export const sysAdminCommands: CommandDefinition[] = [
  systemctl, journalctl, firewall_cmd, useradd, passwd_cmd, userdel, id, groups,
];
