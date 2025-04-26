import { FileEncryption, SecureFileEncryption } from '../types';
import { getSessionKey, listSessionKeys } from './keyExchange';

// Legacy functions kept for backward compatibility
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

// Legacy encryption function (kept for backward compatibility)
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

// New secure encryption function using pre-exchanged keys
export async function secureEncryptFile(file: File, sessionId: string): Promise<SecureFileEncryption> {
  // Get the session key that was established during key exchange
  const key = getSessionKey(sessionId);
  if (!key) {
    throw new Error('No session key found for this session ID');
  }

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

  return {
    data: new Blob([encryptedData]),
    iv: Array.from(iv),
    sessionId
  };
}

// Legacy decryption function (kept for backward compatibility)
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

// New secure decryption function using pre-exchanged keys
export async function secureDecryptFile(
  encryptedBlob: Blob,
  sessionId: string,
  iv: number[],
  type: string
): Promise<Blob> {
  console.log(`Attempting secure decryption with sessionId: ${sessionId}`);

  // Get the session key that was established during key exchange
  const key = getSessionKey(sessionId);
  if (!key) {
    console.error(`No session key found for sessionId: ${sessionId}`);
    // List all available session keys
    const availableKeys = listSessionKeys();
    console.log('Available session keys:', availableKeys);
    throw new Error('Missing encryption information: No session key found for this session ID');
  }

  console.log(`Found session key for sessionId: ${sessionId}`);
  const arrayBuffer = await encryptedBlob.arrayBuffer();
  console.log(`Decrypting blob of size: ${arrayBuffer.byteLength} bytes with IV length: ${iv.length}`);

  try {
    const decryptedData = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv)
      },
      key,
      arrayBuffer
    );

    console.log(`Successfully decrypted data, size: ${decryptedData.byteLength} bytes`);
    return new Blob([decryptedData], { type });
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt file. The encryption key may be incorrect or the file may be corrupted.');
  }
}