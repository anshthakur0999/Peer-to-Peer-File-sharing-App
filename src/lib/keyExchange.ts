/**
 * Key exchange module using Diffie-Hellman with ECDH (Elliptic Curve Diffie-Hellman)
 * This provides Perfect Forward Secrecy for file transfers
 */

// Generate a key pair for ECDH key exchange
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256' // Using P-256 curve for good security and performance
    },
    true, // extractable
    ['deriveKey', 'deriveBits'] // key usages
  );
}

// Export the public key to share with the peer
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  // Convert to base64 for transmission
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

// Import a peer's public key
export async function importPublicKey(publicKeyStr: string): Promise<CryptoKey> {
  const keyData = Uint8Array.from(atob(publicKeyStr), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    'spki',
    keyData,
    {
      name: 'ECDH',
      namedCurve: 'P-256'
    },
    true,
    [] // No key usages for public key
  );
}

// Derive a shared secret using our private key and the peer's public key
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: peerPublicKey
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256
    },
    false, // not extractable - for security
    ['encrypt', 'decrypt']
  );
}

// Generate a session ID to identify this key exchange session
export function generateSessionId(): string {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Store for session keys
interface SessionKeyStore {
  [sessionId: string]: CryptoKey;
}

// Global store for session keys
const sessionKeys: SessionKeyStore = {};

// Store a derived key with its session ID
export function storeSessionKey(sessionId: string, key: CryptoKey): void {
  sessionKeys[sessionId] = key;
}

// Get a stored session key
export function getSessionKey(sessionId: string): CryptoKey | undefined {
  return sessionKeys[sessionId];
}

// Remove a session key when it's no longer needed
export function removeSessionKey(sessionId: string): void {
  if (sessionKeys[sessionId]) {
    delete sessionKeys[sessionId];
  }
}
