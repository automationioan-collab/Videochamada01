import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [mediaStatus, setMediaStatus] = useState<
    'idle' | 'requesting' | 'ready' | 'audio_only' | 'unavailable'
  >('idle');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState>('new');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteTargetUidRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

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

  const closePeerConnection = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingIceRef.current = [];
    remoteTargetUidRef.current = null;
    setRemoteStream(null);
    setConnectionState('closed');
    setElapsedSeconds(0);
  }, []);

  const createPeerConnection = useCallback(
    async (targetUid: string, callId: string) => {
      closePeerConnection();
      remoteTargetUidRef.current = targetUid;
      setConnectionState('connecting');

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

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
      setRemoteStream(inboundStream);

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          inboundStream.addTrack(event.track);
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
        setConnectionState(pc.connectionState);
      };

      return pc;
    },
    [acquireLocalMedia, closePeerConnection, sendWs]
  );

  const startCallOffer = useCallback(
    async (targetUid: string, callId: string) => {
      const pc = await createPeerConnection(targetUid, callId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendWs({
        type: 'webrtc:offer',
        targetUid,
        callId,
        sdp: offer,
      });
    },
    [createPeerConnection, sendWs]
  );

  const handleSignal = useCallback(
    async (signal: SignalPayload) => {
      if (signal.type === 'webrtc:offer' && signal.sdp) {
        const pc = await createPeerConnection(
          signal.fromUid,
          signal.callId || 'active'
        );
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        for (const ice of pendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        pendingIceRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendWs({
          type: 'webrtc:answer',
          targetUid: signal.fromUid,
          callId: signal.callId,
          sdp: answer,
        });
      } else if (signal.type === 'webrtc:answer' && signal.sdp) {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        for (const ice of pendingIceRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(ice));
        }
        pendingIceRef.current = [];
      } else if (signal.type === 'webrtc:ice' && signal.candidate) {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingIceRef.current.push(signal.candidate);
        }
      } else if (signal.type === 'call:end' || signal.type === 'call:reject') {
        closePeerConnection();
      }
    },
    [closePeerConnection, createPeerConnection, sendWs]
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
    micEnabled,
    camEnabled,
    mediaStatus,
    mediaError,
    connectionState,
    elapsedSeconds,
    acquireLocalMedia,
    stopLocalMedia,
    startCallOffer,
    handleSignal,
    closePeerConnection,
    toggleMic,
    toggleCam,
  };
}
