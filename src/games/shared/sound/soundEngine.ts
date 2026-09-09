/**
 * Most sound effects are synthesized at runtime via the Web Audio API — no audio
 * files. The one exception is the reel-spin loop, which plays a recorded sample
 * from /public/Sound. The AudioContext is created lazily on first use — background
 * music's first use is the loading screen's onDone (not a user gesture), so it's created
 * suspended; `resumeAudio()` (called synchronously from a real click handler, e.g. SPIN)
 * is what actually unlocks playback, satisfying browsers' autoplay-requires-gesture policy.
 */

// Overall volume for everything (SFX + music) — the single knob to turn the whole game up/down.
const MASTER_VOLUME = 1;

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

function getContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = MASTER_VOLUME;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

/** Resumes (or lazily creates) the shared AudioContext. Must be called synchronously from
 * within a real click/tap handler, before any `await` — background music now starts from
 * the loading screen's onDone (a setTimeout, not a gesture), so the very first AudioContext
 * creation happens outside a user gesture and browsers leave it suspended until something
 * like this resumes it from an actual click. */
export function resumeAudio(): void {
  getContext();
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (masterGain) masterGain.gain.value = muted ? 0 : MASTER_VOLUME;
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/** A single synthesized note with a short attack and exponential decay. */
function tone(freq: number, startTime: number, duration: number, type: OscillatorType, peakGain: number): void {
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(masterGain!);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

function playSequence(notes: number[], gap: number, duration: number, type: OscillatorType, peakGain: number): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  notes.forEach((freq, i) => tone(freq, t + i * gap, duration, type, peakGain));
}

// --- Reel spin loop (recorded sample, used only while reels are spinning) --
// Each game can pass its own track (and an optional trim so only a short lead-in segment of a
// longer recording loops, e.g. Crystal Clover uses just the first 0.4s of its sample) — same
// per-URL caching pattern as background music below, keyed by url+trim so the same file can be
// cached both trimmed and untrimmed if different games ever want different slices of it.

const DEFAULT_REEL_SPIN_SOUND_URL = "/Sound/mixkit-arcade-slot-machine-wheel-1933.wav";
const reelSpinBufferCache = new Map<string, AudioBuffer>();
const reelSpinBufferPromiseCache = new Map<string, Promise<AudioBuffer>>();

/** Copies just the first `endSeconds` of `buffer` into a new, shorter AudioBuffer — used to
 * loop only a lead-in slice of a longer recording instead of the whole file. */
function trimBuffer(ctx: AudioContext, buffer: AudioBuffer, endSeconds: number): AudioBuffer {
  const frameCount = Math.max(1, Math.min(buffer.length, Math.round(endSeconds * buffer.sampleRate)));
  const trimmed = ctx.createBuffer(buffer.numberOfChannels, frameCount, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    trimmed.copyToChannel(buffer.getChannelData(channel).subarray(0, frameCount), channel);
  }
  return trimmed;
}

function loadReelSpinBuffer(ctx: AudioContext, url: string, trimEndSeconds?: number): Promise<AudioBuffer> {
  const cacheKey = trimEndSeconds ? `${url}#${trimEndSeconds}` : url;
  const cached = reelSpinBufferCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  let promise = reelSpinBufferPromiseCache.get(cacheKey);
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => (trimEndSeconds ? trimBuffer(ctx, buffer, trimEndSeconds) : buffer))
      .then((buffer) => {
        reelSpinBufferCache.set(cacheKey, buffer);
        return buffer;
      });
    reelSpinBufferPromiseCache.set(cacheKey, promise);
  }
  return promise;
}

let spinLoopSource: AudioBufferSourceNode | null = null;
// Bumped on every start/stop so a slow-to-decode load from a previous call
// can't start playback after a newer stop (or a newer start superseded it).
let spinLoopToken = 0;

/** `trimEndSeconds`, if given, loops only the first N seconds of `url` instead of the whole
 * file — pass a short lead-in slice of a longer recording for a tighter, more rhythmic loop. */
export function startReelSpinLoop(url: string = DEFAULT_REEL_SPIN_SOUND_URL, trimEndSeconds?: number): void {
  stopReelSpinLoop();
  const token = ++spinLoopToken;
  if (muted) return;
  const ctx = getContext();

  loadReelSpinBuffer(ctx, url, trimEndSeconds).then((buffer) => {
    if (token !== spinLoopToken || muted) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.5;

    source.connect(gain);
    gain.connect(masterGain!);
    source.start();
    spinLoopSource = source;
  });
}

export function stopReelSpinLoop(): void {
  spinLoopToken++;
  if (!spinLoopSource) return;
  try {
    spinLoopSource.stop();
  } catch {
    /* already stopped */
  }
  spinLoopSource.disconnect();
  spinLoopSource = null;
}

// --- Background music (looped from game mount until the player leaves) -----
// Each game passes its own track URL (see games/<Game>/pixi or the game component's
// MUSIC_URL constant) so every game can have distinct background music. Decoded buffers
// are cached per-URL so switching games/re-mounting doesn't re-fetch/re-decode a track
// that's already been loaded once this session.

// BGM volume relative to MASTER_VOLUME above — this is the knob to turn the music itself up/down
// without affecting SFX. Effective loudness is MUSIC_VOLUME * MASTER_VOLUME.
const MUSIC_VOLUME = 0.3;

let musicGain: GainNode | null = null;
const musicBufferCache = new Map<string, AudioBuffer>();
const musicBufferPromiseCache = new Map<string, Promise<AudioBuffer>>();
let musicSource: AudioBufferSourceNode | null = null;
let musicToken = 0;

function loadMusicBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = musicBufferCache.get(url);
  if (cached) return Promise.resolve(cached);
  let promise = musicBufferPromiseCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        musicBufferCache.set(url, buffer);
        return buffer;
      });
    musicBufferPromiseCache.set(url, promise);
  }
  return promise;
}

/**
 * Starts (or restarts, with a different track) the looping background music. Unlike the
 * one-shot SFX, this keeps running even while muted — muting only zeroes masterGain — so
 * unmuting later doesn't require the track to be reloaded/restarted.
 */
export function startBackgroundMusic(url: string): void {
  stopBackgroundMusic();
  const token = ++musicToken;
  const ctx = getContext();

  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(masterGain!);
  }

  loadMusicBuffer(ctx, url).then((buffer) => {
    if (token !== musicToken) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain!);
    source.start();
    musicSource = source;
  });
}

export function stopBackgroundMusic(): void {
  musicToken++;
  if (!musicSource) return;
  try {
    musicSource.stop();
  } catch {
    /* already stopped */
  }
  musicSource.disconnect();
  musicSource = null;
}

// --- One-shot effects -------------------------------------------------------

/** Short mechanical "clunk" as an individual reel lands. */
export function playReelStop(): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  tone(140, t, 0.1, "square", 0.22);
  tone(85, t, 0.16, "sine", 0.18);
}

/** Synthesized single kick-drum-style hit — a punchier, more "drum beat" feel than the generic
 * mechanical playReelStop clunk above. A sine oscillator sweeps quickly from a higher pitch down
 * to a low thump (the classic synthesized-kick technique) under a fast amplitude decay. */
export function playDrumBeat(): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.7, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain);
  gain.connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.25);
}

/** Small/regular win chime (no celebration tier). */
export function playWinChime(): void {
  playSequence([523, 659, 784], 0.09, 0.25, "triangle", 0.25);
}

/** Distinct jingle when free spins are awarded or retriggered. */
export function playFreeSpinsJingle(): void {
  playSequence([784, 988, 1175, 1568], 0.12, 0.3, "square", 0.2);
}

/** Bigger fanfare for tiered wins, scaling with tier. */
export function playCelebration(tier: "BIG WIN" | "MEGA WIN" | "JACKPOT"): void {
  const sequences: Record<typeof tier, number[]> = {
    "BIG WIN": [523, 659, 784, 1047],
    "MEGA WIN": [523, 659, 784, 1047, 1319, 1047, 1319],
    JACKPOT: [392, 523, 659, 784, 1047, 1319, 1568, 2093],
  };
  playSequence(sequences[tier], 0.11, 0.35, "triangle", 0.3);
}
