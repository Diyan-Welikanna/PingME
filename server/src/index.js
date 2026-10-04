import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*', methods: ['GET', 'POST'] }
});

const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || 'local-development-secret';
const users = new Map();
const locations = new Map();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json());

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '2h' });
}

function auth(request, response, next) {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return response.status(401).json({ message: 'Authentication required' });
  try {
    request.user = jwt.verify(header.slice(7), jwtSecret);
    next();
  } catch {
    response.status(401).json({ message: 'Session expired' });
  }
}

app.get('/health', (_request, response) => response.json({ status: 'ok', service: 'pingme-api' }));

app.post('/auth/register', (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const name = String(request.body.name || '').trim();
  if (!email || !name) return response.status(400).json({ message: 'Name and email are required' });
  const existing = [...users.values()].find((user) => user.email === email);
  if (existing) return response.status(409).json({ message: 'Account already exists' });

  const user = { id: randomUUID(), email, name };
  users.set(user.id, user);
  return response.status(201).json({ token: issueToken(user), user });
});

app.post('/auth/login', (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const user = [...users.values()].find((candidate) => candidate.email === email);
  if (!user) return response.status(401).json({ message: 'No local account found. Register first.' });
  return response.json({ token: issueToken(user), user });
});

app.get('/me', auth, (request, response) => {
  const user = users.get(request.user.sub);
  if (!user) return response.status(404).json({ message: 'User not found' });
  response.json({ user, location: locations.get(user.id) || null });
});

app.get('/locations', auth, (_request, response) => {
  response.json({ locations: [...locations.values()] });
});

app.post('/locations', auth, (request, response) => {
  const latitude = Number(request.body.latitude);
  const longitude = Number(request.body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return response.status(400).json({ message: 'Valid coordinates are required' });
  }

  const user = users.get(request.user.sub);
  const location = { userId: user.id, name: user.name, latitude, longitude, updatedAt: new Date().toISOString() };
  locations.set(user.id, location);
  io.emit('location:updated', location);
  response.status(201).json({ location });
});

const socketAuth = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
};

io.use(socketAuth);
io.on('connection', (socket) => {
  socket.emit('locations:initial', [...locations.values()]);
});

httpServer.listen(port, () => console.log(`PingMe API listening on http://localhost:${port}`));
