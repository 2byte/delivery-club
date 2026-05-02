export type HooksTypes = "onDownloadName" | "moves";

export type HookOnDownloadName = {
  name: string;
  extractTo: string;
};

export type HookMoves = {
  byNames?: { [key: string]: string };
}

export type ClientFileHooks = {
  onDownloadName?: HookOnDownloadName | { [key: string]: HookOnDownloadName };
  moves?: HookMoves;
};

/**
 * Remote hooks type
 * Keyed by hostname
 */
export type ClientRemoteHooks = {
  [key: string]: ClientFileHooks;
};

/**
 * Client configuration interface
 */
export interface ClientConfig {
  serverUrl: string;
  hostname: string;
  authKey: string;
  localStorageDir: string;
  logFile: string;
  writeLogToFileEnabled?: boolean;
  silentMode: boolean;
  ignores?: {
    push?: string[];
    pull?: string[];
  };
  sharedHooks?: ClientFileHooks;
  localHooks?: ClientFileHooks;
  remoteHooks?: ClientRemoteHooks;
}

/**
 * Result returned from push operation
 */
export interface PushResult {
  success: boolean;
  /** Token for permanent download link (present when --create-link was used) */
  linkToken?: string;
  /** Full URL of the permanent download link */
  linkUrl?: string;
}

/**
 * Sync state to track downloaded files
 */
export interface SyncState {
  downloadedFiles: string[];
  lastSync: string;
}

/**
 * File info from server
 */
export interface FileInfo {
  storedName: string;
  originalName: string;
  size: number;
  timestamp: string;
  isDirectory?: boolean;
  hooks?: ClientFileHooks;
}

/**
 * Pull response from server
 */
export interface PullResponse {
  totalFiles: number;
  newFiles: FileInfo[];
  count: number;
}

/**
 * List response from server
 */
export interface ListResponse {
  hostId: string;
  direction: string;
  files: string[];
  count: number;
}

/**
 * Status response from server
 */
export interface StatusResponse {
  status: string;
}