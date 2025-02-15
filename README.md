# P2P File Sharing Application

A secure peer-to-peer file sharing web application built with React, TypeScript, and WebRTC. Share files directly between browsers with end-to-end encryption, no server storage required.

#Access the Site
```https://p2pft.netlify.app/```

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) (v7 or higher)
- [Git](https://git-scm.com/)

## Installation

1. Clone the repository
```bash
git clone <URL>
cd p2p-file-sharing
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file in the root directory (optional)
```bash
VITE_APP_NAME="P2P File Sharing"
```

## Development

To start the development server:

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

## Project Structure

```
/
├── src/
│   ├── components/
│   │   ├── FileTransferItem.tsx
│   │   ├── QRCodeModal.tsx
│   │   ├── QRScanner.tsx
│   │   └── ui/
│   │       └── theme-toggle.tsx
│   ├── lib/
│   │   ├── encryption.ts
│   │   └── utils.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
├── public/
├── index.html
└── package.json
```

## Dependencies

Key dependencies used in this project:

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "peerjs": "^1.5.2",
    "lucide-react": "^0.344.0",
    "qrcode.react": "^3.1.0",
    "jsqr": "^1.4.0"
  }
}
```

## Features

- 🔐 End-to-end encryption
- 📁 Direct P2P file transfer
- 📱 QR code sharing
- 🌓 Dark/Light theme
- 📊 Transfer progress tracking
- 🔄 Connection quality monitoring
- 📂 Multiple file support
- 🖥️ Cross-platform compatibility

## 🌟 Core Features

### File Sharing
- Direct peer-to-peer file transfer
- Support for multiple file selection
- Drag and drop file upload
- Progress tracking for file transfers
- File preview before sending
- Automatic file type detection and icons
- Support for large files with chunked transfer

### Security
- End-to-end encryption using AES-GCM
- Secure key exchange
- No server storage of files
- Direct WebRTC connections

### Connection Management
- Unique peer ID generation
- QR code sharing for easy connection
- QR code scanning for connecting
- Connection quality indicator
- Connection status monitoring
- Automatic reconnection handling

### User Interface
- Dark/Light theme support
- Responsive design
- File transfer progress bars
- Transfer status indicators
- File size formatting
- File type icons
- Drag and drop interface
- Loading states and feedback

## 📋 Detailed Features

### File Transfer Features
- Multiple file selection and upload
- File progress tracking
- File transfer status updates
- File size display
- File type detection
- Transfer speed monitoring
- Connection quality assessment
- Chunked file transfer for large files
- File transfer pause/resume
- Transfer error handling

### Security Features
- AES-GCM encryption
- Unique encryption keys per file
- Secure key exchange
- No server storage
- Direct P2P connections
- Encrypted data chunks

### Connection Features
- WebRTC peer connections
- Unique peer ID generation
- QR code peer ID sharing
- QR code scanning
- Connection status monitoring
- Connection quality indicators
- Auto-reconnection
- Error handling

### UI/UX Features
- Dark/Light theme toggle
- Responsive design
- Drag and drop interface
- File previews
- Progress indicators
- Status notifications
- Loading states
- Error messages
- Success feedback
- Clean, modern interface

### File Management
- File type detection
- File size calculation
- File chunking
- Progress tracking
- Status management
- Error handling
- Download management

## 🔄 Data Flow

1. **File Selection**
   - Multiple file selection
   - Drag and drop support
   - File preview
   - Type detection

2. **Connection**
   - Peer ID generation
   - QR code sharing
   - Direct P2P connection
   - Connection monitoring

3. **Transfer**
   - File encryption
   - Chunked transfer
   - Progress tracking
   - Status updates

4. **Reception**
   - Chunk assembly
   - Decryption
   - File reconstruction
   - Download handling

## Acknowledgments

- [PeerJS](https://peerjs.com/)
- [React](https://reactjs.org/)
- [Lucide Icons](https://lucide.dev/)



