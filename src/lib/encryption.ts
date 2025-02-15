import { FileEncryption } from '../types';

export async function generateEncryptionKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

export async function importKey(keyStr: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    'raw',
    keyData,
    'AES-GCM',
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(file: File): Promise<FileEncryption> {
  const key = await generateEncryptionKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await file.arrayBuffer();

  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    arrayBuffer
  );

  const exportedKey = await exportKey(key);
  
  return {
    data: new Blob([encryptedData]),
    iv: Array.from(iv),
    key: exportedKey
  };
}

export async function decryptFile(
  encryptedBlob: Blob,
  keyStr: string,
  iv: number[],
  type: string
): Promise<Blob> {
  const key = await importKey(keyStr);
  const arrayBuffer = await encryptedBlob.arrayBuffer();

  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(iv)
    },
    key,
    arrayBuffer
  );

  return new Blob([decryptedData], { type });
}