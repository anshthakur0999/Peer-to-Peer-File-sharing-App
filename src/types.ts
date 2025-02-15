export interface FileTransfer {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error' | 'rejected';
  blob?: Blob;
  key?: string;
  iv?: number[];
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

export interface FileEncryption {
  data: Blob;
  key: string;
  iv: number[];
}

export interface FileTransferMessage {
  type: 'file-request' | 'file-start' | 'file-chunk' | 'file-complete' | 'file-accepted' | 'file-rejected';
  fileId: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  chunk?: number;
  total?: number;
  data?: ArrayBuffer;
  key?: string;
  iv?: number[];
}