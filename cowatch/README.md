# WatchTogether 🎬

Watch movies together in real-time with video calling and live chat.

## Features
- ✅ Synchronized video playback (play/pause/seek)
- ✅ Peer-to-peer video call (WebRTC)
- ✅ Live chat
- ✅ Room system with shareable links
- ✅ No account needed

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Run the server
```bash
npm start
```
Or for development with auto-reload:
```bash
npm run dev
```

### 3. Open in browser
```
http://localhost:3000
```

## How to use
1. Open the site, enter your name, click **Create room**
2. Share the room link with your friend
3. Both paste the same video URL (direct `.mp4` / `.webm` link)
4. Click the camera button to enable video call
5. Press play — it syncs automatically!

## Tech Stack
- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js + Express
- **Real-time sync**: Socket.IO
- **Video call**: WebRTC (peer-to-peer)

## Project Structure
```
cowatch/
├── server.js          # Express + Socket.IO backend
├── package.json
└── public/
    ├── index.html     # Homepage
    ├── room.html      # Room page
    ├── css/
    │   └── main.css   # All styles
    └── js/
        └── room.js    # Room logic (sync + WebRTC)
```
