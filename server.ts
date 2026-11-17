import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getAuth();
const ADMIN_EMAIL = 'automation.ioan@gmail.com';

interface ConnectedPeer {
  ws: WebSocket;
  uid: string;
  displayName: string;
  photoUrl: string;
  role: string;
  accessStatus: string;
  isAdmin: boolean;
  inCallWith: string | null;
  connectedAt: string;
}

const connectedPeers = new Map<string, ConnectedPeer>();

function serializePeers() {
  return Array.from(connectedPeers.values()).map((peer) => ({
    uid: peer.uid,
    displayName: peer.displayName,
    photoUrl: peer.photoUrl,
    role: peer.role,
    accessStatus: peer.accessStatus,
    inCallWith: peer.inCallWith,
    connectedAt: peer.connectedAt,
  }));
}

function broadcastPresence() {
  const payload = JSON.stringify({
    type: 'presence:sync',
    peers: serializePeers(),
  });
  for (const peer of connectedPeers.values()) {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

function sendToUser(targetUid: string, message: Record<string, unknown>) {
  const target = connectedPeers.get(targetUid);
  if (target && target.ws.readyState === WebSocket.OPEN) {
    target.ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activePeers: connectedPeers.size });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let authenticatedUid: string | null = null;

    const authTimeout = setTimeout(() => {
      if (!authenticatedUid && ws.readyState === WebSocket.OPEN) {
        ws.close(4001, 'Authentication timeout');
      }
    }, 12000);

    ws.on('message', async (raw) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const msgType = typeof data.type === 'string' ? data.type : '';

      if (msgType === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
        return;
      }

      if (msgType === 'auth') {
        const token = typeof data.token === 'string' ? data.token : '';
        if (!token) {
          ws.close(4002, 'Missing token');
          return;
        }

        try {
          const decoded = await adminAuth.verifyIdToken(token);
          clearTimeout(authTimeout);

          const isAdmin =
            decoded.email === ADMIN_EMAIL && decoded.email_verified === true;
          const uid = decoded.uid;

          const existing = connectedPeers.get(uid);
          if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
            existing.ws.close(4009, 'Replaced by newer session');
          }

          const profileInput =
            data.profile && typeof data.profile === 'object'
              ? (data.profile as Record<string, unknown>)
              : {};

          const displayName =
            typeof profileInput.displayName === 'string' && profileInput.displayName.trim()
              ? profileInput.displayName.trim().slice(0, 80)
              : typeof decoded.name === 'string' && decoded.name.trim()
                ? decoded.name.trim().slice(0, 80)
                : 'Participante';

          const photoUrl =
            typeof profileInput.photoUrl === 'string'
              ? profileInput.photoUrl.slice(0, 500)
              : typeof decoded.picture === 'string'
                ? decoded.picture.slice(0, 500)
                : '';

          const accessStatus =
            typeof profileInput.accessStatus === 'string' &&
            ['active', 'vip', 'muted', 'blocked'].includes(profileInput.accessStatus)
              ? profileInput.accessStatus
              : isAdmin
                ? 'vip'
                : 'active';

          const role = isAdmin ? 'model' : 'viewer';

          authenticatedUid = uid;
          connectedPeers.set(uid, {
            ws,
            uid,
            displayName,
            photoUrl,
            role,
            accessStatus,
            isAdmin,
            inCallWith: null,
            connectedAt: new Date().toISOString(),
          });

          ws.send(
            JSON.stringify({
              type: 'auth:ok',
              uid,
              isAdmin,
              role,
            })
          );
          broadcastPresence();
        } catch (err) {
          console.error('WebSocket token verification failed:', err);
          ws.close(4003, 'Invalid token');
        }
        return;
      }

      if (!authenticatedUid) {
        return;
      }

      const sender = connectedPeers.get(authenticatedUid);
      if (!sender) {
        return;
      }

      if (msgType === 'presence:update') {
        if (typeof data.inCallWith === 'string' || data.inCallWith === null) {
          sender.inCallWith = data.inCallWith as string | null;
        }
        if (
          typeof data.accessStatus === 'string' &&
          ['active', 'vip', 'muted', 'blocked'].includes(data.accessStatus)
        ) {
          sender.accessStatus = data.accessStatus;
        }
        broadcastPresence();
        return;
      }

      // Direct WebRTC & Call Lifecycle Signaling
      if (
        [
          'call:ring',
          'call:accept',
          'call:reject',
          'call:end',
          'webrtc:offer',
          'webrtc:answer',
          'webrtc:ice',
        ].includes(msgType)
      ) {
        const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
        if (!targetUid) return;

        if (sender.accessStatus === 'blocked' && !sender.isAdmin) {
          ws.send(
            JSON.stringify({
              type: 'moderation:effect',
              action: 'blocked',
              reason: 'Acesso suspenso pela moderação do estúdio.',
            })
          );
          return;
        }

        if (msgType === 'call:accept') {
          sender.inCallWith = targetUid;
          const target = connectedPeers.get(targetUid);
          if (target) target.inCallWith = sender.uid;
          broadcastPresence();
        } else if (msgType === 'call:end' || msgType === 'call:reject') {
          sender.inCallWith = null;
          const target = connectedPeers.get(targetUid);
          if (target && target.inCallWith === sender.uid) {
            target.inCallWith = null;
          }
          broadcastPresence();
        }

        sendToUser(targetUid, {
          ...data,
          fromUid: sender.uid,
          fromName: sender.displayName,
          fromPhotoUrl: sender.photoUrl,
          fromRole: sender.role,
        });
        return;
      }

      // Real-Time Model / Admin User Control Commands
      if (msgType === 'moderation:command') {
        if (!sender.isAdmin) return;
        const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
        const action = typeof data.action === 'string' ? data.action : '';
        if (!targetUid || !action) return;

        const target = connectedPeers.get(targetUid);
        if (target) {
          if (action === 'mute') target.accessStatus = 'muted';
          if (action === 'unmute') target.accessStatus = 'active';
          if (action === 'block') {
            target.accessStatus = 'blocked';
            target.inCallWith = null;
            if (sender.inCallWith === targetUid) sender.inCallWith = null;
          }
          if (action === 'unblock') target.accessStatus = 'active';
          if (action === 'vip') target.accessStatus = 'vip';
          if (action === 'kick_call') {
            target.inCallWith = null;
            if (sender.inCallWith === targetUid) sender.inCallWith = null;
          }
        }

        sendToUser(targetUid, {
          type: 'moderation:effect',
          action,
          byUid: sender.uid,
          byName: sender.displayName,
          reason: typeof data.reason === 'string' ? data.reason : '',
        });
        broadcastPresence();
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authenticatedUid) {
        const current = connectedPeers.get(authenticatedUid);
        if (current && current.ws === ws) {
          if (current.inCallWith) {
            sendToUser(current.inCallWith, {
              type: 'call:end',
              fromUid: authenticatedUid,
              reason: 'peer_disconnected',
            });
            const peer = connectedPeers.get(current.inCallWith);
            if (peer && peer.inCallWith === authenticatedUid) {
              peer.inCallWith = null;
            }
          }
          connectedPeers.delete(authenticatedUid);
          broadcastPresence();
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Maison Aura server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
