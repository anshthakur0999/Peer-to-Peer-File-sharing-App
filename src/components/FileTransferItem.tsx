import React from 'react';
import { Download, CheckCircle, X, AlertCircle } from 'lucide-react';
import { FileTransfer } from '../types';
import { decryptFile } from '../lib/encryption';

interface FileTransferItemProps {
  transfer: FileTransfer;
}

export const FileTransferItem: React.FC<FileTransferItemProps> = ({ transfer }) => {
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
        return <X className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const handleDownload = async () => {
    if (transfer.blob && transfer.key && transfer.iv) {
      try {
        const decryptedBlob = await decryptFile(
          transfer.blob,
          transfer.key,
          transfer.iv,
          transfer.type
        );
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
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{transfer.name}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{formatSize(transfer.size)}</p>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          {transfer.status === 'completed' && transfer.blob && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </button>
          )}
        </div>
      </div>
      <div className="relative pt-1">
        <div className="flex mb-2 items-center justify-between">
          <div>
            <span className="text-xs font-semibold inline-block text-blue-600 dark:text-blue-400">
              {transfer.status === 'transferring' ? 'Transferring' : 
               transfer.status === 'completed' ? 'Completed' :
               transfer.status === 'rejected' ? 'Rejected' :
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
              'bg-blue-500'
            }`}
          />
        </div>
      </div>
    </div>
  );
};