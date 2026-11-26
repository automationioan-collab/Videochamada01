import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  PresencePeer,
  QueueWaitSummary,
  RoomParticipant,
  StudioProfile,
} from '../types/studio';

const EMPTY_QUEUE_SUMMARY: QueueWaitSummary = {
  totalWaiting: 0,
  myPosition: 0,
  aheadCount: 0,
  activeCallRemainingSeconds: 0,
  aheadQueueSeconds: 0,
  totalEstimatedWaitSeconds: 0,
  updatedAtMs: 0,
};

export interface SignalPayload {
  type:
    | 'call:ring'
    | 'call:accept'
    | 'call:reject'
    | 'call:end'
    | 'webrtc:offer'
    | 'webrtc:answer'
    | 'webrtc:ice';
  fromUid: string;
  fromName?: string;
  fromPhotoUrl?: string;
  fromRole?: string;
  targetUid: string;
  callId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  reason?: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
}

export interface ModerationEffect {
  action: 'mute' | 'unmute' | 'block' | 'unblock' | 'vip' | 'kick_call';
  byUid?: string;
  byName?: string;
  reason?: string;
}

export interface PresenceEvent {
  kind: 'joined' | 'left';
  peer: PresencePeer;
}

export interface RoomEvent {
  kind: 'peer_joined' | 'peer_left';
  roomId: string;
  participant: RoomParticipant;
}

interface UseWebSocketStudioOptions {
  user: User | null;
  modelToken: string | null;
  modelAuthId: string | null;
  selectedModelId: string;
  profile: StudioProfile | null;
  onSignal: (signal: SignalPayload) => void;
  onModerationEffect: (effect: ModerationEffect) => void;
  onPresenceEvent?: (event: PresenceEvent) => void;
  onRoomEvent?: (event: RoomEvent) => void;
  onStudioRefresh?: (modelId: string) => void;
  onModelsRefresh?: () => void;
}

export function useWebSocketStudio({
  user,
  modelToken,
  modelAuthId,
  selectedModelId,
  profile,
  onSignal,
  onModerationEffect,
  onPresenceEvent,
  onRoomEvent,
  onStudioRefresh,
  onModelsRefresh,
}: UseWebSocketStudioOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsActorUid, setWsActorUid] = useState<string | null>(null);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>(
    []
  );
  const [queueSummary, setQueueSummary] =
    useState<QueueWaitSummary>(EMPTY_QUEUE_SUMMARY);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const hasInitialPresenceRef = useRef(false);
  const previousPeersRef = useRef<Map<string, PresencePeer>>(new Map());
  const selfActorUidRef = useRef<string | null>(null);

  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  const onModerationRef = useRef(onModerationEffect);
  onModerationRef.current = onModerationEffect;

  const onPresenceEventRef = useRef(onPresenceEvent);
  onPresenceEventRef.current = onPresenceEvent;

  const onRoomEventRef = useRef(onRoomEvent);
  onRoomEventRef.current = onRoomEvent;

  const onStudioRefreshRef = useRef(onStudioRefresh);
  onStudioRefreshRef.current = onStudioRefresh;

  const onModelsRefreshRef = useRef(onModelsRefresh);
  onModelsRefreshRef.current = onModelsRefresh;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const selectedModelIdRef = useRef(selectedModelId);
  selectedModelIdRef.current = selectedModelId;

  useEffect(() => {
    const hasAuth = Boolean(modelToken || user);
    if (!hasAuth) {
      setWsConnected(false);
      setWsActorUid(null);
      selfActorUidRef.current = null;
      setPeers([]);
      setRoomParticipants([]);
      setQueueSummary(EMPTY_QUEUE_SUMMARY);
      hasInitialPresenceRef.current = false;
      previousPeersRef.current = new Map();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let disposed = false;
    let retryMs = 1000;

    const connect = async () => {
      if (disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = async () => {
        if (disposed) {
          socket.close();
          return;
        }
        try {
          const p = profileRef.current;
          if (modelToken) {
            socket.send(
              JSON.stringify({
                type: 'auth',
                authMode: 'model_session',
                token: modelToken,
                modelId: modelAuthId || selectedModelIdRef.current,
              })
            );
          } else if (user) {
            const token = await user.getIdToken();
            socket.send(
              JSON.stringify({
                type: 'auth',
                authMode: 'firebase',
                token,
                modelId: selectedModelIdRef.current,
                profile: p
                  ? {
                      displayName: p.displayName,
                      photoUrl: p.photoUrl || '',
                      accessStatus: p.accessStatus,
                    }
                  : {
                      displayName: user.displayName || 'Participante',
                      photoUrl: user.photoURL || '',
                    },
              })
            );
          }
          retryMs = 1000;

          if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
          heartbeatRef.current = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        } catch (err) {
          console.error('Erro ao autenticar WebSocket:', err);
        }
      };

      socket.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = data.type as string;
        if (type === 'auth:ok') {
          hasInitialPresenceRef.current = false;
          const uid = typeof data.uid === 'string' ? data.uid : null;
          selfActorUidRef.current = uid;
          setWsActorUid(uid);
          setWsConnected(true);
          return;
        }
        if (type === 'studio:refresh') {
          const mid =
            typeof data.modelId === 'string'
              ? data.modelId
              : selectedModelIdRef.current;
          onStudioRefreshRef.current?.(mid);
          return;
        }
        if (type === 'models:refresh') {
          onModelsRefreshRef.current?.();
          return;
        }
        if (type === 'presence:sync' && Array.isArray(data.peers)) {
          const nextPeers = data.peers as PresencePeer[];
          const nextMap = new Map<string, PresencePeer>();
          for (const p of nextPeers) {
            nextMap.set(p.uid, p);
          }

          const mySelfUid = selfActorUidRef.current || user?.uid || '';
          if (hasInitialPresenceRef.current && onPresenceEventRef.current) {
            const prevMap = previousPeersRef.current;
            for (const p of nextPeers) {
              if (p.uid !== mySelfUid && !prevMap.has(p.uid)) {
                onPresenceEventRef.current({ kind: 'joined', peer: p });
              }
            }
            for (const [prevUid, prevPeer] of prevMap.entries()) {
              if (prevUid !== mySelfUid && !nextMap.has(prevUid)) {
                onPresenceEventRef.current({ kind: 'left', peer: prevPeer });
              }
            }
          }

          previousPeersRef.current = nextMap;
          hasInitialPresenceRef.current = true;
          setPeers(nextPeers);
          return;
        }
        if (type === 'room:sync' && Array.isArray(data.participants)) {
          setRoomParticipants(data.participants as RoomParticipant[]);
          return;
        }
        if (
          type === 'queue:sync' &&
          data.summary &&
          typeof data.summary === 'object'
        ) {
          setQueueSummary(data.summary as QueueWaitSummary);
          return;
        }
        if (type === 'room:peer_joined' && data.participant) {
          onRoomEventRef.current?.({
            kind: 'peer_joined',
            roomId:
              typeof data.roomId === 'string'
                ? data.roomId
                : `room_${selectedModelIdRef.current}`,
            participant: data.participant as RoomParticipant,
          });
          return;
        }
        if (type === 'room:peer_left' && data.participant) {
          onRoomEventRef.current?.({
            kind: 'peer_left',
            roomId:
              typeof data.roomId === 'string'
                ? data.roomId
                : `room_${selectedModelIdRef.current}`,
            participant: data.participant as RoomParticipant,
          });
          return;
        }
        if (
          type === 'call:ring' ||
          type === 'call:accept' ||
          type === 'call:reject' ||
          type === 'call:end' ||
          type === 'webrtc:offer' ||
          type === 'webrtc:answer' ||
          type === 'webrtc:ice'
        ) {
          onSignalRef.current(data as unknown as SignalPayload);
          return;
        }
        if (type === 'moderation:effect') {
          onModerationRef.current(data as unknown as ModerationEffect);
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        setRoomParticipants([]);
        hasInitialPresenceRef.current = false;
        if (heartbeatRef.current) {
          window.clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        if (!disposed) {
          const delay = Math.min(retryMs, 10000);
          retryMs = Math.min(retryMs * 2, 10000);
          reconnectTimerRef.current = window.setTimeout(() => {
            void connect();
          }, delay);
        }
      };
    };

    void connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, modelToken, modelAuthId]);

  // Switch active visitor model room over open WebSocket
  useEffect(() => {
    if (modelToken) return;
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && selectedModelId) {
      hasInitialPresenceRef.current = false;
      previousPeersRef.current = new Map();
      socket.send(
        JSON.stringify({
          type: 'model:select',
          modelId: selectedModelId,
        })
      );
    }
  }, [modelToken, selectedModelId]);

  // Sync accessStatus changes to WebSocket presence when profile updates
  useEffect(() => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && profile) {
      socket.send(
        JSON.stringify({
          type: 'presence:update',
          accessStatus: profile.accessStatus,
        })
      );
    }
  }, [profile?.accessStatus]);

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const joinRoom = useCallback(
    (meta?: {
      roomId?: string;
      callId?: string;
      planId?: string;
      planName?: string;
      planDurationMinutes?: number;
      planPriceCents?: number;
    }) => {
      return sendWs({
        type: 'room:join',
        roomId: meta?.roomId || `room_${selectedModelIdRef.current}`,
        ...(meta?.callId ? { callId: meta.callId } : {}),
        ...(meta?.planId ? { planId: meta.planId } : {}),
        ...(meta?.planName ? { planName: meta.planName } : {}),
        ...(meta?.planDurationMinutes
          ? { planDurationMinutes: meta.planDurationMinutes }
          : {}),
        ...(meta?.planPriceCents !== undefined
          ? { planPriceCents: meta.planPriceCents }
          : {}),
      });
    },
    [sendWs]
  );

  const leaveRoom = useCallback(
    (roomId?: string) => {
      return sendWs({
        type: 'room:leave',
        roomId: roomId || `room_${selectedModelIdRef.current}`,
      });
    },
    [sendWs]
  );

  const sendModerationCommand = useCallback(
    (
      targetUid: string,
      action: ModerationEffect['action'],
      reason = ''
    ) => {
      return sendWs({
        type: 'moderation:command',
        targetUid,
        action,
        reason,
      });
    },
    [sendWs]
  );

  const syncQueueEntry = useCallback(
    (entry: {
      status: 'waiting' | 'idle';
      callId?: string;
      planDurationMinutes?: number;
      createdAtMs?: number;
      isVip?: boolean;
    }) => {
      return sendWs({
        type: 'queue:entry',
        status: entry.status,
        ...(entry.callId ? { callId: entry.callId } : {}),
        ...(entry.planDurationMinutes
          ? { planDurationMinutes: entry.planDurationMinutes }
          : {}),
        ...(entry.createdAtMs ? { createdAtMs: entry.createdAtMs } : {}),
        ...(typeof entry.isVip === 'boolean' ? { isVip: entry.isVip } : {}),
      });
    },
    [sendWs]
  );

  const syncAuthoritativeQueue = useCallback(
    (payload: {
      waiting: Array<{
        callId: string;
        uid: string;
        planDurationMinutes: number;
        createdAtMs: number;
        isVip?: boolean;
      }>;
      activeCall: {
        callId: string;
        durationMinutes: number;
        startedAtMs?: number;
      } | null;
    }) => {
      return sendWs({
        type: 'queue:authoritative_sync',
        waiting: payload.waiting,
        activeCall: payload.activeCall,
      });
    },
    [sendWs]
  );

  return {
    wsConnected,
    wsActorUid,
    peers,
    roomParticipants,
    queueSummary,
    sendWs,
    joinRoom,
    leaveRoom,
    sendModerationCommand,
    syncQueueEntry,
    syncAuthoritativeQueue,
  };
}
