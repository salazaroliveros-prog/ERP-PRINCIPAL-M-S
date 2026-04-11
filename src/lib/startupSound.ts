export type StartupSoundId =
  | 'glass-soft'
  | 'digital-bloom'
  | 'neo-click'
  | 'ambient-pulse'
  | 'quartz-bell'
  | 'none';

export const STARTUP_SOUND_STORAGE_KEY = 'startup-sound';

export const STARTUP_SOUND_OPTIONS: Array<{ id: StartupSoundId; label: string; description: string }> = [
  { id: 'glass-soft', label: 'Glass Soft', description: 'Campanita de cristal fina y corta.' },
  { id: 'digital-bloom', label: 'Digital Bloom', description: 'Tono digital suave con subida ligera.' },
  { id: 'neo-click', label: 'Neo Click', description: 'Click limpio y minimalista con brillo corto.' },
  { id: 'ambient-pulse', label: 'Ambient Pulse', description: 'Pulso envolvente elegante y discreto.' },
  { id: 'quartz-bell', label: 'Quartz Bell', description: 'Campana breve estilo interfaz corporativa.' },
  { id: 'none', label: 'Sin sonido', description: 'No reproducir audio de inicio.' },
];

type Tone = {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

const PRESETS: Record<Exclude<StartupSoundId, 'none'>, Tone[]> = {
  'glass-soft': [
    { frequency: 880, start: 0, duration: 0.2, gain: 0.08, type: 'sine' },
    { frequency: 1320, start: 0.06, duration: 0.18, gain: 0.06, type: 'triangle' },
  ],
  'digital-bloom': [
    { frequency: 520, start: 0, duration: 0.16, gain: 0.07, type: 'triangle' },
    { frequency: 740, start: 0.08, duration: 0.2, gain: 0.08, type: 'sine' },
    { frequency: 980, start: 0.16, duration: 0.2, gain: 0.06, type: 'sine' },
  ],
  'neo-click': [
    { frequency: 1120, start: 0, duration: 0.08, gain: 0.08, type: 'square' },
    { frequency: 1560, start: 0.05, duration: 0.08, gain: 0.05, type: 'triangle' },
  ],
  'ambient-pulse': [
    { frequency: 320, start: 0, duration: 0.24, gain: 0.08, type: 'sine' },
    { frequency: 410, start: 0.12, duration: 0.24, gain: 0.07, type: 'sine' },
  ],
  'quartz-bell': [
    { frequency: 698, start: 0, duration: 0.18, gain: 0.08, type: 'triangle' },
    { frequency: 1046, start: 0.04, duration: 0.2, gain: 0.06, type: 'sine' },
    { frequency: 1396, start: 0.1, duration: 0.16, gain: 0.04, type: 'sine' },
  ],
};

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }
  return sharedAudioContext;
}

function scheduleTone(ctx: AudioContext, destination: AudioNode, tone: Tone, anchorTime: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const startTime = anchorTime + tone.start;
  const endTime = startTime + tone.duration;

  osc.type = tone.type || 'sine';
  osc.frequency.setValueAtTime(tone.frequency, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain), startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(startTime);
  osc.stop(endTime + 0.01);
}

export async function playStartupSound(soundId: StartupSoundId) {
  if (soundId === 'none') return false;
  const preset = PRESETS[soundId];
  if (!preset) return false;

  const ctx = getAudioContext();
  if (!ctx) return false;

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return false;
    }
  }

  const now = ctx.currentTime;
  preset.forEach((tone) => scheduleTone(ctx, ctx.destination, tone, now));
  return true;
}

export function getSavedStartupSound(): StartupSoundId {
  if (typeof window === 'undefined') return 'glass-soft';
  const saved = localStorage.getItem(STARTUP_SOUND_STORAGE_KEY) as StartupSoundId | null;
  if (!saved) return 'glass-soft';
  return STARTUP_SOUND_OPTIONS.some((option) => option.id === saved) ? saved : 'glass-soft';
}
