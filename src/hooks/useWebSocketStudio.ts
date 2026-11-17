import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type {
  PresencePeer,
  RoomParticipant,
  StudioProfile,
} from '../types/studio';

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
  profile: StudioProfile | null;
  onSignal: (signal: SignalPayload) => void;
  onModerationEffect: (effect: ModerationEffect) => void;
  onPresenceEvent?: (event: PresenceEvent) => void;
  onRoomEvent?: (event: RoomEvent) => void;
}

export function useWebSocketStudio({
  user,
  profile,
  onSignal,
  onModerationEffect,
  onPresenceEvent,
  onRoomEvent,
}: UseWebSocketStudioOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>(
    []
  );
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const hasInitialPresenceRef = useRef(false);
  const previousPeersRef = useRef<Map<string, PresencePeer>>(new Map());

  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  const onModerationRef = useRef(onModerationEffect);
  onModerationRef.current = onModerationEffect;

  const onPresenceEventRef = useRef(onPresenceEvent);
  onPresenceEventRef.current = onPresenceEvent;

  const onRoomEventRef = useRef(onRoomEvent);
  onRoomEventRef.current = onRoomEvent;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    if (!user) {
      setWsConnected(false);
      setPeers([]);
      setRoomParticipants([]);
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
          const token = await user.getIdToken();
          const p = profileRef.current;
          socket.send(
            JSON.stringify({
              type: 'auth',
              token,
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
          setWsConnected(true);
          return;
        }
        if (type === 'presence:sync' && Array.isArray(data.peers)) {
          const nextPeers = data.peers as PresencePeer[];
          const nextMap = new Map<string, PresencePeer>();
          for (const p of nextPeers) {
            nextMap.set(p.uid, p);
          }

          if (hasInitialPresenceRef.current && onPresenceEventRef.current) {
            const prevMap = previousPeersRef.current;
            for (const p of nextPeers) {
              if (p.uid !== user.uid && !prevMap.has(p.uid)) {
                onPresenceEventRef.current({ kind: 'joined', peer: p });
              }
            }
            for (const [prevUid, prevPeer] of prevMap.entries()) {
              if (prevUid !== user.uid && !nextMap.has(prevUid)) {
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
        if (type === 'room:peer_joined' && data.participant) {
          onRoomEventRef.current?.({
            kind: 'peer_joined',
            roomId: typeof data.roomId === 'string' ? data.roomId : 'main_studio_room',
            participant: data.participant as RoomParticipant,
          });
          return;
        }
        if (type === 'room:peer_left' && data.participant) {
          onRoomEventRef.current?.({
            kind: 'peer_left',
            roomId: typeof data.roomId === 'string' ? data.roomId : 'main_studio_room',
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
  }, [user]);

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
        roomId: meta?.roomId || 'main_studio_room',
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
    (roomId = 'main_studio_room') => {
      return sendWs({
        type: 'room:leave',
        roomId,
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

  return {
    wsConnected,
    peers,
    roomParticipants,
    sendWs,
    joinRoom,
    leaveRoom,
    sendModerationCommand,
  };
}
