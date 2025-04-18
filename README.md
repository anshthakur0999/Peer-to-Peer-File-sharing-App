# P2P File Sharing Web App

A browser-based peer-to-peer file sharing application built with React, TypeScript, and PeerJS. This application allows users to share files directly between browsers without requiring a central server for file storage or transfer.

## Access the Site
```[https://p2pft.netlify.app/](https://peer-to-peer-file-sharing-app.vercel.app/)```

## Features

- **Direct P2P File Transfer**: Share files directly between browsers using WebRTC
- **No File Size Limits**: Transfer files of any size (limited only by browser memory)
- **End-to-End Encryption**: All file transfers are encrypted for security
- **QR Code Sharing**: Easily share connection IDs via QR codes
- **Drag & Drop Interface**: Simple and intuitive file sharing
- **Real-time Transfer Statistics**: View transfer speed and estimated time remaining
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Mode Support**: Toggle between light and dark themes

## Technology Stack

- **Frontend**: React with TypeScript
- **P2P Communication**: PeerJS (WebRTC)
- **Styling**: TailwindCSS
- **Build Tool**: Vite
- **QR Code**: QRCode.react for generation, jsQR for scanning
- **Encryption**: Web Crypto API

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/anshthakur0999/Peer-to-Peer-File-sharing-App.git
cd p2p-file-sharing
```

2. Install dependencies
```bash
npm install
# or
yarn
```

3. Start the development server
```bash
npm run dev
# or
yarn dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

1. **Connect to a Peer**:
   - Share your Peer ID with someone you want to connect with
   - Or scan their QR code using the "Scan QR Code" button
   - Enter their Peer ID in the "Connect to Peer" field

2. **Send Files**:
   - Click "Select Files" or drag and drop files onto the drop zone
   - Review the files and click "Send Files"
   - The recipient will be prompted to accept the file transfer

3. **Receive Files**:
   - Accept incoming file transfer requests
   - Files will be downloaded automatically once transfer is complete

## Security

This application implements end-to-end encryption for all file transfers:

- Files are encrypted before transmission using the Web Crypto API
- Key exchange uses ECDH (Elliptic Curve Diffie-Hellman)
- Each file transfer uses a unique encryption key

## Building for Production

```bash
npm run build
# or
yarn build
```

The built files will be in the `dist` directory and can be served by any static file server.

## Acknowledgments

- [PeerJS](https://peerjs.com/) for WebRTC implementation
- [TailwindCSS](https://tailwindcss.com/) for styling
- [Lucide React](https://lucide.dev/) for icons

