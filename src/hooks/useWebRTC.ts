import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SignalPayload } from './useWebSocketStudio';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface UseWebRTCOptions {
  sendWs: (payload: Record<string, unknown>) => boolean;
}

export function useWebRTC({ sendWs }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [peerConnectionStates, setPeerConnectionStates] = useState<
    Record<string, RTCPeerConnectionState>
  >({});
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [mediaStatus, setMediaStatus] = useState<
    'idle' | 'requesting' | 'ready' | 'audio_only' | 'unavailable'
  >('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsMapRef = useRef<Map<string, MediaStream>>(new Map());
  const pendingIceMapRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const inFlightOffersRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);

  const connectionState: RTCPeerConnectionState = useMemo(() => {
    const states = Object.values(peerConnectionStates);
    if (states.length === 0) return 'new';
    if (states.some((s) => s === 'connected')) return 'connected';
    if (states.some((s) => s === 'connecting')) return 'connecting';
    if (states.some((s) => s === 'failed')) return 'failed';
    if (states.every((s) => s === 'closed')) return 'closed';
    return states[0];
  }, [peerConnectionStates]);

  const remoteStream = useMemo(() => {
    const first = Object.values(remoteStreams)[0];
    return first || null;
  }, [remoteStreams]);

  // Call duration timer
  useEffect(() => {
    if (connectionState !== 'connected') {
      if (connectionState === 'new' || connectionState === 'closed') {
        setElapsedSeconds(0);
      }
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connectionState]);

  const acquireLocalMedia = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    setMediaStatus('requesting');
    setMediaError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: true,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicEnabled(true);
      setCamEnabled(true);
      setMediaStatus('ready');
      return stream;
    } catch {
      // Fallback to audio-only if camera is unavailable
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setMicEnabled(true);
        setCamEnabled(false);
        setMediaStatus('audio_only');
        setMediaError(
          'Câmera não detectada ou sem permissão. Modo apenas áudio ativo.'
        );
        return audioStream;
      } catch {
        setMediaStatus('unavailable');
        setCamEnabled(false);
        setMicEnabled(false);
        setMediaError(
          'Câmera e microfone indisponíveis neste navegador. Você ainda pode receber o vídeo da sala e usar o chat.'
        );
        return null;
      }
    }
  }, []);

  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
      setLocalStream(null);
      setMediaStatus('idle');
    }
  }, []);

  const syncStreamsState = useCallback(() => {
    setRemoteStreams(Object.fromEntries(remoteStreamsMapRef.current.entries()));
  }, []);

  const closeSinglePeer = useCallback(
    (targetUid: string) => {
      const pc = pcsRef.current.get(targetUid);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
        pcsRef.current.delete(targetUid);
      }
      pendingIceMapRef.current.delete(targetUid);
      inFlightOffersRef.current.delete(targetUid);
      remoteStreamsMapRef.current.delete(targetUid);
      syncStreamsState();
      setPeerConnectionStates((prev) => {
        if (!(targetUid in prev)) return prev;
        const next = { ...prev };
        delete next[targetUid];
        return next;
      });
    },
    [syncStreamsState]
  );

  const closePeerConnection = useCallback(
    (targetUid?: string) => {
      if (targetUid) {
        closeSinglePeer(targetUid);
        return;
      }
      for (const uid of Array.from(pcsRef.current.keys())) {
        const pc = pcsRef.current.get(uid);
        if (pc) {
          pc.onicecandidate = null;
          pc.ontrack = null;
          pc.onconnectionstatechange = null;
          pc.close();
        }
      }
      pcsRef.current.clear();
      pendingIceMapRef.current.clear();
      inFlightOffersRef.current.clear();
      remoteStreamsMapRef.current.clear();
      setRemoteStreams({});
      setPeerConnectionStates({});
      setElapsedSeconds(0);
    },
    [closeSinglePeer]
  );

  const createPeerConnection = useCallback(
    async (targetUid: string, callId: string, singleMode = true) => {
      if (singleMode) {
        closePeerConnection();
      } else {
        closeSinglePeer(targetUid);
      }

      setPeerConnectionStates((prev) => ({
        ...prev,
        [targetUid]: 'connecting',
      }));

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current.set(targetUid, pc);

      const stream = await acquireLocalMedia();
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
        }
      } else {
        // Ensure receive-only transceivers exist so offer/answer negotiates video/audio cleanly
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }

      const inboundStream = new MediaStream();
      remoteStreamsMapRef.current.set(targetUid, inboundStream);
      syncStreamsState();

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStreamsMapRef.current.set(targetUid, event.streams[0]);
          syncStreamsState();
        } else {
          inboundStream.addTrack(event.track);
          remoteStreamsMapRef.current.set(targetUid, inboundStream);
          syncStreamsState();
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendWs({
            type: 'webrtc:ice',
            targetUid,
            callId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerConnectionStates((prev) => ({
          ...prev,
          [targetUid]: pc.connectionState,
        }));
      };

      return pc;
    },
    [acquireLocalMedia, closePeerConnection, closeSinglePeer, sendWs, syncStreamsState]
  );

  const startCallOffer = useCallback(
    async (
      targetUid: string,
      callId: string,
      options?: { singleMode?: boolean }
    ) => {
      const singleMode = options?.singleMode ?? callId !== 'main_studio_room';
      inFlightOffersRef.current.add(targetUid);
      try {
        const pc = await createPeerConnection(targetUid, callId, singleMode);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendWs({
          type: 'webrtc:offer',
          targetUid,
          callId,
          sdp: offer,
        });
      } finally {
        inFlightOffersRef.current.delete(targetUid);
      }
    },
    [createPeerConnection, sendWs]
  );

  const syncMeshPeers = useCallback(
    async (myUid: string, participantUids: string[], callId: string) => {
      const desired = new Set(participantUids.filter((uid) => uid !== myUid));

      for (const existingUid of Array.from(pcsRef.current.keys())) {
        if (!desired.has(existingUid)) {
          closeSinglePeer(existingUid);
        }
      }

      for (const targetUid of desired) {
        if (
          !pcsRef.current.has(targetUid) &&
          !inFlightOffersRef.current.has(targetUid) &&
          myUid < targetUid
        ) {
          await startCallOffer(targetUid, callId, { singleMode: false });
        }
      }
    },
    [closeSinglePeer, startCallOffer]
  );

  const handleSignal = useCallback(
    async (signal: SignalPayload) => {
      const peerUid = signal.fromUid;
      if (!peerUid) return;

      if (signal.type === 'webrtc:offer' && signal.sdp) {
        const callId = signal.callId || 'active';
        const singleMode = callId !== 'main_studio_room';
        const pc = await createPeerConnection(peerUid, callId, singleMode);
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const queuedIce = pendingIceMapRef.current.get(peerUid) || [];
        for (const ice of queuedIce) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        pendingIceMapRef.current.delete(peerUid);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs({
          type: 'webrtc:answer',
          targetUid: peerUid,
          callId,
          sdp: answer,
        });
      } else if (signal.type === 'webrtc:answer' && signal.sdp) {
        const pc = pcsRef.current.get(peerUid);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const queuedIce = pendingIceMapRef.current.get(peerUid) || [];
        for (const ice of queuedIce) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        pendingIceMapRef.current.delete(peerUid);
      } else if (signal.type === 'webrtc:ice' && signal.candidate) {
        const pc = pcsRef.current.get(peerUid);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          const prev = pendingIceMapRef.current.get(peerUid) || [];
          prev.push(signal.candidate);
          pendingIceMapRef.current.set(peerUid, prev);
        }
      } else if (signal.type === 'call:end' || signal.type === 'call:reject') {
        closeSinglePeer(peerUid);
      }
    },
    [closeSinglePeer, createPeerConnection, sendWs]
  );

  const toggleMic = useCallback(
    (forceState?: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) {
        setMicEnabled(false);
        return;
      }
      const next = forceState !== undefined ? forceState : !micEnabled;
      for (const track of stream.getAudioTracks()) {
        track.enabled = next;
      }
      setMicEnabled(next);
    },
    [micEnabled]
  );

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      setCamEnabled(false);
      return;
    }
    const next = !camEnabled;
    for (const track of stream.getVideoTracks()) {
      track.enabled = next;
    }
    setCamEnabled(next);
  }, [camEnabled]);

  useEffect(() => {
    return () => {
      closePeerConnection();
      stopLocalMedia();
    };
  }, [closePeerConnection, stopLocalMedia]);

  return {
    localStream,
    remoteStream,
    remoteStreams,
    peerConnectionStates,
    micEnabled,
    camEnabled,
    mediaStatus,
    mediaError,
    connectionState,
    elapsedSeconds,
    acquireLocalMedia,
    stopLocalMedia,
    startCallOffer,
    syncMeshPeers,
    handleSignal,
    closePeerConnection,
    toggleMic,
    toggleCam,
  };
}
