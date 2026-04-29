// ── Config ──────────────────────────────────────────────────────────────
const roomId = location.pathname.split('/room/')[1];
const params = new URLSearchParams(location.search);
const username = params.get('name') || 'Guest';

const socket = io();
let isSyncing = false;          // prevent echo loops
let localStream = null;
let peerConnection = null;
let peerId = null;
let camEnabled = false;
let micEnabled = false;

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ── Elements ─────────────────────────────────────────────────────────────
const video       = document.getElementById('mainVideo');
const placeholder = document.getElementById('placeholder');
const playBtn     = document.getElementById('playBtn');
const playIcon    = document.getElementById('playIcon');
const progressFill= document.getElementById('progressFill');
const timeDisplay = document.getElementById('timeDisplay');
const toast       = document.getElementById('toast');
const chatMessages= document.getElementById('chatMessages');
const localVideo  = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const localCamOff = document.getElementById('localCamOff');
const remoteCamOff= document.getElementById('remoteCamOff');
const roomBadge   = document.getElementById('roomBadge');
const userCountEl = document.getElementById('userCountText');
const videoUrlInput = document.getElementById('videoUrl');

// ── Room init ─────────────────────────────────────────────────────────────
roomBadge.textContent = `Room: ${roomId}`;
socket.emit('join-room', { roomId, username });

socket.on('room-state', ({ time, playing, url }) => {
  if (url) { loadVideoUrl(url); setTimeout(() => { video.currentTime = time; if (playing) video.play(); }, 400); }
});

socket.on('room-users', (users) => {
  userCountEl.textContent = `${users.length} watching`;
});

socket.on('user-joined', ({ id, username: uname }) => {
  addSystemMsg(`${uname} joined the room`);
  peerId = id;
  if (localStream) initiateCall();
});

socket.on('user-left', ({ username: uname }) => {
  addSystemMsg(`${uname} left the room`);
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  remoteVideo.style.display = 'none';
  remoteCamOff.style.display = 'flex';
});

// ── Video sync ────────────────────────────────────────────────────────────
socket.on('video-url-set', ({ url }) => loadVideoUrl(url));

socket.on('video-action', ({ action, time }) => {
  if (!video.src) return;
  isSyncing = true;
  if (Math.abs(video.currentTime - time) > 1) video.currentTime = time;
  if (action === 'play') video.play().catch(() => {});
  if (action === 'pause') video.pause();
  setTimeout(() => isSyncing = false, 300);
  showToast(action === 'play' ? '▶ Partner pressed play' : '⏸ Partner paused');
});

// ── Chat ──────────────────────────────────────────────────────────────────
socket.on('chat-message', ({ message, username: uname, time }) => {
  appendChat(uname, message, time, uname === username);
});

// ── Video controls ────────────────────────────────────────────────────────
function loadVideo() {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  socket.emit('set-video-url', { roomId, url });
  loadVideoUrl(url);
}

function loadVideoUrl(url) {
  video.src = url;
  video.style.display = 'block';
  placeholder.style.display = 'none';
  videoUrlInput.value = url;
}

function togglePlay() {
  if (!video.src) return;
  if (video.paused) {
    video.play();
    socket.emit('video-action', { roomId, action: 'play', time: video.currentTime });
  } else {
    video.pause();
    socket.emit('video-action', { roomId, action: 'pause', time: video.currentTime });
  }
}

function seekVideo(e) {
  if (!video.src || !video.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  video.currentTime = ratio * video.duration;
  socket.emit('video-action', { roomId, action: video.paused ? 'pause' : 'play', time: video.currentTime });
}

function forceSyncPartner() {
  if (!video.src) return;
  socket.emit('video-action', { roomId, action: video.paused ? 'pause' : 'play', time: video.currentTime });
  showToast('⟳ Synced with partner');
}

// Update progress bar
video.addEventListener('timeupdate', () => {
  if (!video.duration) return;
  const pct = (video.currentTime / video.duration) * 100;
  progressFill.style.width = pct + '%';
  timeDisplay.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
});

video.addEventListener('play', () => { setPlayIcon(true); });
video.addEventListener('pause', () => { setPlayIcon(false); });

function setPlayIcon(playing) {
  playIcon.innerHTML = playing
    ? '<rect x="3" y="2" width="3" height="10" rx="1"/><rect x="8" y="2" width="3" height="10" rx="1"/>'
    : '<path d="M3 2l9 5-9 5V2z"/>';
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

// ── Chat helpers ──────────────────────────────────────────────────────────
function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat-message', { roomId, message: msg, username });
  input.value = '';
}

function chatKeydown(e) {
  if (e.key === 'Enter') sendChat();
}

function appendChat(uname, message, time, isMe) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `
    <div class="chat-msg-header">
      <span class="chat-msg-name ${isMe ? 'me' : ''}">${esc(uname)}</span>
      <span class="chat-msg-time">${time || ''}</span>
    </div>
    <div class="chat-msg-text">${esc(message)}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMsg(text) {
  const div = document.createElement('div');
  div.className = 'chat-system';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Toast ─────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Copy link ─────────────────────────────────────────────────────────────
function copyLink() {
  navigator.clipboard.writeText(location.href).then(() => {
    roomBadge.textContent = '✓ Link copied!';
    setTimeout(() => roomBadge.textContent = `Room: ${roomId}`, 2000);
  });
}

// ── WebRTC ────────────────────────────────────────────────────────────────
async function toggleCamera() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
      localVideo.style.display = 'block';
      localCamOff.style.display = 'none';
      camEnabled = true; micEnabled = true;
      document.getElementById('camBtn').classList.add('active');
      if (peerId) initiateCall();
    } catch(e) {
      showToast('Camera access denied');
    }
  } else {
    const vTrack = localStream.getVideoTracks()[0];
    if (vTrack) { vTrack.enabled = !vTrack.enabled; camEnabled = vTrack.enabled; }
    document.getElementById('camBtn').classList.toggle('active', camEnabled);
  }
}

function toggleMic() {
  if (!localStream) return;
  const aTrack = localStream.getAudioTracks()[0];
  if (aTrack) { aTrack.enabled = !aTrack.enabled; micEnabled = aTrack.enabled; }
  document.getElementById('micBtn').classList.toggle('active', !micEnabled);
}

async function initiateCall() {
  createPeerConnection();
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit('rtc-offer', { to: peerId, offer });
}

function createPeerConnection() {
  if (peerConnection) peerConnection.close();
  peerConnection = new RTCPeerConnection(ICE_SERVERS);

  if (localStream) {
    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
  }

  peerConnection.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
    remoteVideo.style.display = 'block';
    remoteCamOff.style.display = 'none';
  };

  peerConnection.onicecandidate = (e) => {
    if (e.candidate && peerId) {
      socket.emit('rtc-ice', { to: peerId, candidate: e.candidate });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'disconnected') {
      remoteVideo.style.display = 'none';
      remoteCamOff.style.display = 'flex';
    }
  };
}

socket.on('rtc-offer', async ({ from, offer }) => {
  peerId = from;
  createPeerConnection();
  await peerConnection.setRemoteDescription(offer);
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('rtc-answer', { to: from, answer });
});

socket.on('rtc-answer', async ({ answer }) => {
  if (peerConnection) await peerConnection.setRemoteDescription(answer);
});

socket.on('rtc-ice', async ({ candidate }) => {
  if (peerConnection) {
    try { await peerConnection.addIceCandidate(candidate); } catch(e) {}
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
});

// ── Local file loader ─────────────────────────────────────────────────────
function loadLocalFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  video.src = url;
  video.style.display = 'block';
  placeholder.style.display = 'none';
  document.getElementById('localFileNote').style.display = 'block';
  document.getElementById('videoUrl').value = '';
  showToast('📁 ' + file.name + ' loaded!');
  addSystemMsg('Video loaded from PC: ' + file.name + ' — ask your friend to load the same file!');
}
