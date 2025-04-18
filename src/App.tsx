import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { Share2, Upload, Download, Copy, CheckCircle, X, FileText, Image, Film, Music, Archive, File, QrCode, Camera, Lock } from 'lucide-react';
import { FileTransfer, PeerConnection, FilePreview } from './types';
import { FileTransferItem } from './components/FileTransferItem';
import { ThemeToggle } from './components/ui/theme-toggle';
import { QRCodeModal } from './components/QRCodeModal';
import { QRScanner } from './components/QRScanner';
import { encryptFile, secureEncryptFile } from './lib/encryption';
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  generateSessionId,
  storeSessionKey
} from './lib/keyExchange';

// Optimized chunk size and concurrency for maximum performance
const CHUNK_SIZE = 2097152; // 2MB chunks (increased from 1MB)
const MAX_CHUNKS_IN_FLIGHT = 30; // Increased number of chunks to send simultaneously

function App() {
  const [peerId, setPeerId] = useState<string>('');
  const [targetPeerId, setTargetPeerId] = useState<string>('');
  const [connection, setConnection] = useState<PeerConnection | null>(null);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<FilePreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<{
    fileId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    secure?: boolean;
  }[]>([]);
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor'>('good');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [transferSpeed, setTransferSpeed] = useState<number>(0); // in bytes per second
  const [transferTimes, setTransferTimes] = useState<{ [key: string]: { start: number, end?: number } }>({});
  const [secureMode, setSecureMode] = useState<boolean>(true); // Default to secure mode
  const transferSpeedRef = useRef<{ [key: string]: number }>({});
  const peerRef = useRef<Peer>();
  const connRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileChunksRef = useRef<{ [key: string]: ArrayBuffer[] }>({});
  const chunksInFlightRef = useRef<{ [key: string]: number }>({}); // Track chunks being sent
  const lastChunkTimeRef = useRef<number>(0);
  const downloadBytesRef = useRef<number>(0);
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const pendingKeyExchangeRef = useRef<{ [sessionId: string]: { resolve: (value: boolean) => void } }>({});
  const cancelledTransfersRef = useRef<Set<string>>(new Set()); // Track cancelled transfers

  // Log when processingFiles changes
  useEffect(() => {
    console.log('processingFiles changed:', [...processingFiles]);
  }, [processingFiles]);

  // Clean up references when component unmounts
  useEffect(() => {
    return () => {
      // Clean up any active transfers
      Object.keys(chunksInFlightRef.current).forEach(fileId => {
        if (connRef.current) {
          connRef.current.send({
            type: 'file-cancel',
            fileId
          });
        }
      });

      // Clear references
      chunksInFlightRef.current = {};
      fileChunksRef.current = {};
      cancelledTransfersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          // Add public TURN servers for better connectivity
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        // Optimize WebRTC configuration for better performance
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan'
      }
    });

    peer.on('open', (id) => {
      setPeerId(id);
      peerRef.current = peer;
    });

    peer.on('connection', (conn) => {
      // serialization is read-only, must be set during connection creation
      // conn.serialization = 'binary';
      connRef.current = conn;
      setupConnection(conn);
    });

    return () => {
      peer.destroy();
    };
  }, []);

  // Generate a key pair for ECDH key exchange
  const generateAndStoreKeyPair = async () => {
    try {
      const keyPair = await generateKeyPair();
      keyPairRef.current = keyPair;
      return keyPair;
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw error;
    }
  };

  // Initiate key exchange with peer
  const initiateKeyExchange = async (sessionId: string) => {
    if (!connRef.current || !connRef.current.open) {
      throw new Error('No active connection');
    }

    try {
      console.log('Initiating key exchange with sessionId:', sessionId);
      // Generate a key pair if we don't have one
      if (!keyPairRef.current) {
        console.log('Generating new key pair');
        await generateAndStoreKeyPair();
      }

      // Export our public key
      const publicKeyStr = await exportPublicKey(keyPairRef.current!.publicKey);
      console.log('Exported public key for sessionId:', sessionId);

      // Send our public key to the peer
      connRef.current.send({
        type: 'key-exchange-init',
        publicKey: publicKeyStr,
        sessionId
      });
      console.log('Sent key-exchange-init for sessionId:', sessionId);

      // Return a promise that will be resolved when key exchange is complete
      return new Promise<boolean>((resolve) => {
        console.log('Creating pending key exchange for sessionId:', sessionId);
        pendingKeyExchangeRef.current[sessionId] = { resolve };
      });
    } catch (error) {
      console.error('Error initiating key exchange:', error);
      throw error;
    }
  };

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      setConnection({ id: conn.peer, connected: true });

      // Generate a key pair when connection is established
      generateAndStoreKeyPair();
    });

    conn.on('data', handleIncomingData);

    conn.on('close', () => {
      setConnection(null);
      connRef.current = null;
      // Clear key pair when connection is closed
      keyPairRef.current = null;
    });

    conn.on('error', (err: any) => {
      console.error('Connection error:', err);
      setConnection(null);
      connRef.current = null;
      // Clear key pair on error
      keyPairRef.current = null;
    });
  };

  const handleIncomingData = async (data: any) => {
    // Handle key exchange messages
    if (data.type === 'key-exchange-init') {
      try {
        console.log('Received key-exchange-init with sessionId:', data.sessionId);
        // Generate a key pair if we don't have one
        if (!keyPairRef.current) {
          await generateAndStoreKeyPair();
        }

        // Import the peer's public key
        const peerPublicKey = await importPublicKey(data.publicKey);

        // Derive the shared secret
        const sharedKey = await deriveSharedSecret(keyPairRef.current!.privateKey, peerPublicKey);

        // Store the shared key with the session ID
        storeSessionKey(data.sessionId, sharedKey);

        // Export our public key
        const publicKeyStr = await exportPublicKey(keyPairRef.current!.publicKey);

        // Send our public key to the peer
        connRef.current.send({
          type: 'key-exchange-reply',
          publicKey: publicKeyStr,
          sessionId: data.sessionId
        });
        console.log('Sent key-exchange-reply for sessionId:', data.sessionId);
      } catch (error) {
        console.error('Error handling key exchange init:', error);
      }
    } else if (data.type === 'key-exchange-reply') {
      try {
        console.log('Received key-exchange-reply for sessionId:', data.sessionId);
        // Import the peer's public key
        const peerPublicKey = await importPublicKey(data.publicKey);

        // Derive the shared secret
        const sharedKey = await deriveSharedSecret(keyPairRef.current!.privateKey, peerPublicKey);

        // Store the shared key with the session ID
        storeSessionKey(data.sessionId, sharedKey);

        // Send confirmation that key exchange is complete
        connRef.current.send({
          type: 'key-exchange-complete',
          sessionId: data.sessionId
        });
        console.log('Sent key-exchange-complete for sessionId:', data.sessionId);

        // Resolve the promise for this key exchange
        if (pendingKeyExchangeRef.current[data.sessionId]) {
          console.log('Resolving pending key exchange for sessionId:', data.sessionId);
          pendingKeyExchangeRef.current[data.sessionId].resolve(true);
          delete pendingKeyExchangeRef.current[data.sessionId];
        } else {
          console.warn('No pending key exchange found for sessionId:', data.sessionId);
        }
      } catch (error) {
        console.error('Error handling key exchange reply:', error);
        // Resolve with failure
        if (pendingKeyExchangeRef.current[data.sessionId]) {
          pendingKeyExchangeRef.current[data.sessionId].resolve(false);
          delete pendingKeyExchangeRef.current[data.sessionId];
        }
      }
    } else if (data.type === 'key-exchange-complete') {
      // Key exchange is complete, nothing more to do
      console.log('Received key-exchange-complete for sessionId:', data.sessionId);
    }
    // Handle file transfer messages
    else if (data.type === 'file-request') {
      setPendingTransfers(prev => [...prev, {
        fileId: data.fileId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        secure: data.secure
      }]);
    } else if (data.type === 'file-start') {
      fileChunksRef.current[data.fileId] = new Array(Math.ceil(data.fileSize / CHUNK_SIZE));

      // Record start time for the receiving file
      setTransferTimes(prev => ({
        ...prev,
        [data.fileId]: { start: Date.now() }
      }));

      // Initialize transfer speed for this file
      transferSpeedRef.current[data.fileId] = 0;

      setTransfers(prev => [...prev, {
        id: data.fileId,
        name: data.fileName,
        size: data.fileSize,
        type: data.fileType,
        progress: 0,
        status: 'pending',
        key: data.key,
        iv: data.iv
      }]);
    } else if (data.type === 'file-chunk') {
      // Check if this transfer has been cancelled
      if (cancelledTransfersRef.current.has(data.fileId)) {
        console.log(`Ignoring chunk for cancelled transfer ${data.fileId}`);
        return;
      }

      if (!fileChunksRef.current[data.fileId]) {
        fileChunksRef.current[data.fileId] = [];
      }
      fileChunksRef.current[data.fileId][data.chunk] = data.data;

      // Calculate download speed
      const now = performance.now();
      downloadBytesRef.current += data.data.byteLength;

      // Update speed calculation
      const updateSpeed = () => {
        const elapsedSeconds = (now - lastChunkTimeRef.current) / 1000;
        if (elapsedSeconds > 0) {
          const speed = downloadBytesRef.current / elapsedSeconds;
          setTransferSpeed(speed);

          // Store the speed for this specific file
          transferSpeedRef.current[data.fileId] = speed;
        }

        downloadBytesRef.current = 0;
        lastChunkTimeRef.current = now;
      };

      // If this is one of the first few chunks, update speed more frequently
      // to get an initial estimate quickly
      if (data.chunk < 5 || now - lastChunkTimeRef.current > 1000) {
        updateSpeed();
      }

      // Calculate progress and estimated time remaining
      const progress = Math.round((data.chunk + 1) * 100 / data.total);
      const transfer = transfers.find(t => t.id === data.fileId);

      if (transfer) {
        const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
          data.fileId,
          progress,
          transfer.size
        );

        setTransfers(prev => prev.map(t =>
          t.id === data.fileId
            ? {
                ...t,
                progress,
                status: 'transferring',
                estimatedTimeRemaining
              }
            : t
        ));
      } else {
        setTransfers(prev => prev.map(t =>
          t.id === data.fileId
            ? { ...t, progress, status: 'transferring' }
            : t
        ));
      }

      // Send acknowledgment for received chunk (unless cancelled)
      if (!cancelledTransfersRef.current.has(data.fileId)) {
        connRef.current?.send({
          type: 'chunk-ack',
          fileId: data.fileId,
          chunk: data.chunk
        });
      }

      if (data.chunk === data.total - 1) {
        const chunks = fileChunksRef.current[data.fileId].filter(chunk => chunk !== undefined);
        const blob = new Blob(chunks, {
          type: transfers.find(t => t.id === data.fileId)?.type || 'application/octet-stream'
        });

        // Record end time for completed transfer
        setTransferTimes(prev => ({
          ...prev,
          [data.fileId]: { ...prev[data.fileId], end: Date.now() }
        }));

        setTransfers(prev => prev.map(t =>
          t.id === data.fileId
            ? { ...t, blob, progress: 100, status: 'completed' }
            : t
        ));

        delete fileChunksRef.current[data.fileId];
      }
    } else if (data.type === 'chunk-ack') {
      // Decrease the in-flight counter when chunk is acknowledged
      if (chunksInFlightRef.current[data.fileId]) {
        chunksInFlightRef.current[data.fileId]--;
      }
    } else if (data.type === 'file-cancel') {
      // Handle file cancellation request from peer
      console.log(`Received cancellation request for file ${data.fileId}`);

      // Mark the transfer as cancelled in our reference
      cancelledTransfersRef.current.add(data.fileId);

      // Update the transfer status to cancelled
      setTransfers(prev => prev.map(t =>
        t.id === data.fileId
          ? { ...t, status: 'cancelled' }
          : t
      ));

      // Record end time for cancelled transfer
      setTransferTimes(prev => ({
        ...prev,
        [data.fileId]: { ...prev[data.fileId], end: Date.now() }
      }));

      // Clean up resources
      delete fileChunksRef.current[data.fileId];
      delete chunksInFlightRef.current[data.fileId];

      // Send acknowledgment
      connRef.current?.send({
        type: 'file-cancel-ack',
        fileId: data.fileId
      });
    } else if (data.type === 'file-cancel-ack') {
      // Handle cancellation acknowledgment
      console.log(`Received cancellation acknowledgment for file ${data.fileId}`);
      // No additional action needed as we've already updated our state
    }
  };

  const connectToPeer = () => {
    if (!peerRef.current || !targetPeerId) return;

    const conn = peerRef.current.connect(targetPeerId, {
      reliable: true,
      serialization: 'binary',
      // Optimize data channel for high throughput
      metadata: {
        optimizedForHighThroughput: true
      }
    });
    connRef.current = conn;
    setupConnection(conn);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !connRef.current || !connRef.current.open) return;

    const previews = Array.from(files).map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      file
    }));

    setPreviewFiles(prev => [...prev, ...previews]);
    setShowPreview(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleScanResult = (result: string) => {
    setTargetPeerId(result);
    setShowScanner(false);
    connectToPeer();
  };

  const sendFile = async (file: File, fileId: string) => {
    if (!connRef.current || !connRef.current.open) {
      throw new Error('No active connection');
    }

    let encryptedData: Blob | undefined;
    let key: string | undefined;
    let iv: number[] | undefined;
    let sessionId: string | undefined;
    let secure = secureMode;

    try {
      console.log(`Starting to send file ${file.name} (${fileId}), secure mode: ${secure}`);

      if (secure) {
        try {
          // Perform key exchange first
          let exchangeSessionId = generateSessionId();
          console.log(`Generated session ID for key exchange: ${exchangeSessionId}`);

          console.log(`Initiating key exchange for file ${file.name}`);
          const keyExchangeSuccess = await initiateKeyExchange(exchangeSessionId);
          console.log(`Key exchange ${keyExchangeSuccess ? 'succeeded' : 'failed'} for file ${file.name}`);

          if (!keyExchangeSuccess) {
            console.warn('Key exchange failed, falling back to legacy encryption');
            secure = false;
          } else {
            // Use secure encryption with the exchanged key
            console.log(`Using secure encryption with session ID: ${exchangeSessionId}`);
            const secureEncryption = await secureEncryptFile(file, exchangeSessionId);
            encryptedData = secureEncryption.data;
            iv = secureEncryption.iv;
            sessionId = exchangeSessionId;
            console.log(`File ${file.name} encrypted securely, size: ${encryptedData.size} bytes`);
          }
        } catch (error) {
          console.error('Error during key exchange or secure encryption:', error);
          console.warn('Falling back to legacy encryption due to error');
          secure = false;
        }
      }

      // Fall back to legacy encryption if secure mode is disabled or key exchange failed
      if (!secure) {
        console.log(`Using legacy encryption for file ${file.name}`);
        const legacyEncryption = await encryptFile(file);
        encryptedData = legacyEncryption.data;
        key = legacyEncryption.key;
        iv = legacyEncryption.iv;
        console.log(`File ${file.name} encrypted with legacy method, size: ${encryptedData.size} bytes`);
      }

      // Send file request with appropriate encryption info
      console.log(`Sending file-request for ${file.name} (${fileId}), secure: ${secure}`);

      if (!encryptedData) {
        throw new Error('Failed to encrypt file');
      }

      connRef.current.send({
        type: 'file-request',
        fileId,
        fileName: file.name,
        fileSize: encryptedData.size,
        fileType: file.type,
        key, // Only included for legacy encryption
        iv,
        sessionId, // Only included for secure encryption
        secure
      });

      return new Promise<boolean>((resolve) => {
        console.log(`Waiting for response to file-request for ${file.name} (${fileId})`);

        const handleResponse = (data: any) => {
          console.log(`Received response for file ${fileId}:`, data.type);

          if (data.type === 'file-accepted' && data.fileId === fileId) {
            console.log(`File ${file.name} (${fileId}) was accepted, starting transfer`);

            if (!encryptedData) {
              console.error(`Missing encrypted data for file ${file.name}`);
              resolve(false);
              return;
            }

            if (secure && sessionId) {
              console.log(`Starting secure file transfer for ${file.name} with session ID ${sessionId}`);
              startSecureFileTransfer(encryptedData, fileId, file.name, file.type, sessionId, iv!);
            } else {
              console.log(`Starting legacy file transfer for ${file.name}`);
              startFileTransfer(encryptedData, fileId, file.name, file.type, key!, iv!);
            }

            connRef.current.off('data', handleResponse);
            resolve(true);
          } else if (data.type === 'file-rejected' && data.fileId === fileId) {
            console.log(`File ${file.name} (${fileId}) was rejected`);

            setTransfers(prev => [...prev, {
              id: fileId,
              name: file.name,
              size: file.size,
              type: file.type,
              progress: 0,
              status: 'rejected'
            }]);

            connRef.current.off('data', handleResponse);
            resolve(false);
          }
        };

        connRef.current.on('data', handleResponse);
      });
    } catch (error) {
      console.error(`Error sending file ${file.name}:`, error);
      throw error;
    }
  };

  // Legacy file transfer function
  const startFileTransfer = (
    encryptedBlob: Blob,
    fileId: string,
    fileName: string,
    fileType: string,
    key: string,
    iv: number[]
  ) => {
    // File cancellation feature has been removed
    const totalChunks = Math.ceil(encryptedBlob.size / CHUNK_SIZE);

    // Record start time
    setTransferTimes(prev => ({
      ...prev,
      [fileId]: { start: Date.now() }
    }));

    setTransfers(prev => [...prev, {
      id: fileId,
      name: fileName,
      size: encryptedBlob.size,
      type: fileType,
      progress: 0,
      status: 'pending',
      key,
      iv
    }]);

    connRef.current.send({
      type: 'file-start',
      fileId,
      fileName,
      fileSize: encryptedBlob.size,
      fileType,
      key,
      iv,
      secure: false
    });

    chunksInFlightRef.current[fileId] = 0;
    let currentChunk = 0;
    const startTime = performance.now();
    let lastUpdateTime = startTime;
    let bytesTransferred = 0;

    const sendChunk = async (chunkIndex: number) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, encryptedBlob.size);
      const slice = encryptedBlob.slice(start, end);
      const buffer = await slice.arrayBuffer();

      connRef.current?.send({
        type: 'file-chunk',
        fileId,
        chunk: chunkIndex,
        total: totalChunks,
        data: buffer
      });

      chunksInFlightRef.current[fileId]++;

      // Update bytes transferred and calculate speed
      bytesTransferred += buffer.byteLength;
      const now = performance.now();

      // Update speed calculation
      const updateSpeed = () => {
        const elapsedSeconds = (now - lastUpdateTime) / 1000;
        if (elapsedSeconds > 0) {
          const speed = bytesTransferred / elapsedSeconds;
          setTransferSpeed(speed);

          // Store the speed for this specific file
          transferSpeedRef.current[fileId] = speed;
        }

        bytesTransferred = 0;
        lastUpdateTime = now;
      };

      // If this is one of the first few chunks, update speed more frequently
      // to get an initial estimate quickly
      if (chunkIndex < 5 || now - lastUpdateTime > 1000) {
        updateSpeed();
      }
    };

    // Process chunks with cancellation support
    const processNextChunks = async () => {
      while (currentChunk < totalChunks &&
             chunksInFlightRef.current[fileId] < MAX_CHUNKS_IN_FLIGHT) {
        // Check if transfer has been cancelled
        if (cancelledTransfersRef.current.has(fileId)) {
          console.log(`Transfer ${fileId} was cancelled, stopping chunk processing`);
          break;
        }

        const transfer = transfers.find(t => t.id === fileId);
        if (transfer?.status === 'cancelled') {
          console.log(`Transfer ${fileId} was cancelled (status), stopping chunk processing`);
          break;
        }

        await sendChunk(currentChunk);
        currentChunk++;

        const transferSpeed = (currentChunk * CHUNK_SIZE) / (performance.now() - startTime);
        setConnectionQuality(checkConnectionQuality(transferSpeed));

        const progress = Math.round(currentChunk * 100 / totalChunks);
        const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
          fileId,
          progress,
          encryptedBlob.size
        );

        setTransfers(prev => prev.map(t =>
          t.id === fileId
            ? {
                ...t,
                progress,
                status: 'transferring',
                estimatedTimeRemaining
              }
            : t
        ));

        if (currentChunk === totalChunks) {
          connRef.current?.send({
            type: 'file-complete',
            fileId
          });

          // Record end time for completed transfer
          setTransferTimes(prev => ({
            ...prev,
            [fileId]: { ...prev[fileId], end: Date.now() }
          }));

          setTransfers(prev => prev.map(t =>
            t.id === fileId
              ? { ...t, progress: 100, status: 'completed' }
              : t
          ));

          delete chunksInFlightRef.current[fileId];
          break;
        }
      }

      if (currentChunk < totalChunks) {
        // Reduced timeout to minimize latency between chunk batches
        setTimeout(processNextChunks, 5);
      }
    };

    processNextChunks();
  };

  // Secure file transfer function using pre-exchanged keys
  const startSecureFileTransfer = (
    encryptedBlob: Blob,
    fileId: string,
    fileName: string,
    fileType: string,
    sessionId: string,
    iv: number[]
  ) => {
    // File cancellation feature has been removed
    const totalChunks = Math.ceil(encryptedBlob.size / CHUNK_SIZE);

    // Record start time
    setTransferTimes(prev => ({
      ...prev,
      [fileId]: { start: Date.now() }
    }));

    setTransfers(prev => [...prev, {
      id: fileId,
      name: fileName,
      size: encryptedBlob.size,
      type: fileType,
      progress: 0,
      status: 'pending',
      sessionId,
      iv,
      secure: true
    }]);

    connRef.current.send({
      type: 'file-start',
      fileId,
      fileName,
      fileSize: encryptedBlob.size,
      fileType,
      sessionId,
      iv,
      secure: true
    });

    chunksInFlightRef.current[fileId] = 0;
    let currentChunk = 0;
    const startTime = performance.now();
    let lastUpdateTime = startTime;
    let bytesTransferred = 0;

    const sendChunk = async (chunkIndex: number) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, encryptedBlob.size);
      const slice = encryptedBlob.slice(start, end);
      const buffer = await slice.arrayBuffer();

      connRef.current?.send({
        type: 'file-chunk',
        fileId,
        chunk: chunkIndex,
        total: totalChunks,
        data: buffer
      });

      chunksInFlightRef.current[fileId]++;

      // Update bytes transferred and calculate speed
      bytesTransferred += buffer.byteLength;
      const now = performance.now();

      // Update speed calculation
      const updateSpeed = () => {
        const elapsedSeconds = (now - lastUpdateTime) / 1000;
        if (elapsedSeconds > 0) {
          const speed = bytesTransferred / elapsedSeconds;
          setTransferSpeed(speed);

          // Store the speed for this specific file
          transferSpeedRef.current[fileId] = speed;
        }

        bytesTransferred = 0;
        lastUpdateTime = now;
      };

      // If this is one of the first few chunks, update speed more frequently
      // to get an initial estimate quickly
      if (chunkIndex < 5 || now - lastUpdateTime > 1000) {
        updateSpeed();
      }
    };

    // Process chunks with cancellation support
    const processNextChunks = async () => {
      while (currentChunk < totalChunks &&
             chunksInFlightRef.current[fileId] < MAX_CHUNKS_IN_FLIGHT) {
        // Check if transfer has been cancelled
        if (cancelledTransfersRef.current.has(fileId)) {
          console.log(`Transfer ${fileId} was cancelled, stopping chunk processing`);
          break;
        }

        const transfer = transfers.find(t => t.id === fileId);
        if (transfer?.status === 'cancelled') {
          console.log(`Transfer ${fileId} was cancelled (status), stopping chunk processing`);
          break;
        }

        await sendChunk(currentChunk);
        currentChunk++;

        const transferSpeed = (currentChunk * CHUNK_SIZE) / (performance.now() - startTime);
        setConnectionQuality(checkConnectionQuality(transferSpeed));

        const progress = Math.round(currentChunk * 100 / totalChunks);
        const estimatedTimeRemaining = calculateEstimatedTimeRemaining(
          fileId,
          progress,
          encryptedBlob.size
        );

        setTransfers(prev => prev.map(t =>
          t.id === fileId
            ? {
                ...t,
                progress,
                status: 'transferring',
                estimatedTimeRemaining
              }
            : t
        ));

        if (currentChunk === totalChunks) {
          connRef.current?.send({
            type: 'file-complete',
            fileId
          });

          // Record end time for completed transfer
          setTransferTimes(prev => ({
            ...prev,
            [fileId]: { ...prev[fileId], end: Date.now() }
          }));

          setTransfers(prev => prev.map(t =>
            t.id === fileId
              ? { ...t, progress: 100, status: 'completed' }
              : t
          ));

          delete chunksInFlightRef.current[fileId];
          break;
        }
      }

      if (currentChunk < totalChunks) {
        // Reduced timeout to minimize latency between chunk batches
        setTimeout(processNextChunks, 5);
      }
    };

    processNextChunks();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!connRef.current || !connRef.current.open) return;

    const files = Array.from(e.dataTransfer.files);
    const previews = files.map(file => ({
      name: file.name,
      size: file.size,
      type: file.type,
      file
    }));
    setPreviewFiles(prev => [...prev, ...previews]);
    setShowPreview(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const copyPeerId = () => {
    navigator.clipboard.writeText(peerId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSendFiles = async () => {
    if (!connection || !connRef.current) return;

    try {
      // Create a copy of the preview files to iterate over
      const filesToSend = [...previewFiles];
      if (filesToSend.length === 0) return;

      let allSuccessful = true;

      // Generate unique IDs for each file
      const fileIds = filesToSend.map(() => Math.random().toString(36).substring(7));

      // Set processing state immediately to show "Waiting for response"
      // This is crucial for the UI to update
      setProcessingFiles(new Set(fileIds));
      console.log('Set processing files:', fileIds);

      // Process each file sequentially
      for (let i = 0; i < filesToSend.length; i++) {
        const filePreview = filesToSend[i];
        const fileId = fileIds[i];

        try {
          console.log(`Sending file ${filePreview.name} with ID ${fileId}`);
          const accepted = await sendFile(filePreview.file, fileId);

          if (!accepted) {
            console.log(`File ${filePreview.name} was rejected`);
            allSuccessful = false;
          }
        } catch (error) {
          console.error(`Error sending file ${filePreview.name}:`, error);
          allSuccessful = false;
        } finally {
          // Remove this file from processing set regardless of outcome
          console.log(`Removing file ${fileId} from processing set`);
          setProcessingFiles(prev => {
            const next = new Set([...prev]);
            next.delete(fileId);
            return next;
          });
        }
      }

      // After all files are processed, update the UI
      console.log('All files processed, successful:', allSuccessful);
      if (allSuccessful) {
        setPreviewFiles([]);
        setShowPreview(false);
      }
    } catch (error) {
      console.error('Error in handleSendFiles:', error);
      // Clear processing state on error
      setProcessingFiles(new Set());
    }
  };

  const acceptFileTransfer = (fileId: string) => {
    const pendingTransfer = pendingTransfers.find(p => p.fileId === fileId);
    if (!pendingTransfer || !connRef.current) return;

    connRef.current.send({
      type: 'file-accepted',
      fileId: fileId
    });

    setPendingTransfers(prev => prev.filter(p => p.fileId !== fileId));
  };

  const rejectFileTransfer = (fileId: string) => {
    if (!connRef.current) return;

    connRef.current.send({
      type: 'file-rejected',
      fileId: fileId
    });

    setPendingTransfers(prev => prev.filter(p => p.fileId !== fileId));
  };

  const cancelFileTransfer = (fileId: string) => {
    if (!connRef.current) return;

    console.log(`Cancelling file transfer for ${fileId}`);

    // Mark the transfer as cancelled in our reference
    cancelledTransfersRef.current.add(fileId);

    // Send cancellation message to peer
    connRef.current.send({
      type: 'file-cancel',
      fileId: fileId
    });

    // Update the transfer status to cancelled
    setTransfers(prev => prev.map(t =>
      t.id === fileId
        ? { ...t, status: 'cancelled' }
        : t
    ));

    // Record end time for cancelled transfer
    setTransferTimes(prev => ({
      ...prev,
      [fileId]: { ...prev[fileId], end: Date.now() }
    }));

    // Clean up resources
    delete chunksInFlightRef.current[fileId];
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-8 h-8" />;
    if (type.startsWith('video/')) return <Film className="w-8 h-8" />;
    if (type.startsWith('audio/')) return <Music className="w-8 h-8" />;
    if (type.startsWith('text/')) return <FileText className="w-8 h-8" />;
    if (type.includes('zip') || type.includes('rar')) return <Archive className="w-8 h-8" />;
    return <File className="w-8 h-8" />;
  };

  const checkConnectionQuality = (lastTransferSpeed: number) => {
    // Updated thresholds for higher performance expectations
    if (lastTransferSpeed > 2000000) return 'good'; // 2MB/s or higher is good
    if (lastTransferSpeed > 500000) return 'fair'; // 500KB/s to 2MB/s is fair
    return 'poor'; // Below 500KB/s is poor
  };

  const formatSpeed = (speed: number) => {
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(speed) / Math.log(k));
    return parseFloat((speed / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Calculate estimated time remaining based on current speed and remaining bytes
  const calculateEstimatedTimeRemaining = (fileId: string, currentProgress: number, totalSize: number) => {
    const speed = transferSpeedRef.current[fileId] || 0;
    if (speed <= 0) return undefined;

    const remainingBytes = totalSize * (1 - currentProgress / 100);
    const estimatedTimeMs = (remainingBytes / speed) * 1000;

    return Math.max(0, Math.round(estimatedTimeMs));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-3 sm:p-6">
        <div className="flex justify-end mb-4">
          <ThemeToggle />
        </div>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full mb-4">
            <Share2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">P2P File Sharing</h1>
          <p className="text-gray-600 dark:text-gray-400">Share files directly between browsers, no server required</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Your Peer ID</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Share this ID with others to connect</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyPeerId}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                {copied ? (
                  <CheckCircle className="w-5 h-5 mr-2 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                )}
                {copied ? 'Copied!' : 'Copy ID'}
              </button>
              <button
                onClick={() => setShowQRModal(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <QrCode className="w-5 h-5 mr-2 text-gray-500 dark:text-gray-400" />
                Show QR
              </button>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md font-mono text-sm text-gray-900 dark:text-gray-100 break-all">
            {peerId}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Connect to Peer</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              value={targetPeerId}
              onChange={(e) => setTargetPeerId(e.target.value)}
              placeholder="Enter peer ID to connect"
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowScanner(true)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Camera className="w-5 h-5" />
              </button>
              <button
                onClick={connectToPeer}
                disabled={!targetPeerId}
                className="flex-1 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600"
              >
                Connect
              </button>
            </div>
          </div>
        </div>

        {connection && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">File Transfer</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 break-all">
                  Connected to: {connection.id}
                  <span className={`ml-2 inline-block w-2 h-2 rounded-full ${
                    connectionQuality === 'good' ? 'bg-green-500' :
                    connectionQuality === 'fair' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}></span>
                  {transferSpeed > 0 && (
                    <span className="ml-2 text-sm font-medium">
                      {formatSpeed(transferSpeed)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                />
                <button
                  onClick={() => setSecureMode(!secureMode)}
                  className={`flex items-center px-3 py-1 rounded-md text-sm ${secureMode ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}
                  title={secureMode ? 'Using secure end-to-end encryption' : 'Using standard encryption'}
                >
                  <Lock className={`w-4 h-4 mr-1 ${secureMode ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
                  {secureMode ? 'Secure' : 'Standard'}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Send Files
                </button>
              </div>
            </div>

            {showPreview && previewFiles.length > 0 && (
              <div className="mb-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Selected Files</h3>
                  <button
                    onClick={() => {
                      if (processingFiles.size === 0) {
                        setShowPreview(false);
                        setPreviewFiles([]);
                      }
                    }}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {previewFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md gap-2"
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.type)}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{file.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{formatSize(file.size)}</p>
                        </div>
                      </div>
                      {processingFiles.size === 0 && (
                        <button
                          onClick={() => setPreviewFiles(prev => prev.filter((_, i) => i !== index))}
                          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      console.log('Send button clicked, processing files size:', processingFiles.size);
                      handleSendFiles();
                    }}
                    disabled={processingFiles.size > 0}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                  >
                    {processingFiles.size > 0 ? 'Waiting for response...' : `Send ${previewFiles.length} ${previewFiles.length === 1 ? 'File' : 'Files'}`}
                  </button>
                </div>
              </div>
            )}

            {pendingTransfers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Pending Transfers</h3>
                <div className="space-y-4">
                  {pendingTransfers.map((transfer) => (
                    <div key={transfer.fileId} className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-white break-all">{transfer.fileName}</p>
                            {transfer.secure && (
                              <div title="Secure transfer with end-to-end encryption">
                                <Lock className="w-4 h-4 text-green-500 flex-shrink-0" />
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{formatSize(transfer.fileSize)}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptFileTransfer(transfer.fileId)}
                            className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => rejectFileTransfer(transfer.fileId)}
                            className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`border-2 border-dashed p-6 rounded-lg text-center ${
                dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400'
                  : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              Drag and drop files here to send
            </div>

            <div className="space-y-4 mt-4">
              {transfers.map((transfer) => (
                <FileTransferItem
                  key={transfer.id}
                  transfer={transfer}
                  transferTime={transferTimes[transfer.id]}
                  onCancel={cancelFileTransfer}
                />
              ))}
              {transfers.length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Download className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No files transferred yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
        peerId={peerId}
        onScan={() => {
          setShowQRModal(false);
          setShowScanner(true);
        }}
      />

      <QRScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanResult}
      />
    </div>
  );
}

export default App;



















