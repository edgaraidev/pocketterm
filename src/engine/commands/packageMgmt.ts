import type { CommandDefinition } from './types';
import { sleep } from './types';

type PackageMeta = { version: string; repo: 'baseos' | 'appstream' | 'epel' | 'extras'; desc: string; size: string; arch: 'x86_64' };

const AVAILABLE_PACKAGES: Record<string, PackageMeta> = {
  // baseos
  tar:                 { version: '2:1.34-7.el9',       repo: 'baseos',    desc: 'GNU file archiving program', size: '1.5 M', arch: 'x86_64' },
  wget:                { version: '1.21.1-7.el9',       repo: 'baseos',    desc: 'A network utility to retrieve files from the web', size: '1.2 M', arch: 'x86_64' },
  curl:                { version: '7.76.1-26.el9',      repo: 'baseos',    desc: 'A utility for getting files from remote servers', size: '684 k', arch: 'x86_64' },
  'vim-minimal':       { version: '2:8.2.2637-20.el9_2',repo: 'baseos',    desc: 'A minimal version of the VIM editor', size: '702 k', arch: 'x86_64' },
  vim:                 { version: '2:8.2.2637-20.el9_2',repo: 'baseos',    desc: 'The VIM editor (enhanced vi)', size: '1.7 M', arch: 'x86_64' },
  nano:                { version: '5.6.1-5.el9',        repo: 'baseos',    desc: 'Small and friendly text editor', size: '721 k', arch: 'x86_64' },
  'net-tools':         { version: '2.0-0.62.20160912git.el9', repo: 'baseos', desc: 'Basic networking tools (ifconfig, netstat, route)', size: '315 k', arch: 'x86_64' },
  'bind-utils':        { version: '32:9.16.23-14.el9_3.4', repo: 'baseos', desc: 'DNS lookup utilities (dig, nslookup, host)', size: '464 k', arch: 'x86_64' },
  'openssh-clients':   { version: '8.7p1-34.el9_3.3',   repo: 'baseos',    desc: 'SSH client programs (ssh, scp, sftp)', size: '766 k', arch: 'x86_64' },
  unzip:               { version: '6.0-56.el9',         repo: 'baseos',    desc: 'Utility for unpacking .zip files', size: '186 k', arch: 'x86_64' },
  tree:                { version: '1.8.0-10.el9',       repo: 'baseos',    desc: 'List directory contents in a tree-like format', size: '52 k', arch: 'x86_64' },

  // appstream
  git:                 { version: '2.39.3-1.el9_2',     repo: 'appstream', desc: 'Fast Version Control System', size: '51 M', arch: 'x86_64' },
  nginx:               { version: '1:1.20.1-16.el9_3.1', repo: 'appstream', desc: 'High performance web server', size: '35 k', arch: 'x86_64' },
  tmux:                { version: '3.2a-4.el9',         repo: 'appstream', desc: 'Terminal multiplexer', size: '370 k', arch: 'x86_64' },
  gcc:                 { version: '11.4.1-2.el9',       repo: 'appstream', desc: 'GNU Compiler Collection', size: '32 M', arch: 'x86_64' },
  make:                { version: '1:4.3-8.el9',        repo: 'appstream', desc: 'A GNU tool which simplifies the build process', size: '565 k', arch: 'x86_64' },
  python3:             { version: '3.9.18-3.el9_3',     repo: 'appstream', desc: 'Version 3 of the Python interpreter', size: '26 k', arch: 'x86_64' },

  // epel
  htop:                { version: '3.2.2-2.el9',        repo: 'epel',      desc: 'Interactive process viewer', size: '177 k', arch: 'x86_64' },
  fastfetch:           { version: '2.8.6-1.el9',        repo: 'epel',      desc: 'Fast system information tool (neofetch alternative)', size: '214 k', arch: 'x86_64' },
  neofetch:            { version: '7.1.0-6.el9',        repo: 'epel',      desc: 'CLI system information tool written in BASH', size: '97 k', arch: 'x86_64' },
  jq:                  { version: '1.6-16.el9',         repo: 'epel',      desc: 'Command-line JSON processor', size: '181 k', arch: 'x86_64' },
  ncdu:                { version: '1.16-3.el9',         repo: 'epel',      desc: 'NCurses Disk Usage', size: '54 k', arch: 'x86_64' },
};

const dnf: CommandDefinition = {
  name: 'dnf',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();
    const ensureRoot = (): boolean => {
      if (ctx.user === 'root' || ctx.sudo) return true;
      ctx.out('Error: This command has to be run with superuser privileges.');
      return false;
    };

    const getPkgArg = (): string | null => {
      const candidate = args.slice(1).find((a) => !a.startsWith('-'));
      return candidate ? candidate.toLowerCase() : null;
    };

    if (sub === 'repolist') {
      ctx.out('repo id                 repo name');
      ctx.out('appstream               Rocky Linux 9 - AppStream');
      ctx.out('baseos                  Rocky Linux 9 - BaseOS');
      ctx.out('epel                    Extra Packages for Enterprise Linux 9 - x86_64');
      ctx.out('extras                  Rocky Linux 9 - Extras');
      return;
    }

    if (sub === 'install') {
      if (!ensureRoot()) return;
      const pkg = getPkgArg();
      if (!pkg) { ctx.out('dnf: install requires a package name'); return; }
      const pkgKey = pkg;
      const info = AVAILABLE_PACKAGES[pkgKey];
      if (!info) {
        ctx.out(`Error: Unable to find a match: ${pkg}`);
        return;
      }
      if (ctx.installedPackages.has(pkgKey)) {
        ctx.out(`Package ${pkg}-${info.version} is already installed.`);
        ctx.out('Dependencies resolved.');
        ctx.out('Nothing to do.');
        ctx.out('Complete!');
        return;
      }

      // Step 1: metadata/repo sync lines
      ctx.out('Rocky Linux 9 - BaseOS                 3.2 MB/s | 2.1 MB     00:00');
      await sleep(800);
      ctx.out('Rocky Linux 9 - AppStream              2.7 MB/s | 1.8 MB     00:00');
      await sleep(800);

      // Step 2
      ctx.out('Dependencies resolved.');

      // Step 3: transaction summary
      ctx.out('================================================================================');
      ctx.out(' Package                 Arch      Version                        Repository  Size');
      ctx.out('================================================================================');
      ctx.out(` Installing:`);
      ctx.out(` ${pkgKey.padEnd(22)} ${info.arch.padEnd(9)} ${info.version.padEnd(30)} ${info.repo.padEnd(11)} ${info.size}`);
      ctx.out('');
      ctx.out('Transaction Summary');
      ctx.out('================================================================================');
      ctx.out('Install  1 Package');

      // Step 4: download + transaction
      ctx.out('Downloading Packages...');
      await sleep(800);
      ctx.out('Running transaction...');
      await sleep(800);

      // Step 5
      ctx.out(`Installed: ${pkgKey}.x86_64`);
      ctx.out('Complete!');
      ctx.installedPackages.add(pkgKey);
      ctx.persistPackages();
    } else if (sub === 'remove') {
      if (!ensureRoot()) return;
      const pkg = getPkgArg();
      if (!pkg) { ctx.out('dnf: remove requires a package name'); return; }
      const pkgKey = pkg;
      if (!ctx.installedPackages.has(pkgKey)) {
        ctx.out(`No match for argument: ${pkg}`);
        ctx.out('Error: No packages marked for removal.');
        return;
      }
      ctx.out('Dependencies resolved.');
      await sleep(300);
      ctx.out(`Removing: ${pkg}-1.0.0.el9.x86_64`);
      await sleep(500);
      ctx.out('Complete!');
      ctx.installedPackages.delete(pkgKey);
      ctx.persistPackages();
    } else if (sub === 'list') {
      const which = args[1]?.toLowerCase();
      if (which === 'installed') {
        if (ctx.installedPackages.size === 0) {
          ctx.out('No packages installed.');
        } else {
          ctx.out('Installed Packages');
          ctx.out('Package                               Version                         Repository');
          for (const pkg of ctx.installedPackages) {
            const info = AVAILABLE_PACKAGES[pkg];
            const ver = info?.version ?? '1.0.0-1.el9';
            const pkgArch = `${pkg}.x86_64`;
            ctx.out(`${pkgArch.padEnd(38)} ${ver.padEnd(30)} @System`);
          }
        }
      } else {
        ctx.out('Available Packages');
        const repoOrder: Array<'baseos' | 'appstream' | 'epel' | 'extras'> = ['baseos', 'appstream', 'epel', 'extras'];
        for (const repo of repoOrder) {
          const inRepo = Object.entries(AVAILABLE_PACKAGES)
            .filter(([, info]) => info.repo === repo)
            .sort((a, b) => a[0].localeCompare(b[0]));
          if (inRepo.length === 0) continue;
          ctx.out('');
          ctx.out(`${repo.toUpperCase()}:`);
          ctx.out('Package                               Version                         Repository');
          for (const [name, info] of inRepo) {
            const installed = ctx.installedPackages.has(name);
            const mark = installed ? ' [installed]' : '';
            const pkgArch = `${name}.x86_64`;
            ctx.out(`${pkgArch.padEnd(38)} ${info.version.padEnd(30)} ${info.repo}${mark}`);
          }
        }
      }
    } else if (sub === 'search') {
      const term = args[1]?.toLowerCase();
      if (!term) { ctx.out('dnf: search requires a search term'); return; }
      const matches = Object.entries(AVAILABLE_PACKAGES).filter(
        ([name, info]) => name.includes(term) || info.desc.toLowerCase().includes(term)
      );
      if (matches.length === 0) {
        ctx.out(`No matches found for: ${args[1]}`);
        return;
      }
      ctx.out(`========================= Name & Summary Matched: ${args[1]} =========================`);
      for (const [name, info] of matches.sort((a, b) => a[0].localeCompare(b[0]))) {
        const pkgArch = `${name}.x86_64`;
        ctx.out(`${pkgArch.padEnd(28)} : ${info.desc}`);
      }
    } else {
      ctx.out('usage: dnf [options] COMMAND');
      ctx.out('');
      ctx.out('List of Main Commands:');
      ctx.out('install          Install a package');
      ctx.out('remove           Remove a package');
      ctx.out('list             List packages (installed or available)');
      ctx.out('search           Search for packages');
    }
  },
  man: `DNF(8)                       DNF Manual                        DNF(8)

NAME
       dnf - package manager for Rocky Linux and RHEL-based systems

SYNOPSIS
       dnf [options] <command> [<args>]

DESCRIPTION
       dnf (Dandified YUM) is the default package manager on Rocky Linux 9.
       It installs, upgrades, and removes software packages, automatically
       resolving dependencies.

COMMANDS
       install <package>     Install a package.
       remove <package>      Remove an installed package.
       list installed        List installed packages.
       list available        List all available packages.
       search <term>         Search package names and descriptions.

EXAMPLES
       dnf install htop      Install the htop process viewer.
       dnf remove htop       Remove htop.
       dnf list installed    Show what's installed.
       dnf list available    Browse installable packages.
       dnf search web        Search for packages matching "web".

SEE ALSO
       yum(8), rpm(8)`,
};

const rpm: CommandDefinition = {
  name: 'rpm',
  async execute(args, ctx) {
    if (args.length === 0) {
      ctx.out('Usage: rpm [OPTION...]');
      ctx.out('  -i, --install      install package(s)');
      ctx.out('  -e, --erase        remove package(s)');
      ctx.out('  -q, --query        query package database');
      ctx.out('  -V, --verify       verify package(s)');
      return;
    }
    if (args.includes('-i') || args.includes('--install')) {
      ctx.out('warning: direct rpm install is discouraged on Rocky Linux.');
      ctx.out('Use dnf install <package> to resolve dependencies safely.');
      return;
    }
    ctx.out('rpm: operation completed (mock).');
  },
  man: `RPM(8)                    System Manager's Manual            RPM(8)

NAME
       rpm - RPM Package Manager

SYNOPSIS
       rpm [OPTION...]

DESCRIPTION
       rpm is a low-level package manager. On Rocky Linux systems, prefer
       dnf for most package operations because it handles dependencies.

EXAMPLES
       rpm -q bash
       rpm -i package.rpm

SEE ALSO
       dnf(8), yum(8)`,
};

const apt: CommandDefinition = {
  name: 'apt',
  async execute(_args, ctx) {
    ctx.out("bash: apt: command not found. This is a Red Hat based system. Use 'dnf' instead.");
  },
  man: `APT(8)                    User Commands                      APT(8)

NAME
       apt - Debian package manager frontend (not available on Rocky Linux)

SYNOPSIS
       apt

DESCRIPTION
       apt is not available in this Rocky Linux simulation. Use dnf instead.

SEE ALSO
       dnf(8), rpm(8)`,
};

const apt_get: CommandDefinition = {
  name: 'apt-get',
  async execute(_args, ctx) {
    ctx.out("bash: apt: command not found. This is a Red Hat based system. Use 'dnf' instead.");
  },
  man: `APT-GET(8)                User Commands                  APT-GET(8)

NAME
       apt-get - Debian package manager tool (not available on Rocky Linux)

SYNOPSIS
       apt-get

DESCRIPTION
       apt-get is not available in this Rocky Linux simulation. Use dnf instead.

SEE ALSO
       dnf(8), rpm(8)`,
};

export const packageMgmtCommands: CommandDefinition[] = [dnf, rpm, apt, apt_get];
