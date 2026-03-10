import { safePersist } from './storage';

export const HARDWARE_STATE_KEY = 'pocketterm-hardware-v1';

export interface VirtualPartition {
  name: string;
  size: string;
  type: 'part' | 'lvm';
  mountpoints?: string;
  children?: VirtualPartition[];
}

export interface VirtualBlockDevice {
  name: string;
  type: 'disk';
  size: string;
  attached: boolean;
  raw?: boolean;
  model?: string;
  bus?: string;
  serial?: string;
  partitions?: VirtualPartition[];
}

export interface HardwareState {
  version: 1;
  devices: Record<string, VirtualBlockDevice>;
}

function defaultSda(): VirtualBlockDevice {
  return {
    name: 'sda',
    type: 'disk',
    size: '80G',
    attached: true,
    raw: false,
    model: 'QEMU HARDDISK',
    bus: 'SATA',
    serial: 'PT-SDA-0001',
    partitions: [
      { name: 'sda1', size: '600M', type: 'part', mountpoints: '/boot/efi' },
      { name: 'sda2', size: '1G', type: 'part', mountpoints: '/boot' },
      {
        name: 'sda3',
        size: '78.4G',
        type: 'part',
        children: [{ name: 'rl-root', size: '70G', type: 'lvm', mountpoints: '/' }],
      },
    ],
  };
}

export function getDefaultHardwareState(): HardwareState {
  return {
    version: 1,
    devices: {
      sda: defaultSda(),
    },
  };
}

export function normalizeHardwareState(input: unknown): HardwareState {
  const fallback = getDefaultHardwareState();
  if (!input || typeof input !== 'object') return fallback;
  const maybe = input as Partial<HardwareState>;
  const devices = maybe.devices && typeof maybe.devices === 'object' ? { ...maybe.devices } : {};
  if (!devices.sda || typeof devices.sda !== 'object') {
    devices.sda = defaultSda();
  } else {
    devices.sda = { ...defaultSda(), ...(devices.sda as VirtualBlockDevice), attached: true, raw: false };
  }
  return {
    version: 1,
    devices: devices as Record<string, VirtualBlockDevice>,
  };
}

export function loadHardwareState(): HardwareState {
  try {
    const raw = localStorage.getItem(HARDWARE_STATE_KEY);
    if (!raw) return getDefaultHardwareState();
    return normalizeHardwareState(JSON.parse(raw));
  } catch {
    return getDefaultHardwareState();
  }
}

export function persistHardwareState(state: HardwareState): boolean {
  const { ok } = safePersist(HARDWARE_STATE_KEY, JSON.stringify(normalizeHardwareState(state)));
  return ok;
}
