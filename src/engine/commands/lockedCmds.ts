import type { CommandDefinition, CommandContext } from './types';
import { sleep } from './types';
import { formatUptime, getDeviceMemoryGB, getCPUCores, dynamicMemKB, detectAppleSilicon } from './systemOps';

function extractStdin(args: string[]): { cleanArgs: string[]; stdin: string | null } {
  const stdinArg = args.find((a) => a.startsWith('__stdin__:'));
  const cleanArgs = args.filter((a) => !a.startsWith('__stdin__:'));
  const stdin = stdinArg ? stdinArg.slice('__stdin__:'.length) : null;
  return { cleanArgs, stdin };
}

function walkTreeLines(
  ctx: CommandContext,
  dirPath: string,
  prefix: string,
  lines: string[]
): void {
  let entries = ctx.fs.listDir(dirPath, ctx.user);
  entries = entries.filter((n) => !n.startsWith('.'));
  for (let i = 0; i < entries.length; i++) {
    const name = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const full = dirPath === '/' ? `/${name}` : `${dirPath}/${name}`;
    const node = ctx.fs.getNode(full);
    lines.push(prefix + connector + name);
    if (node?.type === 'directory') {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      walkTreeLines(ctx, full, childPrefix, lines);
    }
  }
}

const tree: CommandDefinition = {
  name: 'tree',
  requiresPackage: 'tree',
  async execute(args, ctx) {
    const target = args.find((a) => !a.startsWith('-')) ?? '.';
    const resolved = ctx.fs.resolvePath(ctx.cwd, target);
    const node = ctx.fs.getNode(resolved);
    if (!node || node.type !== 'directory') {
      ctx.out(`${target} [error opening dir]`);
      return;
    }
    ctx.out(resolved === '/home/guest' ? '.' : resolved);
    const lines: string[] = [];
    walkTreeLines(ctx, resolved, '', lines);
    for (const line of lines) ctx.out(line);
    let dirs = 0;
    let files = 0;
    for (const line of lines) {
      const name = line.replace(/^[│├└─ ]+/, '');
      const full = resolved === '/' ? `/${name}` : `${resolved}/${name}`;
      const n = ctx.fs.getNode(full);
      if (n?.type === 'directory') dirs++;
      else files++;
    }
    ctx.out('');
    ctx.out(`${dirs} directories, ${files} files`);
  },
  man: `TREE(1)                      User Commands                     TREE(1)

NAME
       tree - list contents of directories in a tree-like format

SYNOPSIS
       tree [directory]

DESCRIPTION
       tree is a recursive directory listing program that produces a depth-
       indented listing of files. It uses ASCII line-drawing characters to
       show the tree structure visually.

       By default tree lists the current directory. Hidden files (starting
       with .) are not shown.

       This command requires installation: dnf install tree

EXAMPLES
       tree              Show tree of current directory.
       tree /etc          Show tree of /etc.

SEE ALSO
       ls(1), find(1)`,
};

const htop: CommandDefinition = {
  name: 'htop',
  requiresPackage: 'htop',
  async execute(_args, ctx) {
    ctx.setLiveMode(true);
    try {
      while (!ctx.isInterrupted()) {
        const cores = getCPUCores();
        const totalGB = getDeviceMemoryGB();
        const mem = dynamicMemKB(totalGB);
        const { uptimeStr } = formatUptime(ctx.bootTime);
        const usedGB = (mem.used / (1024 * 1024)).toFixed(1);
        const totalGBStr = (mem.total / (1024 * 1024)).toFixed(1);
        const usedPct = mem.used / mem.total;
        const memBarFill = Math.round(usedPct * 20);

        const bar = (pct: number) => {
          const filled = Math.round(pct / 5);
          return '[' + '|'.repeat(filled) + ' '.repeat(20 - filled) + `] ${pct.toFixed(1)}%`;
        };

        ctx.rawOut('\x1b[2J\x1b[H');
        for (let c = 0; c < cores; c++) {
          const pct = Math.random() * 25 + 0.5;
          ctx.out(`  CPU${String(c + 1).padEnd(3)} ${bar(pct)}`);
        }
        ctx.out(`  Mem   [${'|'.repeat(memBarFill)}${' '.repeat(20 - memBarFill)}] ${usedGB}G/${totalGBStr}G`);
        ctx.out('  Swp   [                    ] 0K/2.0G');
        ctx.out('');
        ctx.out('  Tasks: 94, 287 thr; 1 running');
        const l1 = (Math.random() * 0.15 + 0.02).toFixed(2);
        const l5 = (Math.random() * 0.10 + 0.01).toFixed(2);
        const l15 = (Math.random() * 0.08 + 0.02).toFixed(2);
        ctx.out(`  Load average: ${l1} ${l5} ${l15}`);
        ctx.out(`  Uptime: ${uptimeStr}`);
        ctx.out('');
        ctx.out('    PID USER      PRI  NI  VIRT   RES   SHR S CPU%  MEM%   TIME+  Command');
        for (const p of ctx.getProcesses().slice(0, 12)) {
          const virt = `${(12 + p.pid / 1000).toFixed(0)}M`.padStart(5);
          const res = `${(1.5 + p.mem * 10).toFixed(1)}M`.padStart(5);
          const shr = `${(1.0 + p.mem * 6).toFixed(1)}M`.padStart(5);
          ctx.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(9)} 20   0 ${virt} ${res} ${shr} ${p.state} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(5)}  0:00.10 ${p.command}`);
        }
        ctx.out('');
        ctx.out("Press 'q' or Ctrl+C to quit.");
        await sleep(1000);
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
    }
  },
  man: `HTOP(1)                      User Commands                     HTOP(1)

NAME
       htop - interactive process viewer

SYNOPSIS
       htop

DESCRIPTION
       htop is an interactive process viewer for Linux. It is similar to
       top but provides a more user-friendly interface with CPU usage bars,
       color-coded output, and the ability to scroll and search processes.

       The header shows per-CPU usage bars, memory/swap meters, task count,
       load average, and uptime. The process list shows PID, user, priority,
       virtual/resident memory, CPU%, MEM%, and command.

       This command requires installation: dnf install htop

EXAMPLES
       htop              Launch the interactive process viewer (live refresh).

SEE ALSO
       top(1), ps(1), free(1)`,
};

const wget: CommandDefinition = {
  name: 'wget',
  requiresPackage: 'wget',
  async execute(args, ctx) {
    const url = args.find((a) => !a.startsWith('-'));
    if (!url) { ctx.out('wget: missing URL'); ctx.out('Usage: wget [URL]'); return; }
    const filename = url.split('/').pop() || 'index.html';
    ctx.out(`--2024-01-01 00:00:00--  ${url}`);
    ctx.out(`Resolving ${url.replace(/https?:\/\//, '').split('/')[0]}... 93.184.216.34`);
    await sleep(400);
    ctx.out(`Connecting... connected.`);
    ctx.out(`HTTP request sent, awaiting response... 200 OK`);
    await sleep(300);
    ctx.out(`Length: 1256 (1.2K) [text/html]`);
    ctx.out(`Saving to: '${filename}'`);
    ctx.out('');
    await sleep(200);
    ctx.out(`${filename}          100%[===================>]   1.23K  --.-KB/s    in 0s`);
    await sleep(300);
    ctx.out('');
    ctx.out(`2024-01-01 00:00:01 (12.3 MB/s) - '${filename}' saved [1256/1256]`);
    const mockContent = `<!-- Downloaded from ${url} -->\n<html><body><p>Mock downloaded content</p></body></html>\n`;
    const resolved = ctx.fs.resolvePath(ctx.cwd, filename);
    ctx.fs.writeFile(resolved, mockContent, ctx.user, ctx.sudo);
  },
  man: `WGET(1)                      User Commands                     WGET(1)

NAME
       wget - non-interactive network downloader

SYNOPSIS
       wget [URL]

DESCRIPTION
       wget is a free utility for non-interactive download of files from
       the web. It supports HTTP, HTTPS, and FTP. Unlike curl, wget can
       download recursively and resume interrupted downloads.

       The downloaded file is saved in the current directory with the
       filename extracted from the URL.

       This command requires installation: dnf install wget

OPTIONS
       -O file        Write to file instead of deriving from URL.
       -q             Quiet mode (no output).

EXAMPLES
       wget http://example.com/data.txt     Download data.txt.
       wget http://example.com/archive.zip  Download archive.zip.

SEE ALSO
       curl(1)`,
};

const unzip: CommandDefinition = {
  name: 'unzip',
  requiresPackage: 'unzip',
  async execute(args, ctx) {
    const zipFile = args.find((a) => !a.startsWith('-'));
    if (!zipFile) { ctx.out('unzip: missing operand'); ctx.out('Usage: unzip file.zip'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, zipFile);
    const node = ctx.fs.getNode(resolved);
    if (!node || node.type !== 'file') {
      ctx.out(`unzip: cannot find or open ${zipFile}`);
      return;
    }
    const baseName = zipFile.replace(/\.zip$/i, '');
    const dirPath = ctx.fs.resolvePath(ctx.cwd, baseName);
    ctx.out(`Archive:  ${zipFile}`);
    await sleep(300);
    ctx.out(`   creating: ${baseName}/`);
    ctx.fs.mkdir(dirPath, ctx.user, ctx.sudo);
    await sleep(200);
    const mockFiles = ['README.md', 'data.csv', 'config.json'];
    const mockContents: Record<string, string> = {
      'README.md': `# ${baseName}\n\nExtracted from ${zipFile}.\n`,
      'data.csv': 'id,name,value\n1,alpha,100\n2,beta,200\n3,gamma,300\n',
      'config.json': '{\n  "name": "' + baseName + '",\n  "version": "1.0.0"\n}\n',
    };
    for (const file of mockFiles) {
      await sleep(150);
      ctx.out(`  inflating: ${baseName}/${file}`);
      const filePath = dirPath === '/' ? `/${file}` : `${dirPath}/${file}`;
      ctx.fs.writeFile(filePath, mockContents[file], ctx.user, ctx.sudo);
    }
  },
  man: `UNZIP(1)                     User Commands                    UNZIP(1)

NAME
       unzip - list, test and extract compressed files in a ZIP archive

SYNOPSIS
       unzip file.zip

DESCRIPTION
       unzip extracts files from ZIP format archives. It creates a directory
       named after the archive (minus .zip extension) and extracts files
       into it.

       The .zip file must exist in the VFS. Use wget to download one first,
       or create a file with nano and name it something.zip.

       This command requires installation: dnf install unzip

EXAMPLES
       unzip archive.zip        Extract archive.zip into archive/.
       wget http://example.com/data.zip && unzip data.zip

SEE ALSO
       zip(1), tar(1)`,
};

const ifconfig: CommandDefinition = {
  name: 'ifconfig',
  requiresPackage: 'net-tools',
  async execute(_args, ctx) {
    ctx.out('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
    ctx.out('        inet 192.168.1.100  netmask 255.255.255.0  broadcast 192.168.1.255');
    ctx.out('        inet6 fe80::5054:ff:fe12:3456  prefixlen 64  scopeid 0x20<link>');
    ctx.out('        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)');
    ctx.out('        RX packets 15432  bytes 12345678 (11.7 MiB)');
    ctx.out('        RX errors 0  dropped 0  overruns 0  frame 0');
    ctx.out('        TX packets 10234  bytes 8765432 (8.3 MiB)');
    ctx.out('        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0');
    ctx.out('');
    ctx.out('lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536');
    ctx.out('        inet 127.0.0.1  netmask 255.0.0.0');
    ctx.out('        inet6 ::1  prefixlen 128  scopeid 0x10<host>');
    ctx.out('        loop  txqueuelen 1000  (Local Loopback)');
    ctx.out('        RX packets 256  bytes 20480 (20.0 KiB)');
    ctx.out('        RX errors 0  dropped 0  overruns 0  frame 0');
    ctx.out('        TX packets 256  bytes 20480 (20.0 KiB)');
    ctx.out('        TX errors 0  dropped 0 overruns 0  carrier 0  collisions 0');
  },
  man: `IFCONFIG(8)              System Manager's Manual          IFCONFIG(8)

NAME
       ifconfig - configure a network interface (legacy)

SYNOPSIS
       ifconfig [interface]

DESCRIPTION
       ifconfig is the legacy tool for viewing and configuring network
       interfaces. It has been superseded by the ip command on modern
       systems, but remains widely used and recognized.

       Output shows flags, MTU, IP address, netmask, broadcast, hardware
       (MAC) address, and packet/byte statistics for each interface.

       This command requires installation: dnf install net-tools

       NOTE: On modern Rocky Linux, prefer "ip addr" instead.

EXAMPLES
       ifconfig              Show all active interfaces.
       ifconfig eth0         Show only eth0.

SEE ALSO
       ip(8), nmcli(1)`,
};

const dig: CommandDefinition = {
  name: 'dig',
  requiresPackage: 'bind-utils',
  async execute(args, ctx) {
    const domain = args.find((a) => !a.startsWith('-') && !a.startsWith('+') && !a.startsWith('@'));
    if (!domain) {
      ctx.out('Usage: dig [@server] domain [type]');
      return;
    }
    const qtype = args.find((a) => ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT'].includes(a.toUpperCase()));
    const rtype = qtype?.toUpperCase() ?? 'A';
    const fakeIP = '93.184.216.34';
    await sleep(200);
    ctx.out('');
    ctx.out(`; <<>> DiG 9.16.23-RH <<>> ${domain}`);
    ctx.out(';; global options: +cmd');
    ctx.out(';; Got answer:');
    ctx.out(';; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345');
    ctx.out(';; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1');
    ctx.out('');
    ctx.out(';; OPT PSEUDOSECTION:');
    ctx.out('; EDNS: version: 0, flags:; udp: 4096');
    ctx.out(';; QUESTION SECTION:');
    ctx.out(`;${domain}.                     IN      ${rtype}`);
    ctx.out('');
    ctx.out(';; ANSWER SECTION:');
    ctx.out(`${domain}.              300     IN      ${rtype}     ${fakeIP}`);
    ctx.out('');
    ctx.out(`;; Query time: 12 msec`);
    ctx.out(`;; SERVER: 8.8.8.8#53(8.8.8.8)`);
    ctx.out(`;; WHEN: Wed Jan 01 00:00:00 UTC 2024`);
    ctx.out(`;; MSG SIZE  rcvd: 56`);
  },
  man: `DIG(1)                       User Commands                      DIG(1)

NAME
       dig - DNS lookup utility

SYNOPSIS
       dig [@server] domain [type]

DESCRIPTION
       dig (Domain Information Groper) is a flexible tool for querying DNS
       name servers. It performs DNS lookups and displays the answers returned.
       dig is the tool of choice for diagnosing DNS issues.

       The output includes:
         QUESTION SECTION   The query that was sent.
         ANSWER SECTION     The DNS records returned (A, AAAA, MX, etc.).
         Query time          How long the lookup took.
         SERVER              Which DNS server answered.

       Record types: A (IPv4), AAAA (IPv6), MX (mail), NS (nameserver),
       CNAME (alias), TXT (text records).

       This command requires installation: dnf install bind-utils

EXAMPLES
       dig example.com              Query A record for example.com.
       dig example.com MX           Query mail exchange records.
       dig @8.8.8.8 example.com     Query using Google's DNS.

SEE ALSO
       nslookup(1), host(1), ip(8)`,
};

// ── fastfetch ──

const ROCKY_ASCII = [
  '\x1b[32m        `-/+++++++++/-.`       \x1b[0m',
  '\x1b[32m     `/syyyyyyyyyyyyyyyys/.    \x1b[0m',
  '\x1b[32m   `/yyyyyyyyyyyyyyyyyyyyyys-. \x1b[0m',
  '\x1b[32m  .yyyyyyyyyyyyyyyyyyyyyyyyyyy:\x1b[0m',
  '\x1b[32m  +yyyyyyyyy/-.....-/yyyyyyyyy+\x1b[0m',
  '\x1b[32m  +yyyyyyyy:         :yyyyyyyy+\x1b[0m',
  '\x1b[32m  +yyyyyyyy:         :yyyyyyyy+\x1b[0m',
  '\x1b[32m  +yyyyyyyy:         :yyyyyyyy+\x1b[0m',
  '\x1b[32m  +yyyyyyyy:    `    :yyyyyyyy+\x1b[0m',
  '\x1b[32m  +yyyyyyyyy/.`   `./yyyyyyyyy+\x1b[0m',
  '\x1b[32m  .yyyyyyyyyyyyyyyyyyyyyyyyyyy.\x1b[0m',
  '\x1b[32m   `/yyyyyyyyyyyyyyyyyyyyyys/. \x1b[0m',
  '\x1b[32m     `/syyyyyyyyyyyyyyyys/.    \x1b[0m',
  '\x1b[32m        `-/+++++++++/-.`       \x1b[0m',
];

const fastfetch: CommandDefinition = {
  name: 'fastfetch',
  requiresPackage: 'fastfetch',
  async execute(_args, ctx) {
    const { uptimeStr } = formatUptime(ctx.bootTime);
    const totalGB = getDeviceMemoryGB();
    const mem = dynamicMemKB(totalGB);
    const cores = getCPUCores();
    const arch = detectAppleSilicon() ? 'aarch64' : 'x86_64';
    const pkgCount = ctx.installedPackages.size;
    const usedMiB = Math.round(mem.used / 1024);
    const totalMiB = Math.round(mem.total / 1024);

    const info: string[] = [
      `\x1b[1;32m${ctx.user}@${ctx.hostname}\x1b[0m`,
      '\x1b[32m' + '-'.repeat((ctx.user + '@' + ctx.hostname).length) + '\x1b[0m',
      `\x1b[1;32mOS\x1b[0m: Rocky Linux 9.3 (Blue Onyx) ${arch}`,
      `\x1b[1;32mHost\x1b[0m: QEMU Standard PC (i440FX + PIIX, 1996)`,
      `\x1b[1;32mKernel\x1b[0m: 5.14.0-362.8.1.el9_3.${arch}`,
      `\x1b[1;32mUptime\x1b[0m: ${uptimeStr}`,
      `\x1b[1;32mPackages\x1b[0m: ${pkgCount} (dnf)`,
      `\x1b[1;32mShell\x1b[0m: bash 5.1.8`,
      `\x1b[1;32mTerminal\x1b[0m: PocketTerm`,
      `\x1b[1;32mCPU\x1b[0m: ${detectAppleSilicon() ? `Apple Silicon (${cores})` : `Intel Xeon E5-2680 v4 (${cores}) @ 2.40GHz`}`,
      `\x1b[1;32mMemory\x1b[0m: ${usedMiB}MiB / ${totalMiB}MiB`,
      '',
      '\x1b[40m  \x1b[41m  \x1b[42m  \x1b[43m  \x1b[44m  \x1b[45m  \x1b[46m  \x1b[47m  \x1b[0m',
      '\x1b[100m  \x1b[101m  \x1b[102m  \x1b[103m  \x1b[104m  \x1b[105m  \x1b[106m  \x1b[107m  \x1b[0m',
    ];

    const rows = Math.max(ROCKY_ASCII.length, info.length);
    for (let i = 0; i < rows; i++) {
      const art = i < ROCKY_ASCII.length ? ROCKY_ASCII[i] : ''.padEnd(31);
      const stat = i < info.length ? info[i] : '';
      ctx.out(`${art}  ${stat}`);
    }
  },
  man: `FASTFETCH(1)                 User Commands                 FASTFETCH(1)

NAME
       fastfetch - fast system information tool

SYNOPSIS
       fastfetch

DESCRIPTION
       fastfetch is a neofetch-like tool for fetching system information
       and displaying it alongside an ASCII art logo. It is written in C
       and is significantly faster than neofetch.

       Displayed information includes: OS, Host, Kernel, Uptime, installed
       packages, shell, terminal, CPU (real core count from your browser),
       and memory (real device memory from your browser).

       This command requires installation: dnf install fastfetch

EXAMPLES
       fastfetch         Display system info with Rocky Linux logo.

SEE ALSO
       uname(1), lscpu(1), free(1)`,
};

const git: CommandDefinition = {
  name: 'git',
  requiresPackage: 'git',
  async execute(args, ctx) {
    const sub = args[0];
    const repoPath = ctx.fs.resolvePath(ctx.cwd, '.git');
    const isRepo = !!ctx.fs.getNode(repoPath);

    if (!sub || sub === '--help' || sub === 'help') {
      ctx.out('usage: git [--version] [--help] <command> [<args>]');
      ctx.out('');
      ctx.out('These are common Git commands used in various situations:');
      ctx.out('   init      Create an empty Git repository');
      ctx.out('   status    Show the working tree status');
      ctx.out('   add       Add file contents to the index');
      ctx.out('   commit    Record changes to the repository');
      ctx.out('   log       Show commit logs');
      ctx.out('   branch    List branches');
      return;
    }

    if (sub === '--version' || sub === 'version') {
      ctx.out('git version 2.39.3');
      return;
    }

    if (sub === 'init') {
      if (isRepo) {
        ctx.out(`Reinitialized existing Git repository in ${ctx.cwd}/.git/`);
        return;
      }
      const ok1 = ctx.fs.mkdir(repoPath, ctx.user, ctx.sudo);
      const ok2 = ctx.fs.mkdir(`${repoPath}/objects`, ctx.user, ctx.sudo);
      const ok3 = ctx.fs.mkdir(`${repoPath}/refs`, ctx.user, ctx.sudo);
      const ok4 = ctx.fs.mkdir(`${repoPath}/refs/heads`, ctx.user, ctx.sudo);
      const ok5 = ctx.fs.writeFile(`${repoPath}/HEAD`, 'ref: refs/heads/main\n', ctx.user, ctx.sudo);
      if (!(ok1 && ok2 && ok3 && ok4 && ok5)) {
        ctx.out('fatal: could not create .git directory');
        ctx.setExitCode(128);
        return;
      }
      ctx.out(`Initialized empty Git repository in ${ctx.cwd}/.git/`);
      return;
    }

    if (!isRepo) {
      ctx.out('fatal: not a git repository (or any of the parent directories): .git');
      ctx.setExitCode(128);
      return;
    }

    switch (sub) {
      case 'status':
        ctx.out('On branch main');
        ctx.out('nothing to commit, working tree clean');
        return;
      case 'branch':
        ctx.out('* main');
        return;
      case 'log':
        ctx.out('commit 4f3e2d1 (HEAD -> main)');
        ctx.out(`Author: ${ctx.user} <${ctx.user}@pocket-term.local>`);
        ctx.out('Date:   Thu Feb 26 12:00:00 2026 -0500');
        ctx.out('');
        ctx.out('    Initial commit (simulated)');
        return;
      case 'add':
        if (!args[1]) {
          ctx.out('Nothing specified, nothing added.');
          ctx.out("hint: Maybe you wanted to say 'git add .'?");
          ctx.setExitCode(1);
          return;
        }
        return;
      case 'commit': {
        const mIdx = args.indexOf('-m');
        const msg = mIdx >= 0 ? args[mIdx + 1] : null;
        if (!msg) {
          ctx.out('error: switch `m\' requires a value');
          ctx.setExitCode(129);
          return;
        }
        ctx.out('[main 9c2f1b7] ' + msg);
        ctx.out(' 1 file changed, 1 insertion(+)');
        return;
      }
      default:
        ctx.out(`git: '${sub}' is not a git command. See 'git --help'.`);
        ctx.setExitCode(1);
    }
  },
  man: `GIT(1)                        User Commands                       GIT(1)

NAME
       git - the stupid content tracker

SYNOPSIS
       git [--version] [--help] <command> [<args>]

DESCRIPTION
       Git is a distributed version control system. In this simulation, core
       workflows are supported: init, status, add, commit, log, and branch.

       This command requires installation: dnf install git

EXAMPLES
       git init
       git status
       git add .
       git commit -m "message"

SEE ALSO
       dnf(8), man(1)`,
};

const nginxCmd: CommandDefinition = {
  name: 'nginx',
  requiresPackage: 'nginx',
  async execute(args, ctx) {
    if (args.includes('-v') || args.includes('-V') || args.includes('--version')) {
      ctx.out('nginx version: nginx/1.20.1');
      return;
    }
    if (args.includes('-t')) {
      const conf = '/etc/nginx/nginx.conf';
      const content = ctx.fs.readFile(conf, ctx.user) ?? ctx.fs.readFile(conf, 'root');
      if (content === null) {
        ctx.out(`nginx: [emerg] open() "${conf}" failed (2: No such file or directory)`);
        ctx.out('nginx: configuration file /etc/nginx/nginx.conf test failed');
        ctx.setExitCode(1);
        return;
      }
      ctx.out('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok');
      ctx.out('nginx: configuration file /etc/nginx/nginx.conf test is successful');
      return;
    }
    if (args.length > 0) {
      ctx.out(`nginx: invalid option: "${args[0]}"`);
      ctx.out('usage: nginx [-?hvVtTq] [-s signal] [-p prefix] [-e filename] [-c filename] [-g directives]');
      ctx.setExitCode(1);
      return;
    }
    ctx.out('nginx: [notice] start worker process 1234');
    ctx.out('nginx: [notice] start worker process 1235');
    ctx.out('Hint: service lifecycle is managed with systemctl in this simulation.');
  },
  man: `NGINX(8)                    System Manager's Manual           NGINX(8)

NAME
       nginx - high performance web server and reverse proxy

SYNOPSIS
       nginx [-?hvVtTq] [-s signal] [-p prefix] [-e filename] [-c filename] [-g directives]

DESCRIPTION
       nginx is an HTTP and reverse proxy server. In this simulation, core
       utility flags are supported:

       -v, -V      Show version information.
       -t          Test configuration syntax.

       This command requires installation: dnf install nginx

EXAMPLES
       nginx -v
       nginx -t
       systemctl status nginx
`,
};

const tmux: CommandDefinition = {
  name: 'tmux',
  requiresPackage: 'tmux',
  async execute(args, ctx) {
    if (args[0] === '-V' || args[0] === '--version') {
      ctx.out('tmux 3.2a');
      return;
    }
    ctx.out('open terminal failed: not a terminal');
    ctx.out('tmux in browser mode is limited in this simulation.');
    ctx.setExitCode(1);
  },
  man: `TMUX(1)                       User Commands                      TMUX(1)

NAME
       tmux - terminal multiplexer

SYNOPSIS
       tmux [command [flags]]

DESCRIPTION
       tmux lets you create and manage terminal sessions, windows, and panes.
       In this simulation, tmux command surface is minimal.

       This command requires installation: dnf install tmux
`,
};

const gcc: CommandDefinition = {
  name: 'gcc',
  requiresPackage: 'gcc',
  async execute(args, ctx) {
    if (args.includes('--version') || args.includes('-v')) {
      ctx.out('gcc (GCC) 11.4.1 20230605 (Rocky Linux 11.4.1-2.1.el9)');
      return;
    }
    const src = args.find((a) => a.endsWith('.c') || a.endsWith('.cc') || a.endsWith('.cpp'));
    if (!src) {
      ctx.out('gcc: fatal error: no input files');
      ctx.out('compilation terminated.');
      ctx.setExitCode(1);
      return;
    }
    const srcPath = ctx.fs.resolvePath(ctx.cwd, src);
    const content = ctx.fs.readFile(srcPath, ctx.user);
    if (content === null) {
      ctx.out(`gcc: error: ${src}: No such file or directory`);
      ctx.setExitCode(1);
      return;
    }
    const outIdx = args.indexOf('-o');
    const outName = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : 'a.out';
    const outPath = ctx.fs.resolvePath(ctx.cwd, outName);
    const ok = ctx.fs.writeFile(outPath, '#!/bin/sh\necho "hello from mock binary"\n', ctx.user, ctx.sudo);
    if (!ok) {
      ctx.out(`gcc: error: cannot write output file ${outName}`);
      ctx.setExitCode(1);
    }
  },
  man: `GCC(1)                        User Commands                       GCC(1)

NAME
       gcc - GNU project C and C++ compiler

SYNOPSIS
       gcc [options] file...

DESCRIPTION
       gcc compiles C/C++ source code. This simulation supports --version and
       simple compile output generation via -o.

       This command requires installation: dnf install gcc
`,
};

const makeCmd: CommandDefinition = {
  name: 'make',
  requiresPackage: 'make',
  async execute(args, ctx) {
    if (args.includes('--version')) {
      ctx.out('GNU Make 4.3');
      return;
    }
    const mf = ctx.fs.readFile(ctx.fs.resolvePath(ctx.cwd, 'Makefile'), ctx.user);
    if (mf === null) {
      ctx.out("make: *** No targets specified and no makefile found.  Stop.");
      ctx.setExitCode(2);
      return;
    }
    ctx.out("make: Nothing to be done for 'all'.");
  },
  man: `MAKE(1)                       User Commands                      MAKE(1)

NAME
       make - GNU make utility to maintain groups of programs

SYNOPSIS
       make [options] [target] ...

DESCRIPTION
       make executes build recipes defined in a Makefile.

       This command requires installation: dnf install make
`,
};

const python3: CommandDefinition = {
  name: 'python3',
  requiresPackage: 'python3',
  async execute(args, ctx) {
    if (args.includes('--version') || args.includes('-V')) {
      ctx.out('Python 3.9.18');
      return;
    }
    if (args[0] === '-c' && args[1]) {
      if (args[1].includes('print(')) {
        const m = args[1].match(/print\((['"])(.*?)\1\)/);
        if (m) ctx.out(m[2]);
      }
      return;
    }
    ctx.out('Python 3.9.18 (main, Nov  8 2023, 00:00:00)');
    ctx.out('[GCC 11.4.1] on linux');
    ctx.out("Type \"help\", \"copyright\", \"credits\" or \"license\" for more information.");
    ctx.out('>>>');
  },
  man: `PYTHON3(1)                    User Commands                   PYTHON3(1)

NAME
       python3 - an interpreted, interactive, object-oriented language

SYNOPSIS
       python3 [option] ... [-c cmd | -m mod | file | -] [arg] ...

DESCRIPTION
       Python is a high-level programming language. This simulation supports
       --version and a lightweight -c print() path.

       This command requires installation: dnf install python3
`,
};

const neofetch: CommandDefinition = {
  name: 'neofetch',
  requiresPackage: 'neofetch',
  async execute(_args, ctx) {
    ctx.out('neofetch has been deprecated upstream.');
    ctx.out('Tip: install and run fastfetch for better speed.');
  },
  man: `NEOFETCH(1)                   User Commands                  NEOFETCH(1)

NAME
       neofetch - command-line system information tool

DESCRIPTION
       neofetch displays system information with ASCII art. In this simulation,
       neofetch is provided as a lightweight compatibility command.

       This command requires installation: dnf install neofetch
`,
};

const jq: CommandDefinition = {
  name: 'jq',
  requiresPackage: 'jq',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    const filter = cleanArgs[0];
    if (!filter) {
      ctx.out('usage: jq <filter> [file]');
      ctx.setExitCode(2);
      return;
    }
    const fileArg = cleanArgs[1];
    let input = stdin;
    if (!input && fileArg) {
      input = ctx.fs.readFile(ctx.fs.resolvePath(ctx.cwd, fileArg), ctx.user);
    }
    if (!input) {
      ctx.out('jq: error: no JSON input');
      ctx.setExitCode(2);
      return;
    }
    try {
      const parsed = JSON.parse(input);
      if (filter === '.') {
        ctx.out(JSON.stringify(parsed, null, 2));
        return;
      }
      const keyMatch = filter.match(/^\.(\w+)$/);
      if (keyMatch) {
        const value = (parsed as Record<string, unknown>)[keyMatch[1]];
        ctx.out(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
        return;
      }
      ctx.out(`jq: error: unsupported filter: ${filter}`);
      ctx.setExitCode(3);
    } catch {
      ctx.out('jq: parse error: Invalid numeric literal at line 1, column 1');
      ctx.setExitCode(4);
    }
  },
  man: `JQ(1)                         User Commands                        JQ(1)

NAME
       jq - command-line JSON processor

SYNOPSIS
       jq <filter> [file]

DESCRIPTION
       jq slices, filters, and transforms JSON. This simulation supports '.'
       and simple '.key' filters, plus piped stdin input.

       This command requires installation: dnf install jq
`,
};

const ncdu: CommandDefinition = {
  name: 'ncdu',
  requiresPackage: 'ncdu',
  async execute(args, ctx) {
    const target = args[0] ?? '.';
    const resolved = ctx.fs.resolvePath(ctx.cwd, target);
    const node = ctx.fs.getNode(resolved);
    if (!node || node.type !== 'directory') {
      ctx.out(`ncdu: ${target}: No such file or directory`);
      ctx.setExitCode(1);
      return;
    }
    ctx.out('--- ncdu 1.16 ~ Use the arrow keys to navigate ---');
    const entries = ctx.fs.listDir(resolved, ctx.user);
    for (const name of entries) {
      const full = resolved === '/' ? `/${name}` : `${resolved}/${name}`;
      const n = ctx.fs.getNode(full);
      if (!n) continue;
      const size = n.type === 'file' ? Math.max(1, Math.ceil(n.content.length / 1024)) : 4;
      ctx.out(`${String(size).padStart(6)} KiB  ${name}${n.type === 'directory' ? '/' : ''}`);
    }
    ctx.out('Total disk usage: simulated');
  },
  man: `NCDU(1)                       User Commands                      NCDU(1)

NAME
       ncdu - NCurses Disk Usage

SYNOPSIS
       ncdu [directory]

DESCRIPTION
       ncdu is a disk usage analyzer with an ncurses interface. This simulation
       prints a navigable-style listing summary for the target directory.

       This command requires installation: dnf install ncdu
`,
};

export const lockedCommands: CommandDefinition[] = [
  tree, htop, wget, unzip, ifconfig, dig, fastfetch,
  git, nginxCmd, tmux, gcc, makeCmd, python3, neofetch, jq, ncdu,
];
