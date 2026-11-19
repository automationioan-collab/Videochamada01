const SOUND_STORAGE_KEY = 'maison_aura_sound_enabled';

let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;

export type NotificationSoundKind = 'user_joined' | 'incoming_call' | 'test';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new Ctor();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isAudioSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const saved = window.localStorage.getItem(SOUND_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function setAudioSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore storage access restrictions in embedded iframes
  }
}

export function unlockAudioContext(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      // Autoplay blocked until next user gesture
    });
  }
}

function scheduleTone(
  ctx: AudioContext,
  startAt: number,
  frequency: number,
  duration: number,
  peakGain: number,
  type: OscillatorType = 'sine'
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

export function playNotificationDing(
  kind: NotificationSoundKind,
  forcePlay = false
): void {
  if (!forcePlay && !isAudioSoundEnabled()) return;

  const nowMs = Date.now();
  if (!forcePlay && nowMs - lastPlayedAt < 550) {
    return;
  }
  lastPlayedAt = nowMs;

  const ctx = getAudioContext();
  if (!ctx) return;

  const triggerChime = () => {
    const t0 = ctx.currentTime + 0.01;
    if (kind === 'user_joined') {
      // Crisp crystalline ascending chime (E5 -> B5)
      scheduleTone(ctx, t0, 659.25, 0.38, 0.16, 'sine');
      scheduleTone(ctx, t0 + 0.09, 987.77, 0.5, 0.14, 'triangle');
      return;
    }

    if (kind === 'incoming_call') {
      // Clear two-step double bell ding (B5/E6 -> D6/G6)
      scheduleTone(ctx, t0, 987.77, 0.28, 0.18, 'sine');
      scheduleTone(ctx, t0, 1318.51, 0.34, 0.12, 'triangle');
      scheduleTone(ctx, t0 + 0.18, 1174.66, 0.36, 0.18, 'sine');
      scheduleTone(ctx, t0 + 0.18, 1567.98, 0.45, 0.12, 'triangle');
      return;
    }

    // Test chime (A5 -> E6)
    scheduleTone(ctx, t0, 880, 0.32, 0.16, 'sine');
    scheduleTone(ctx, t0 + 0.1, 1318.51, 0.45, 0.14, 'triangle');
  };

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        triggerChime();
      })
      .catch(() => {
        // Ignore browser autoplay lock before gesture
      });
  } else {
    triggerChime();
  }
}
