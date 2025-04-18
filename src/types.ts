export interface FileTransfer {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error' | 'rejected' | 'cancelled';
  blob?: Blob;
  key?: string; // For legacy encryption
  iv?: number[];
  sessionId?: string; // For secure encryption with key exchange
  estimatedTimeRemaining?: number; // in milliseconds
  secure?: boolean; // Whether this transfer uses secure key exchange
}

export interface PeerConnection {
  id: string;
  connected: boolean;
}

export interface FilePreview {
  name: string;
  size: number;
  type: string;
  file: File;
}

// Legacy encryption interface
export interface FileEncryption {
  data: Blob;
  key: string;
  iv: number[];
}

// New secure encryption interface using key exchange
export interface SecureFileEncryption {
  data: Blob;
  iv: number[];
  sessionId: string; // References the session key established during key exchange
}

export interface FileTransferMessage {
  type: 'file-request' | 'file-start' | 'file-chunk' | 'file-complete' | 'file-accepted' | 'file-rejected' | 'file-cancel' | 'file-cancel-ack';
  fileId: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  chunk?: number;
  total?: number;
  data?: ArrayBuffer;
  key?: string; // For legacy encryption
  iv?: number[];
  sessionId?: string; // For secure encryption with key exchange
  secure?: boolean; // Whether this transfer uses secure key exchange
}

// Key exchange message types
export interface KeyExchangeMessage {
  type: 'key-exchange-init' | 'key-exchange-reply' | 'key-exchange-complete';
  publicKey: string; // Base64 encoded public key
  sessionId: string; // Unique ID for this key exchange session
}