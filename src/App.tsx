import React, { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import { Share2, Upload, Download, Copy, CheckCircle, X, FileText, Image, Film, Music, Archive, File, QrCode, Camera } from 'lucide-react';
import { FileTransfer, PeerConnection, FilePreview, FileTransferMessage } from './types';
import { FileTransferItem } from './components/FileTransferItem';
import { ThemeToggle } from './components/ui/theme-toggle';
import { QRCodeModal } from './components/QRCodeModal';
import { QRScanner } from './components/QRScanner';
import { encryptFile } from './lib/encryption';

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
  }[]>([]);
  const [processingFiles, setProcessingFiles] = useState<Set<string>>(new Set());
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor'>('good');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const peerRef = useRef<Peer>();
  const connRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileChunksRef = useRef<{ [key: string]: ArrayBuffer[] }>({});

  useEffect(() => {
    const peer = new Peer();
    
    peer.on('open', (id) => {
      setPeerId(id);
      peerRef.current = peer;
    });

    peer.on('connection', (conn) => {
      connRef.current = conn;
      setupConnection(conn);
    });

    return () => {
      peer.destroy();
    };
  }, []);

  const setupConnection = (conn: any) => {
    conn.on('open', () => {
      setConnection({ id: conn.peer, connected: true });
    });

    conn.on('data', handleIncomingData);

    conn.on('close', () => {
      setConnection(null);
      connRef.current = null;
    });

    conn.on('error', (err: any) => {
      console.error('Connection error:', err);
      setConnection(null);
      connRef.current = null;
    });
  };

  const handleIncomingData = async (data: any) => {
    if (data.type === 'file-request') {
      setPendingTransfers(prev => [...prev, {
        fileId: data.fileId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType
      }]);
    } else if (data.type === 'file-start') {
      fileChunksRef.current[data.fileId] = new Array(Math.ceil(data.fileSize / 16384));
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
      if (!fileChunksRef.current[data.fileId]) {
        fileChunksRef.current[data.fileId] = [];
      }
      fileChunksRef.current[data.fileId][data.chunk] = data.data;
      
      setTransfers(prev => prev.map(t => 
        t.id === data.fileId 
          ? { ...t, progress: Math.round((data.chunk + 1) * 100 / data.total), status: 'transferring' }
          : t
      ));

      if (data.chunk === data.total - 1) {
        const chunks = fileChunksRef.current[data.fileId].filter(chunk => chunk !== undefined);
        const blob = new Blob(chunks, { 
          type: transfers.find(t => t.id === data.fileId)?.type || 'application/octet-stream' 
        });
        
        setTransfers(prev => prev.map(t => 
          t.id === data.fileId 
            ? { ...t, blob, progress: 100, status: 'completed' }
            : t
        ));

        delete fileChunksRef.current[data.fileId];
      }
    }
  };

  const connectToPeer = () => {
    if (!peerRef.current || !targetPeerId) return;
    
    const conn = peerRef.current.connect(targetPeerId);
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

    const { data: encryptedData, key, iv } = await encryptFile(file);
  
    connRef.current.send({
      type: 'file-request',
      fileId,
      fileName: file.name,
      fileSize: encryptedData.size,
      fileType: file.type,
      key,
      iv
    });
  
    return new Promise<boolean>((resolve) => {
      const handleResponse = (data: any) => {
        if (data.type === 'file-accepted' && data.fileId === fileId) {
          startFileTransfer(encryptedData, fileId, file.name, file.type, key, iv);
          setProcessingFiles(prev => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          connRef.current.off('data', handleResponse);
          resolve(true);
        } else if (data.type === 'file-rejected' && data.fileId === fileId) {
          setTransfers(prev => [...prev, {
            id: fileId,
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            status: 'rejected'
          }]);
          setProcessingFiles(prev => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          connRef.current.off('data', handleResponse);
          resolve(false);
        }
      };
  
      connRef.current.on('data', handleResponse);
    });
  };

  const startFileTransfer = (
    encryptedBlob: Blob,
    fileId: string,
    fileName: string,
    fileType: string,
    key: string,
    iv: number[]
  ) => {
    const chunkSize = 16384;
    const totalChunks = Math.ceil(encryptedBlob.size / chunkSize);
    
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
      iv
    });

    const reader = new FileReader();
    let currentChunk = 0;
    const startTime = performance.now();

    const readNextChunk = () => {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, encryptedBlob.size);
      const slice = encryptedBlob.slice(start, end);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (e.target?.result && connRef.current) {
        const transferSpeed = chunkSize / (performance.now() - startTime);
        setConnectionQuality(checkConnectionQuality(transferSpeed));
        
        connRef.current.send({
          type: 'file-chunk',
          fileId,
          chunk: currentChunk,
          total: totalChunks,
          data: e.target.result
        });
  
        setTransfers(prev => prev.map(t => 
          t.id === fileId 
            ? { ...t, progress: Math.round((currentChunk + 1) * 100 / totalChunks), status: 'transferring' }
            : t
        ));
  
        currentChunk++;
        
        if (currentChunk < totalChunks) {
          setTimeout(readNextChunk, 10);
        } else {
          connRef.current.send({
            type: 'file-complete',
            fileId
          });
  
          setTransfers(prev => prev.map(t => 
            t.id === fileId 
              ? { ...t, progress: 100, status: 'completed' }
              : t
          ));
        }
      }
    };

    reader.onerror = () => {
      setTransfers(prev => prev.map(t => 
        t.id === fileId 
          ? { ...t, status: 'error' }
          : t
      ));
    };

    readNextChunk();
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
      for (const filePreview of previewFiles) {
        const fileId = Math.random().toString(36).substring(7);
        setProcessingFiles(prev => new Set([...prev, fileId]));
        const accepted = await sendFile(filePreview.file, fileId);
        
        if (accepted) {
          setPreviewFiles(prev => prev.filter(p => p.file !== filePreview.file));
        }
      }
  
      if (previewFiles.length === 0) {
        setShowPreview(false);
      }
    } catch (error) {
      console.error('Error sending files:', error);
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

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <Image className="w-8 h-8" />;
    if (type.startsWith('video/')) return <Film className="w-8 h-8" />;
    if (type.startsWith('audio/')) return <Music className="w-8 h-8" />;
    if (type.startsWith('text/')) return <FileText className="w-8 h-8" />;
    if (type.includes('zip') || type.includes('rar')) return <Archive className="w-8 h-8" />;
    return <File className="w-8 h-8" />;
  };

  const checkConnectionQuality = (lastTransferSpeed: number) => {
    if (lastTransferSpeed > 1000000) return 'good';
    if (lastTransferSpeed > 100000) return 'fair';
    return 'poor';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Your Peer ID</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Share this ID with others to connect</p>
            </div>
            <div className="flex gap-2">
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
          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-md font-mono text-sm text-gray-900 dark:text-gray-100">
            {peerId}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Connect to Peer</h2>
          <div className="flex gap-4">
            <input
              type="text"
              value={targetPeerId}
              onChange={(e) => setTargetPeerId(e.target.value)}
              placeholder="Enter peer ID to connect"
              className="flex-1 rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            />
            <button
              onClick={() => setShowScanner(true)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Camera className="w-5 h-5" />
            </button>
            <button
              onClick={connectToPeer}
              disabled={!targetPeerId}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 dark:disabled:bg-gray-600"
            >
              Connect
            </button>
          </div>
        </div>

        {connection && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">File Transfer</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connected to: {connection.id} 
                  <span className={`ml-2 inline-block w-2 h-2 rounded-full ${
                    connectionQuality === 'good' ? 'bg-green-500' :
                    connectionQuality === 'fair' ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}></span>
                </p>
              </div>
              <div className="flex gap-4">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  className="hidden"
                />
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
                      className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md"
                    >
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.type)}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">{formatSize(file.size)}</p>
                        </div>
                      </div>
                      {processingFiles.size === 0 && (
                        <button
                          onClick={() => setPreviewFiles(prev => prev.filter((_, i) => i !== index))}
                          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleSendFiles}
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
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{transfer.fileName}</p>
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
                <FileTransferItem key={transfer.id} transfer={transfer} />
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