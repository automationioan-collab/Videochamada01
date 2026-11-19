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

const MAIN_ROOM_ID = 'main_studio_room';

interface RoomParticipantRecord {
  uid: string;
  displayName: string;
  photoUrl: string;
  role: string;
  accessStatus: string;
  isAdmin: boolean;
  joinedAt: string;
  callId?: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
}

interface QueueEntryRecord {
  callId: string;
  uid: string;
  planDurationMinutes: number;
  createdAtMs: number;
}

interface ActiveCallEstimate {
  callId: string;
  startedAtMs: number;
  durationMinutes: number;
}

const connectedPeers = new Map<string, ConnectedPeer>();
const roomParticipants = new Map<string, RoomParticipantRecord>();
const visitorQueueEntries = new Map<string, QueueEntryRecord>();
let authoritativeWaitingQueue: QueueEntryRecord[] = [];
let hasAuthoritativeQueue = false;
let activeCallEstimate: ActiveCallEstimate | null = null;

function getOrderedWaitingEntries(): QueueEntryRecord[] {
  const source = hasAuthoritativeQueue
    ? authoritativeWaitingQueue
    : Array.from(visitorQueueEntries.values());
  return [...source].sort((a, b) => a.createdAtMs - b.createdAtMs);
}

function getActiveCallRemainingSeconds(nowMs: number): number {
  if (!activeCallEstimate) return 0;
  const durationSec = Math.max(60, activeCallEstimate.durationMinutes * 60);
  const elapsedSec = Math.max(
    0,
    Math.round((nowMs - activeCallEstimate.startedAtMs) / 1000)
  );
  return Math.max(45, durationSec - elapsedSec);
}

function buildQueueSummaryForUser(uid: string | null) {
  const nowMs = Date.now();
  const ordered = getOrderedWaitingEntries();
  const totalWaiting = ordered.length;
  const activeCallRemainingSeconds = getActiveCallRemainingSeconds(nowMs);

  const myIndex = uid ? ordered.findIndex((entry) => entry.uid === uid) : -1;
  const myPosition = myIndex >= 0 ? myIndex + 1 : 0;
  const aheadSlice = myIndex >= 0 ? ordered.slice(0, myIndex) : ordered;
  const aheadCount = aheadSlice.length;

  const aheadQueueSeconds = aheadSlice.reduce((sum, entry) => {
    const mins = Math.max(1, Math.min(240, entry.planDurationMinutes || 10));
    return sum + mins * 60 + 30;
  }, 0);

  let totalEstimatedWaitSeconds = activeCallRemainingSeconds + aheadQueueSeconds;
  if (myIndex >= 0 && totalEstimatedWaitSeconds === 0) {
    const entry = ordered[myIndex];
    const waitedSec = Math.max(
      0,
      Math.round((nowMs - entry.createdAtMs) / 1000)
    );
    totalEstimatedWaitSeconds = Math.max(15, 45 - waitedSec);
  }

  return {
    totalWaiting,
    myPosition,
    aheadCount,
    activeCallRemainingSeconds,
    aheadQueueSeconds,
    totalEstimatedWaitSeconds,
    updatedAtMs: nowMs,
  };
}

function sendQueueSyncToPeer(peer: ConnectedPeer) {
  if (peer.ws.readyState !== WebSocket.OPEN) return;
  peer.ws.send(
    JSON.stringify({
      type: 'queue:sync',
      summary: buildQueueSummaryForUser(peer.uid),
    })
  );
}

function broadcastQueueSync() {
  for (const peer of connectedPeers.values()) {
    sendQueueSyncToPeer(peer);
  }
}

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

function serializeRoomParticipants() {
  return Array.from(roomParticipants.values());
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

function broadcastRoomSync() {
  const payload = JSON.stringify({
    type: 'room:sync',
    roomId: MAIN_ROOM_ID,
    participants: serializeRoomParticipants(),
  });
  for (const peer of connectedPeers.values()) {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(payload);
    }
  }
}

function notifyRoomParticipantsAndAdmins(
  excludeUid: string | null,
  message: Record<string, unknown>
) {
  const serialized = JSON.stringify(message);
  for (const peer of connectedPeers.values()) {
    if (peer.uid === excludeUid) continue;
    if (
      (roomParticipants.has(peer.uid) || peer.isAdmin) &&
      peer.ws.readyState === WebSocket.OPEN
    ) {
      peer.ws.send(serialized);
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
    res.json({
      ok: true,
      activePeers: connectedPeers.size,
      roomParticipantCount: roomParticipants.size,
    });
  });

  app.get('/api/studio/public-status', (_req, res) => {
    const modelOnline = Array.from(connectedPeers.values()).some(
      (p) => p.isAdmin
    );
    const modelInRoom = Array.from(roomParticipants.values()).some(
      (p) => p.isAdmin
    );
    const publicQueue = buildQueueSummaryForUser(null);
    res.json({
      ok: true,
      roomId: MAIN_ROOM_ID,
      modelOnline,
      modelInRoom,
      roomParticipantCount: roomParticipants.size,
      activePeersCount: connectedPeers.size,
      totalWaiting: publicQueue.totalWaiting,
      estimatedWaitSeconds: publicQueue.totalEstimatedWaitSeconds,
    });
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
            inCallWith: roomParticipants.has(uid) ? `room:${MAIN_ROOM_ID}` : null,
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
          ws.send(
            JSON.stringify({
              type: 'room:sync',
              roomId: MAIN_ROOM_ID,
              participants: serializeRoomParticipants(),
            })
          );
          ws.send(
            JSON.stringify({
              type: 'queue:sync',
              summary: buildQueueSummaryForUser(uid),
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
          const roomRec = roomParticipants.get(sender.uid);
          if (roomRec) {
            roomRec.accessStatus = data.accessStatus;
            broadcastRoomSync();
          }
        }
        broadcastPresence();
        return;
      }

      if (msgType === 'room:join') {
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

        const participant: RoomParticipantRecord = {
          uid: sender.uid,
          displayName: sender.displayName,
          photoUrl: sender.photoUrl,
          role: sender.role,
          accessStatus: sender.accessStatus,
          isAdmin: sender.isAdmin,
          joinedAt: new Date().toISOString(),
          ...(typeof data.callId === 'string' && data.callId
            ? { callId: data.callId.slice(0, 128) }
            : {}),
          ...(typeof data.planId === 'string' && data.planId
            ? { planId: data.planId.slice(0, 128) }
            : {}),
          ...(typeof data.planName === 'string' && data.planName
            ? { planName: data.planName.slice(0, 80) }
            : {}),
          ...(typeof data.planDurationMinutes === 'number'
            ? { planDurationMinutes: data.planDurationMinutes }
            : {}),
          ...(typeof data.planPriceCents === 'number'
            ? { planPriceCents: data.planPriceCents }
            : {}),
        };

        const alreadyInRoom = roomParticipants.has(sender.uid);
        roomParticipants.set(sender.uid, participant);
        sender.inCallWith = `room:${MAIN_ROOM_ID}`;

        broadcastRoomSync();
        if (!alreadyInRoom) {
          notifyRoomParticipantsAndAdmins(sender.uid, {
            type: 'room:peer_joined',
            roomId: MAIN_ROOM_ID,
            participant,
          });
        }
        broadcastPresence();
        return;
      }

      if (msgType === 'room:leave') {
        const departed = roomParticipants.get(sender.uid);
        if (departed) {
          roomParticipants.delete(sender.uid);
        }
        if (sender.inCallWith === `room:${MAIN_ROOM_ID}`) {
          sender.inCallWith = null;
        }
        broadcastRoomSync();
        if (departed) {
          notifyRoomParticipantsAndAdmins(sender.uid, {
            type: 'room:peer_left',
            roomId: MAIN_ROOM_ID,
            participant: departed,
          });
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
          const callId =
            typeof data.callId === 'string' && data.callId
              ? data.callId.slice(0, 128)
              : `call_${Date.now()}`;
          const durationMinutes =
            typeof data.planDurationMinutes === 'number' &&
            data.planDurationMinutes > 0
              ? data.planDurationMinutes
              : 15;
          activeCallEstimate = {
            callId,
            startedAtMs: Date.now(),
            durationMinutes,
          };
          visitorQueueEntries.delete(sender.uid);
          visitorQueueEntries.delete(targetUid);
          broadcastPresence();
          broadcastQueueSync();
        } else if (msgType === 'call:end' || msgType === 'call:reject') {
          if (sender.inCallWith !== `room:${MAIN_ROOM_ID}`) {
            sender.inCallWith = null;
          }
          const target = connectedPeers.get(targetUid);
          if (target && target.inCallWith === sender.uid) {
            target.inCallWith = null;
          }
          if (
            activeCallEstimate &&
            (typeof data.callId !== 'string' ||
              !data.callId ||
              activeCallEstimate.callId === data.callId)
          ) {
            activeCallEstimate = null;
          }
          broadcastPresence();
          broadcastQueueSync();
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

      if (msgType === 'queue:entry') {
        const status = typeof data.status === 'string' ? data.status : 'idle';
        if (status === 'waiting') {
          const callId =
            typeof data.callId === 'string' && data.callId
              ? data.callId.slice(0, 128)
              : `wait_${sender.uid}`;
          const planDurationMinutes =
            typeof data.planDurationMinutes === 'number' &&
            data.planDurationMinutes > 0
              ? Math.min(240, Math.round(data.planDurationMinutes))
              : 10;
          const createdAtMs =
            typeof data.createdAtMs === 'number' && data.createdAtMs > 0
              ? data.createdAtMs
              : Date.now();

          visitorQueueEntries.set(sender.uid, {
            callId,
            uid: sender.uid,
            planDurationMinutes,
            createdAtMs,
          });
          if (hasAuthoritativeQueue) {
            const idx = authoritativeWaitingQueue.findIndex(
              (item) => item.uid === sender.uid
            );
            const nextEntry = {
              callId,
              uid: sender.uid,
              planDurationMinutes,
              createdAtMs,
            };
            if (idx >= 0) {
              authoritativeWaitingQueue[idx] = nextEntry;
            } else {
              authoritativeWaitingQueue.push(nextEntry);
            }
          }
        } else {
          visitorQueueEntries.delete(sender.uid);
          if (hasAuthoritativeQueue) {
            authoritativeWaitingQueue = authoritativeWaitingQueue.filter(
              (item) => item.uid !== sender.uid
            );
          }
        }
        broadcastQueueSync();
        return;
      }

      if (msgType === 'queue:authoritative_sync') {
        if (!sender.isAdmin) return;
        const rawEntries = Array.isArray(data.waiting) ? data.waiting : [];
        authoritativeWaitingQueue = rawEntries
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>).uid === 'string' &&
              typeof (item as Record<string, unknown>).callId === 'string'
          )
          .slice(0, 100)
          .map((item) => ({
            callId: String(item.callId).slice(0, 128),
            uid: String(item.uid).slice(0, 128),
            planDurationMinutes:
              typeof item.planDurationMinutes === 'number' &&
              item.planDurationMinutes > 0
                ? Math.min(240, Math.round(item.planDurationMinutes))
                : 10,
            createdAtMs:
              typeof item.createdAtMs === 'number' && item.createdAtMs > 0
                ? item.createdAtMs
                : Date.now(),
          }));
        hasAuthoritativeQueue = true;

        const rawActive =
          data.activeCall && typeof data.activeCall === 'object'
            ? (data.activeCall as Record<string, unknown>)
            : null;
        if (
          rawActive &&
          typeof rawActive.callId === 'string' &&
          rawActive.callId
        ) {
          const callId = rawActive.callId.slice(0, 128);
          const durationMinutes =
            typeof rawActive.durationMinutes === 'number' &&
            rawActive.durationMinutes > 0
              ? Math.min(240, Math.round(rawActive.durationMinutes))
              : 15;
          const startedAtMs =
            typeof rawActive.startedAtMs === 'number' &&
            rawActive.startedAtMs > 0
              ? rawActive.startedAtMs
              : activeCallEstimate?.callId === callId
                ? activeCallEstimate.startedAtMs
                : Date.now();
          activeCallEstimate = {
            callId,
            durationMinutes,
            startedAtMs,
          };
        } else {
          activeCallEstimate = null;
        }

        broadcastQueueSync();
        return;
      }

      // Real-Time Model / Admin User Control Commands
      if (msgType === 'moderation:command') {
        if (!sender.isAdmin) return;
        const targetUid = typeof data.targetUid === 'string' ? data.targetUid : '';
        const action = typeof data.action === 'string' ? data.action : '';
        if (!targetUid || !action) return;

        const target = connectedPeers.get(targetUid);
        const departedRoomPeer =
          action === 'block' || action === 'kick_call'
            ? roomParticipants.get(targetUid)
            : undefined;

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

        const roomTarget = roomParticipants.get(targetUid);
        if (roomTarget) {
          if (action === 'mute') roomTarget.accessStatus = 'muted';
          if (action === 'unmute') roomTarget.accessStatus = 'active';
          if (action === 'vip') roomTarget.accessStatus = 'vip';
        }

        if (departedRoomPeer) {
          roomParticipants.delete(targetUid);
          notifyRoomParticipantsAndAdmins(targetUid, {
            type: 'room:peer_left',
            roomId: MAIN_ROOM_ID,
            participant: departedRoomPeer,
          });
        }

        sendToUser(targetUid, {
          type: 'moderation:effect',
          action,
          byUid: sender.uid,
          byName: sender.displayName,
          reason: typeof data.reason === 'string' ? data.reason : '',
        });
        broadcastRoomSync();
        broadcastPresence();
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (authenticatedUid) {
        const current = connectedPeers.get(authenticatedUid);
        if (current && current.ws === ws) {
          const departedRoomPeer = roomParticipants.get(authenticatedUid);
          if (departedRoomPeer) {
            roomParticipants.delete(authenticatedUid);
          }

          if (
            current.inCallWith &&
            current.inCallWith !== `room:${MAIN_ROOM_ID}`
          ) {
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
          visitorQueueEntries.delete(authenticatedUid);
          if (current.isAdmin && connectedPeers.size === 0) {
            hasAuthoritativeQueue = false;
            authoritativeWaitingQueue = [];
            activeCallEstimate = null;
          }
          if (departedRoomPeer) {
            broadcastRoomSync();
            notifyRoomParticipantsAndAdmins(authenticatedUid, {
              type: 'room:peer_left',
              roomId: MAIN_ROOM_ID,
              participant: departedRoomPeer,
            });
          }
          broadcastPresence();
          broadcastQueueSync();
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
