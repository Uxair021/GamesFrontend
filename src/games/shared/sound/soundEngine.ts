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
  // Speech doesn't route through masterGain (it's a separate browser subsystem, not part of
  // this WebAudio graph) — mute has to reach it explicitly or a muted player would still hear
  // an offer announced mid-sentence.
  if (muted) cancelSpeech();
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

// --- Bonus alarm loop (recorded sample — Top Dollar's DOLLAR-symbol bonus trigger) ---------
// A real recording (a school bell) instead of a synthesized tone, looped from a trimmed middle
// slice of the source file (0.5s-2.0s — the source's opening ring is faint, so the loop starts
// past it) rather than the whole file, and played louder than the reel-spin loop's own gain
// since this needs to read as loud and unmissable, per user request.

const BONUS_ALARM_SOUND_URL = "/Sound/universfield-school-bell-199584.mp3";
const BONUS_ALARM_SLICE_START_SECONDS = 0.5;
const BONUS_ALARM_SLICE_END_SECONDS = 2;
const BONUS_ALARM_GAIN = 0.9;

const bonusAlarmBufferCache = new Map<string, AudioBuffer>();
const bonusAlarmBufferPromiseCache = new Map<string, Promise<AudioBuffer>>();

/** Copies the `[startSeconds, endSeconds)` slice of `buffer` into a new, shorter AudioBuffer —
 * unlike trimBuffer above (which always starts at 0), this can skip a source recording's own
 * lead-in and loop just its clearest-sounding middle portion. */
function sliceBuffer(ctx: AudioContext, buffer: AudioBuffer, startSeconds: number, endSeconds: number): AudioBuffer {
  const startFrame = Math.max(0, Math.min(buffer.length, Math.round(startSeconds * buffer.sampleRate)));
  const endFrame = Math.max(startFrame + 1, Math.min(buffer.length, Math.round(endSeconds * buffer.sampleRate)));
  const sliced = ctx.createBuffer(buffer.numberOfChannels, endFrame - startFrame, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    sliced.copyToChannel(buffer.getChannelData(channel).subarray(startFrame, endFrame), channel);
  }
  return sliced;
}

function loadBonusAlarmBuffer(ctx: AudioContext): Promise<AudioBuffer> {
  const cached = bonusAlarmBufferCache.get(BONUS_ALARM_SOUND_URL);
  if (cached) return Promise.resolve(cached);
  let promise = bonusAlarmBufferPromiseCache.get(BONUS_ALARM_SOUND_URL);
  if (!promise) {
    promise = fetch(BONUS_ALARM_SOUND_URL)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => sliceBuffer(ctx, buffer, BONUS_ALARM_SLICE_START_SECONDS, BONUS_ALARM_SLICE_END_SECONDS))
      .then((buffer) => {
        bonusAlarmBufferCache.set(BONUS_ALARM_SOUND_URL, buffer);
        return buffer;
      });
    bonusAlarmBufferPromiseCache.set(BONUS_ALARM_SOUND_URL, promise);
  }
  return promise;
}

let bonusAlarmSource: AudioBufferSourceNode | null = null;
// Same start/stop race guard as spinLoopToken above.
let bonusAlarmToken = 0;

/** Top Dollar only — starts the DOLLAR bonus-trigger bell looping. Call stopBonusAlarmLoop()
 * once the bundle-selection chase begins (see TopDollarGame.tsx's runSpin). */
export function startBonusAlarmLoop(): void {
  stopBonusAlarmLoop();
  const token = ++bonusAlarmToken;
  if (muted) return;
  const ctx = getContext();

  loadBonusAlarmBuffer(ctx).then((buffer) => {
    if (token !== bonusAlarmToken || muted) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = BONUS_ALARM_GAIN;

    source.connect(gain);
    gain.connect(masterGain!);
    source.start();
    bonusAlarmSource = source;
  });
}

export function stopBonusAlarmLoop(): void {
  bonusAlarmToken++;
  if (!bonusAlarmSource) return;
  try {
    bonusAlarmSource.stop();
  } catch {
    /* already stopped */
  }
  bonusAlarmSource.disconnect();
  bonusAlarmSource = null;
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

function loadMusicBuffer(ctx: AudioContext, url: string, trimEndSeconds?: number): Promise<AudioBuffer> {
  const cacheKey = trimEndSeconds ? `${url}#${trimEndSeconds}` : url;
  const cached = musicBufferCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  let promise = musicBufferPromiseCache.get(cacheKey);
  if (!promise) {
    promise = fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => (trimEndSeconds ? trimBuffer(ctx, buffer, trimEndSeconds) : buffer))
      .then((buffer) => {
        musicBufferCache.set(cacheKey, buffer);
        return buffer;
      });
    musicBufferPromiseCache.set(cacheKey, promise);
  }
  return promise;
}

/** Kicks off fetching + decoding the background music buffer ahead of time, without playing it
 * — call this as early as possible (e.g. right when the game mounts), so the heavy fetch/decode/
 * trim work is already done by the time startBackgroundMusic() actually runs, instead of
 * competing with whatever's animating on screen at that exact moment (e.g. the top-screen-to-
 * base-game intro scroll, which is when startBackgroundMusic previously first got called —
 * confirmed with user: that first-time decode was landing mid-scroll and reading as a jerk/
 * hitch). loadMusicBuffer's own cache makes the later real call an instant hit either way. */
export function preloadBackgroundMusic(url: string, trimEndSeconds?: number): void {
  const ctx = getContext();
  loadMusicBuffer(ctx, url, trimEndSeconds).catch(() => {
    /* ignore — startBackgroundMusic will just retry the fetch/decode later */
  });
}

/**
 * Starts (or restarts, with a different track) the looping background music. Unlike the
 * one-shot SFX, this keeps running even while muted — muting only zeroes masterGain — so
 * unmuting later doesn't require the track to be reloaded/restarted.
 *
 * `trimEndSeconds`, if given, loops only the first N seconds of `url` — for cutting off dead air
 * at the tail of a recording (e.g. a fade-out that ends in true silence a beat before the file
 * itself ends) so the loop doesn't have an audible gap of silence before jumping back to the
 * start. Same trimBuffer helper the reel-spin loop above uses.
 */
export function startBackgroundMusic(url: string, trimEndSeconds?: number): void {
  stopBackgroundMusic();
  const token = ++musicToken;
  const ctx = getContext();

  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC_VOLUME;
    musicGain.connect(masterGain!);
  }

  loadMusicBuffer(ctx, url, trimEndSeconds).then((buffer) => {
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

/** A short burst of filtered white noise with an exponential decay — the raw material for a
 * physical "hit" sound (rattle, explosion) that a pure oscillator can't produce. */
function noiseBurst(startTime: number, duration: number, peakGain: number, lowpassFreq: number): void {
  const ctx = getContext();
  const frameCount = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpassFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peakGain, startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain!);
  noise.start(startTime);
  noise.stop(startTime + duration + 0.02);
}

/** Rattling clicks building in pitch — a gem/prop shaking in place before it "opens", with a
 * swelling low rumble underneath for physical weight (enhanced per user request — the plain
 * click sequence alone read as thin). */
export function playShakeRattle(): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  const clickCount = 9;
  for (let i = 0; i < clickCount; i++) {
    const progress = i / (clickCount - 1);
    const pitch = 160 + progress * 140 + Math.random() * 40; // climbs as the rattle builds
    tone(pitch, t + i * 0.055, 0.05, i % 2 === 0 ? "square" : "triangle", 0.16);
  }
  const rumble = ctx.createOscillator();
  const rumbleGain = ctx.createGain();
  rumble.type = "sine";
  rumble.frequency.setValueAtTime(55, t);
  rumble.frequency.linearRampToValueAtTime(70, t + 0.5);
  rumbleGain.gain.setValueAtTime(0.0001, t);
  rumbleGain.gain.linearRampToValueAtTime(0.18, t + 0.3);
  rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  rumble.connect(rumbleGain);
  rumbleGain.connect(masterGain!);
  rumble.start(t);
  rumble.stop(t + 0.6);
}

/** A punchy explosion/impact burst — noise + a low sine thump, topped with a bright ascending
 * sparkle arpeggio right after impact (enhanced per user request — reads as light glinting off
 * shattered gem facets instead of a plain generic "boom"). */
export function playBurst(): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  noiseBurst(t, 0.35, 0.55, 1400);
  tone(95, t, 0.3, "sine", 0.4);
  const sparkle = [1046, 1318, 1568, 2093];
  sparkle.forEach((freq, i) => tone(freq, t + 0.03 + i * 0.045, 0.22, "triangle", 0.16));
}

/** A pitch sweeping downward, layered with a quick descending "coin cascade" of blips — a
 * revealed value dropping down/away (e.g. into a credit meter), enhanced per user request so it
 * reads as coins tumbling down rather than a single plain tone sweep. */
export function playSweepDown(): void {
  if (muted) return;
  const ctx = getContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(180, t + 0.6);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.35, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
  osc.connect(gain);
  gain.connect(masterGain!);
  osc.start(t);
  osc.stop(t + 0.7);

  const cascade = [1568, 1318, 1046, 880, 698];
  cascade.forEach((freq, i) => tone(freq, t + 0.08 + i * 0.09, 0.12, "triangle", 0.14));
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

// --- Speech (Top Dollar's spoken offer announcements) -----------------------
// Uses the browser's own SpeechSynthesis API rather than an audio file or a paid TTS service —
// free, no asset to ship, and the amount it needs to say is a live number, not fixed text.
// Voices are loaded async by the browser (getVoices() often returns [] on first call, filling in
// only once the 'voiceschanged' event fires) so callers must await ensureVoicesLoaded() before
// picking one. This does NOT route through masterGain (it's a separate OS/browser subsystem, not
// part of the WebAudio graph above) — see setMuted's own cancelSpeech() call for how mute reaches
// it anyway, and see cancelSpeech's own doc comment for why every caller that can interrupt a
// line (Take It / Try Again) must call it explicitly too.

let voicesReadyPromise: Promise<void> | null = null;

function ensureVoicesLoaded(): Promise<void> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve();
  if (!voicesReadyPromise) {
    voicesReadyPromise = new Promise((resolve) => {
      if (speechSynthesis.getVoices().length > 0) {
        resolve();
        return;
      }
      const onVoicesChanged = () => {
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve();
      };
      speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
      // Some browsers never fire voiceschanged (or already had voices ready before this ran) —
      // don't let a caller hang forever waiting on one that isn't coming.
      setTimeout(resolve, 500);
    });
  }
  return voicesReadyPromise;
}

/** Picks the best available American-English voice — required to be en-US specifically (per
 * user request), preferring one whose name suggests a higher-quality "Natural"/neural engine
 * (Windows 11's newer online voices, Chrome/Edge's Google voices) over a generic robotic one,
 * since actual voice quality is entirely up to the player's own OS/browser and this is the only
 * lever available to bias toward the better-sounding option when more than one exists. */
function pickAmericanVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return undefined;

  const isUS = (v: SpeechSynthesisVoice) => v.lang === "en-US" || v.lang === "en_US";
  const pool = voices.filter(isUS);
  if (pool.length === 0) return voices.find((v) => v.lang.startsWith("en")) ?? voices[0];

  return (
    pool.find((v) => /natural|neural/i.test(v.name)) ??
    pool.find((v) => /google/i.test(v.name)) ??
    pool[0]
  );
}

/** Stops whatever offer line is currently being spoken, if any — call this the instant the
 * player acts (Take It / Try Again), whether by their own click or an automatic Take It (the
 * last offer auto-accepts), so the voice never keeps talking over a screen transition that's
 * already moved on. Safe to call when nothing is speaking. */
export function cancelSpeech(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/** Speaks `text` in American English, resolving once it finishes (or is cancelled/errors) —
 * await it only if the caller actually needs to know when the line ends; the Top Dollar offer
 * announcements themselves are fire-and-forget so the Take-It/Try-Again buttons are usable
 * immediately, not gated on the voice finishing. Cancels any line already in progress first, so
 * two calls in a row can never overlap. */
export function speak(text: string): Promise<void> {
  if (muted || typeof speechSynthesis === "undefined") return Promise.resolve();
  cancelSpeech();

  return ensureVoicesLoaded().then(
    () =>
      new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        const voice = pickAmericanVoice();
        if (voice) utterance.voice = voice;
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        speechSynthesis.speak(utterance);
      })
  );
}

