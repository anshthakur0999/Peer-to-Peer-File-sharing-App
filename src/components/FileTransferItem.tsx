import React from 'react';
import { Download, CheckCircle, X, AlertCircle, Clock, Lock } from 'lucide-react';
import { FileTransfer } from '../types';
import { decryptFile, secureDecryptFile } from '../lib/encryption';

interface FileTransferItemProps {
  transfer: FileTransfer;
  transferTime?: { start: number, end?: number };
  onCancel?: (fileId: string) => void;
}

export const FileTransferItem: React.FC<FileTransferItemProps> = ({ transfer, transferTime, onCancel }) => {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = () => {
    switch (transfer.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'rejected':
      case 'cancelled':
        return <X className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const handleDownload = async () => {
    if (!transfer.blob || !transfer.iv) return;

    try {
      let decryptedBlob;

      // Use the appropriate decryption method based on whether this is a secure transfer
      if (transfer.secure && transfer.sessionId) {
        // Secure decryption using pre-exchanged key
        decryptedBlob = await secureDecryptFile(
          transfer.blob,
          transfer.sessionId,
          transfer.iv,
          transfer.type
        );
      } else if (transfer.key) {
        // Legacy decryption
        decryptedBlob = await decryptFile(
          transfer.blob,
          transfer.key,
          transfer.iv,
          transfer.type
        );
      } else {
        throw new Error('Missing encryption information');
      }

      // Create download link
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = transfer.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error decrypting file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to decrypt file: ${errorMessage}`);
    }
  };

  const formatTransferTime = () => {
    if (!transferTime || !transferTime.end) {
      if (transfer.status === 'transferring') {
        if (transfer.estimatedTimeRemaining !== undefined) {
          return formatTimeRemaining(transfer.estimatedTimeRemaining);
        }
        return 'Calculating time...';
      }
      return transfer.status === 'pending' ? 'Waiting to start...' :
             transfer.status === 'cancelled' ? 'Cancelled' : 'In progress';
    }

    const durationMs = transferTime.end - transferTime.start;
    if (durationMs < 1000) return `${durationMs}ms`;

    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatTimeRemaining = (timeMs: number) => {
    if (timeMs < 1000) return 'Less than 1s';

    const seconds = Math.floor(timeMs / 1000);
    if (seconds < 60) return `${seconds}s remaining`;

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s remaining`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m remaining`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white break-all">{transfer.name}</p>
            {getStatusIcon()}
            {transfer.secure && (
              <div title="Secure transfer with end-to-end encryption" className="flex-shrink-0">
                <Lock className="w-4 h-4 text-green-500" />
              </div>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatSize(transfer.size)}</p>
          <p className={`text-xs flex items-center mt-1 ${transfer.status === 'transferring' && transfer.estimatedTimeRemaining ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
            <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
            {formatTransferTime()}
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {transfer.status === 'completed' && transfer.blob && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </button>
          )}
          {(transfer.status === 'pending' || transfer.status === 'transferring') && onCancel && (
            <button
              onClick={() => onCancel(transfer.id)}
              className="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
            >
              <X className="w-4 h-4 mr-1" />
              Cancel
            </button>
          )}
        </div>
      </div>
      <div className="relative pt-1">
        <div className="flex mb-2 items-center justify-between">
          <div>
            <span className={`text-xs font-semibold inline-block ${transfer.status === 'cancelled' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>
              {transfer.status === 'transferring' ? 'Transferring' :
               transfer.status === 'completed' ? 'Completed' :
               transfer.status === 'rejected' ? 'Rejected' :
               transfer.status === 'cancelled' ? 'Cancelled' :
               transfer.status === 'error' ? 'Error' : 'Pending'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs font-semibold inline-block text-blue-600 dark:text-blue-400">
              {transfer.progress}%
            </span>
          </div>
        </div>
        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200 dark:bg-blue-900">
          <div
            style={{ width: `${transfer.progress}%` }}
            className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
              transfer.status === 'completed' ? 'bg-green-500' :
              transfer.status === 'error' ? 'bg-red-500' :
              transfer.status === 'rejected' ? 'bg-red-500' :
              transfer.status === 'cancelled' ? 'bg-red-500' :
              'bg-blue-500'
            }`}
          />
        </div>
      </div>
    </div>
  );
};

