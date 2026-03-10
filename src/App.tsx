import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TerminalUI } from './components/TerminalUI';
import { FileSystem } from './engine/fileSystem';
import { loadHardwareState, persistHardwareState, type HardwareState } from './engine/hardwareState';
import { clearPocketTermStorage } from './engine/storage';
import { loadTutorialFromSearch, type TutorialCartridge } from './engine/tutorials';

type AppState = 'shell' | 'grub' | 'bios' | 'booting' | 'login';

const BOOT_LINES: string[] = [
  '[  OK  ] Started udev Coldplug all Devices.',
  '[  OK  ] Started Journal Service.',
  '[  OK  ] Reached target Local File Systems.',
  '[  OK  ] Starting Network Manager...',
  '[  OK  ] Started Network Manager.',
  '[  OK  ] Starting firewalld - dynamic firewall daemon...',
  '[  OK  ] Started firewalld - dynamic firewall daemon.',
  '[  OK  ] Starting OpenSSH server daemon...',
  '[  OK  ] Started OpenSSH server daemon.',
  '[  OK  ] Started crond.service - Command Scheduler.',
  '[  OK  ] Mounted /boot/efi.',
  '[  OK  ] Started Login Service.',
  '[  OK  ] Reached target Multi-User System.',
  '[  OK  ] Started GNOME Keyring daemon.',
  '[  OK  ] Started D-Bus System Message Bus.',
  '[  OK  ] Started Authorization Manager.',
  '[  OK  ] Started Hostname Service.',
  '[  OK  ] Started Rocky Linux 9 boot sequence.',
];

function userExists(username: string): boolean {
  if (!username) return false;
  const fs = new FileSystem('guest');
  const passwd = fs.readFile('/etc/passwd', 'root') ?? '';
  return passwd
    .split('\n')
    .map((line) => line.split(':')[0])
    .includes(username);
}

function buildLoginPrelude(): string[] {
  const fs = new FileSystem('guest');
  const motd = fs.readFile('/etc/motd', 'root') ?? 'Welcome to Rocky Linux 9.3 (Blue Onyx).';
  const now = new Date();
  const lastLogin = now.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(',', '');
  return [
    `Last login: ${lastLogin} on tty1`,
    ...motd.split('\n').filter(Boolean).map((line) => line.trim()),
    '',
  ];
}

function App() {
  const [appState, setAppState] = useState<AppState>('shell');
  const [terminalSessionKey, setTerminalSessionKey] = useState(0);
  const [sessionUser, setSessionUser] = useState('guest');
  const [shellPreludeLines, setShellPreludeLines] = useState<string[]>([]);
  const [initialTutorialMode] = useState<TutorialCartridge | null>(() => loadTutorialFromSearch(window.location.search));

  const [grubSelection, setGrubSelection] = useState(0);
  const [biosSelection, setBiosSelection] = useState(0);
  const [biosStatus, setBiosStatus] = useState<string>('');
  const [hardwareState, setHardwareState] = useState<HardwareState>(() => loadHardwareState());
  const [bootOutput, setBootOutput] = useState<string[]>([]);

  const [loginStage, setLoginStage] = useState<'username' | 'password'>('username');
  const [loginBuffer, setLoginBuffer] = useState('');
  const [passwordBuffer, setPasswordBuffer] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [loginMessages, setLoginMessages] = useState<string[]>([]);

  const screenRef = useRef<HTMLDivElement>(null);
  const bootCancelledRef = useRef(false);

  const startShell = useCallback((username: string) => {
    setSessionUser(username);
    setShellPreludeLines(buildLoginPrelude());
    setTerminalSessionKey((k) => k + 1);
    setAppState('shell');
  }, []);

  const resetLoginScreen = useCallback(() => {
    setLoginStage('username');
    setLoginBuffer('');
    setPasswordBuffer('');
    setPendingUsername('');
    setLoginMessages([]);
  }, []);

  const onRebootRequested = useCallback(() => {
    setGrubSelection(0);
    setBiosSelection(0);
    setBiosStatus('');
    setBootOutput([]);
    resetLoginScreen();
    setAppState('grub');
  }, [resetLoginScreen]);

  const onFactoryResetRequested = useCallback(() => {
    clearPocketTermStorage();
    window.location.reload();
  }, []);

  useEffect(() => {
    if (appState !== 'booting') return;
    let cancelled = false;
    bootCancelledRef.current = false;

    const runBoot = async () => {
      for (const line of BOOT_LINES) {
        if (cancelled || bootCancelledRef.current) return;
        setBootOutput((prev) => [...prev, line]);
        const delay = 50 + Math.floor(Math.random() * 100);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      if (cancelled || bootCancelledRef.current) return;
      resetLoginScreen();
      setAppState('login');
    };

    void runBoot();
    return () => {
      cancelled = true;
    };
  }, [appState, resetLoginScreen]);

  useEffect(() => {
    if (appState !== 'grub' && appState !== 'bios' && appState !== 'login' && appState !== 'booting') return;
    screenRef.current?.focus();
  }, [appState]);

  useEffect(() => {
    persistHardwareState(hardwareState);
  }, [hardwareState]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (appState === 'booting') {
      if (e.key === 'Escape') {
        e.preventDefault();
        bootCancelledRef.current = true;
        setGrubSelection(0);
        setBootOutput([]);
        setAppState('grub');
      }
      return;
    }

    if (appState === 'grub') {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setGrubSelection((s) => (s - 1 + 3) % 3);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setGrubSelection((s) => (s + 1) % 3);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (grubSelection === 1) {
          clearPocketTermStorage();
          window.location.reload();
          return;
        }
        if (grubSelection === 2) {
          setBiosSelection(0);
          setBiosStatus('');
          setAppState('bios');
          return;
        }
        setBootOutput([]);
        setAppState('booting');
      }
      return;
    }

    if (appState === 'bios') {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAppState('grub');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBiosSelection((s) => (s - 1 + 4) % 4);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setBiosSelection((s) => (s + 1) % 4);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (biosSelection === 0) {
          setBiosStatus('Motherboard: PocketTerm Virtual Board v1.0 | CPU: 4 Cores | RAM: 8 GiB');
          return;
        }
        if (biosSelection === 1) {
          const sdb = hardwareState.devices.sdb;
          if (sdb && sdb.attached) {
            setBiosStatus('SATA /dev/sdb is already attached.');
            return;
          }
          setHardwareState((prev) => ({
            ...prev,
            devices: {
              ...prev.devices,
              sdb: {
                name: 'sdb',
                type: 'disk',
                size: '10G',
                attached: true,
                raw: true,
                model: 'PocketTerm Virtual Disk',
                bus: 'SATA',
                serial: 'PT-SDB-0010',
                partitions: [],
              },
            },
          }));
          setBiosStatus('Attached 10GB RAW Drive as /dev/sdb.');
          return;
        }
        if (biosSelection === 2) {
          const sdb = hardwareState.devices.sdb;
          if (!sdb || !sdb.attached) {
            setBiosStatus('No attached /dev/sdb drive found.');
            return;
          }
          setHardwareState((prev) => ({
            ...prev,
            devices: {
              ...prev.devices,
              sdb: {
                ...prev.devices.sdb,
                attached: false,
              },
            },
          }));
          setBiosStatus('Detached /dev/sdb successfully.');
          return;
        }
        setBiosStatus('Changes saved.');
        setAppState('grub');
      }
      return;
    }

    if (appState !== 'login') return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (loginStage === 'username') {
        setLoginBuffer((b) => b.slice(0, -1));
      } else {
        setPasswordBuffer((b) => b.slice(0, -1));
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (loginStage === 'username') {
        const entered = loginBuffer.trim();
        setPendingUsername(entered);
        setLoginBuffer('');
        if (!entered) return;
        setLoginStage('password');
        return;
      }

      const username = pendingUsername.trim();
      const ok = userExists(username);
      const strictAuth = localStorage.getItem('pocketterm-auth-mode') === 'strict';
      const passwordOk = strictAuth ? passwordBuffer.length > 0 : true;
      setPasswordBuffer('');
      if (!ok) {
        setLoginMessages((prev) => [...prev, 'Login incorrect', '']);
        setPendingUsername('');
        setLoginStage('username');
        return;
      }
      if (!passwordOk) {
        setLoginMessages((prev) => [...prev, 'Login incorrect', '']);
        setPendingUsername('');
        setLoginStage('username');
        return;
      }
      startShell(username);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (loginStage === 'username') {
        setLoginBuffer((b) => b + e.key);
      } else {
        setPasswordBuffer((b) => b + e.key);
      }
    }
  }, [appState, biosSelection, grubSelection, hardwareState.devices.sdb, loginBuffer, loginStage, passwordBuffer, pendingUsername, startShell]);

  const loginPrompt = useMemo(() => {
    const lines = [...loginMessages];
    lines.push('Rocky Linux 9.3 (Blue Onyx)');
    lines.push('Kernel 5.14.0-362.8.1.el9_3.x86_64 on an aarch64');
    lines.push('');
    if (loginStage === 'username') {
      lines.push(`pocket-term login: ${loginBuffer}`);
    } else {
      lines.push(`pocket-term login: ${pendingUsername}`);
      lines.push('Password: ');
    }
    return lines.join('\n');
  }, [loginBuffer, loginMessages, loginStage, pendingUsername]);

  if (appState === 'shell') {
    return (
      <div className="min-h-dvh w-full bg-[#1e1e1e]">
        <TerminalUI
          key={`term-${terminalSessionKey}`}
          initialUser={sessionUser}
          onRebootRequested={onRebootRequested}
          onFactoryResetRequested={onFactoryResetRequested}
          preludeLines={shellPreludeLines}
          initialTutorialMode={initialTutorialMode}
        />
      </div>
    );
  }

  if (appState === 'grub') {
    return (
      <div
        ref={screenRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="min-h-dvh w-full bg-black text-white font-mono outline-none flex items-center justify-center p-6"
      >
        <div className="w-full max-w-4xl border border-white p-6">
          <div className="mb-4">GNU GRUB version 2.06</div>
          <div className="mb-2">Use the ↑ and ↓ keys to select which entry is highlighted.</div>
          <div className="mb-4">Press enter to boot the selected OS.</div>
          <div className={`px-2 py-1 ${grubSelection === 0 ? 'bg-white text-black' : ''}`}>
            Rocky Linux (5.14.0-362.8.1.el9_3.x86_64) 9.3 (Blue Onyx)
          </div>
          <div className={`px-2 py-1 ${grubSelection === 1 ? 'bg-white text-black' : ''}`}>
            System Reset / Factory Reinstall (Wipe Data)
          </div>
          <div className={`px-2 py-1 ${grubSelection === 2 ? 'bg-white text-black' : ''}`}>
            BIOS / Virtual Hardware Settings
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'bios') {
    const biosOptions = [
      '[ Motherboard ] View Specs',
      '[ Storage ] Attach 10GB RAW Drive (SATA /dev/sdb)',
      '[ Storage ] Detach Drive (/dev/sdb)',
      '[ Exit ] Save and Return to Bootloader',
    ];
    const sdb = hardwareState.devices.sdb;
    const driveState = sdb && sdb.attached ? 'Attached (10G RAW)' : 'Detached';
    return (
      <div
        ref={screenRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="min-h-dvh w-full bg-[#1b1f7a] text-[#d9d9d9] font-mono outline-none flex items-center justify-center p-6"
      >
        <div className="w-full max-w-5xl border border-[#9ea4ff] bg-[#2a2f95] p-6">
          <div className="mb-4 text-white">PocketTerm Virtual BIOS / Hardware Settings</div>
          <div className="mb-2">Firmware: PT-BIOS v0.9.3</div>
          <div className="mb-4">Storage Bus Status: /dev/sda=Attached (80G), /dev/sdb={driveState}</div>
          {biosOptions.map((opt, idx) => (
            <div key={opt} className={`px-2 py-1 ${biosSelection === idx ? 'bg-[#d9d9d9] text-[#1b1f7a]' : ''}`}>
              {opt}
            </div>
          ))}
          <div className="mt-4 border-t border-[#9ea4ff] pt-3 min-h-6">
            {biosStatus || 'Use Arrow keys, Enter to select, ESC to return to bootloader.'}
          </div>
        </div>
      </div>
    );
  }

  if (appState === 'booting') {
    return (
      <div
        ref={screenRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="min-h-dvh w-full bg-black text-white font-mono p-4 overflow-hidden outline-none relative"
      >
        <pre className="text-sm leading-6 whitespace-pre-wrap">{bootOutput.join('\n')}</pre>
        <div className="absolute bottom-4 left-4 text-xs text-gray-300">
          Booting... {Math.round((bootOutput.length / BOOT_LINES.length) * 100)}% {' '}
          {['|', '/', '-', '\\'][bootOutput.length % 4]}
        </div>
        <div className="absolute bottom-4 right-4 text-xs text-gray-300">
          Press ESC to return to GRUB
        </div>
      </div>
    );
  }

  return (
    <div
      ref={screenRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="min-h-dvh w-full bg-black text-white font-mono p-4 outline-none"
    >
      <pre className="text-sm leading-6 whitespace-pre-wrap">{loginPrompt}</pre>
    </div>
  );
}

export default App;
