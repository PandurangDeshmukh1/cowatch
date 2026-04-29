const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/room/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, username }) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username || 'Guest';
    if (!rooms[roomId]) rooms[roomId] = { users: [], videoState: { time: 0, playing: false, url: '' } };
    rooms[roomId].users.push({ id: socket.id, username: socket.username });
    socket.emit('room-state', rooms[roomId].videoState);
    socket.emit('room-users', rooms[roomId].users);
    socket.to(roomId).emit('user-joined', { id: socket.id, username: socket.username });
    socket.to(roomId).emit('room-users', rooms[roomId].users);
    console.log(`${socket.username} joined room ${roomId}`);
  });

  socket.on('video-action', ({ roomId, action, time, url }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].videoState = { playing: action === 'play', time, url: url || rooms[roomId].videoState.url };
    socket.to(roomId).emit('video-action', { action, time, url });
  });

  socket.on('set-video-url', ({ roomId, url }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].videoState.url = url;
    io.to(roomId).emit('video-url-set', { url });
  });

  socket.on('chat-message', ({ roomId, message, username }) => {
    io.to(roomId).emit('chat-message', { message, username, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
  });

  socket.on('rtc-offer', ({ to, offer }) => {
    io.to(to).emit('rtc-offer', { from: socket.id, offer });
  });

  socket.on('rtc-answer', ({ to, answer }) => {
    io.to(to).emit('rtc-answer', { from: socket.id, answer });
  });

  socket.on('rtc-ice', ({ to, candidate }) => {
    io.to(to).emit('rtc-ice', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);
      socket.to(roomId).emit('user-left', { id: socket.id, username: socket.username });
      socket.to(roomId).emit('room-users', rooms[roomId].users);
      if (rooms[roomId].users.length === 0) delete rooms[roomId];
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`WatchTogether running on http://localhost:${PORT}`));