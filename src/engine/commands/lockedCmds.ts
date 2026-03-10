import type { CommandDefinition, CommandContext } from './types';
import { sleep } from './types';
import { formatUptime, getDeviceMemoryGB, getCPUCores, dynamicMemKB, detectAppleSilicon } from './systemOps';

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

export const lockedCommands: CommandDefinition[] = [tree, htop, wget, unzip, ifconfig, dig, fastfetch];
