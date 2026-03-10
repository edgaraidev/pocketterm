/**
 * NetworkLogic: Validates if source IP can reach target IP based on subnet.
 * Used for simulated network operations (e.g. ping, curl).
 */
export class NetworkLogic {
  private sourceIP: string;
  private sourceSubnet: string;

  constructor(sourceIP: string = '192.168.1.100', sourceSubnet: string = '192.168.1.0/24') {
    this.sourceIP = sourceIP;
    this.sourceSubnet = sourceSubnet;
  }

  private parseIP(ip: string): number[] | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return null;
    if (parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;
    return parts;
  }

  private parseSubnet(subnet: string): { network: number[]; mask: number } | null {
    const [networkStr, maskStr] = subnet.split('/');
    const network = this.parseIP(networkStr);
    if (!network) return null;
    const mask = parseInt(maskStr, 10);
    if (isNaN(mask) || mask < 0 || mask > 32) return null;
    return { network, mask };
  }

  private ipToNumber(parts: number[]): number {
    return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
  }

  private isInSubnet(ipParts: number[], subnet: { network: number[]; mask: number }): boolean {
    const ipNum = this.ipToNumber(ipParts);
    const netNum = this.ipToNumber(subnet.network);
    const mask = subnet.mask === 0 ? 0 : ~((1 << (32 - subnet.mask)) - 1) >>> 0;
    return (ipNum & mask) === (netNum & mask);
  }

  private knownHosts: Set<string> = new Set(['10.0.0.50', '8.8.8.8', '8.8.4.4']);

  canReach(targetIP: string): boolean {
    const targetParts = this.parseIP(targetIP);
    if (!targetParts) return false;

    const subnet = this.parseSubnet(this.sourceSubnet);
    if (!subnet) return false;

    const sourceParts = this.parseIP(this.sourceIP);
    if (!sourceParts) return false;

    if (this.isInSubnet(targetParts, subnet)) return true;
    if (targetIP === '127.0.0.1' || targetIP === 'localhost') return true;
    if (targetIP === this.sourceIP) return true;
    if (this.knownHosts.has(targetIP)) return true;

    return false;
  }

  setSource(ip: string, subnet: string): void {
    this.sourceIP = ip;
    this.sourceSubnet = subnet;
  }
}
