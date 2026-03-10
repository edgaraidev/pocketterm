export type NodeType = 'file' | 'directory';

export interface VFSNode {
  name: string;
  type: NodeType;
  content: string;
  owner: string;
  group: string;
  permissions: string; // e.g. "755", "644"
  children?: Map<string, VFSNode>;
}

export interface SerializedVFSNode {
  name: string;
  type: NodeType;
  content: string;
  owner: string;
  group?: string; // optional for backward compat with existing localStorage data
  permissions: string;
  children?: Record<string, SerializedVFSNode>;
}
