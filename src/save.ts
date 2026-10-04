// Local save / settings with versioning + validation. Invalid data never crashes the game.
export const SAVE_KEY = 'echoes.save.v1';
export const SETTINGS_KEY = 'echoes.settings.v1';
export const SAVE_VERSION = 1;

export type QuestState = 'locked' | 'active' | 'done';
export interface SaveData {
  version: number;
  shards: string[];
  quests: { A: QuestState; B: QuestState; C: QuestState; F: QuestState };
  checkpoint: string;
  coreRestored: boolean;
  ended: boolean;
  introSeen: boolean;
  talked: string[];
  playTime: number;
  respawns: number;
  savedAt: number;
}

export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'tether', 'slingshot', 'grab', 'throw', 'respawn', 'journal', 'pause', 'debug'] as const;
export type Action = typeof ACTIONS[number];

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  tether: ['KeyK', 'ShiftLeft'],
  slingshot: ['KeyC', 'KeyL'],
  grab: ['KeyE'],
  throw: ['KeyQ'],
  respawn: ['KeyR'],
  journal: ['KeyJ', 'Tab'],
  pause: ['Escape', 'KeyP'],
  debug: ['F3', 'Backquote'],
};

export interface Settings {
  master: number; music: number; sfx: number; muted: boolean;
  reducedMotion: boolean; highContrast: boolean; textScale: number;
  fpsCap: 0 | 30 | 60; surges: boolean; debug: boolean; aimAssist: boolean;
  bindings: Record<Action, string[]>;
}

export function defaultSettings(): Settings {
  const prefersReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    master: 0.8, music: 0.5, sfx: 0.8, muted: false,
    reducedMotion: prefersReduced, highContrast: false, textScale: 1,
    fpsCap: 0, surges: true, debug: false, aimAssist: true,
    bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  };
}

export function newSave(): SaveData {
  return {
    version: SAVE_VERSION, shards: [], quests: { A: 'active', B: 'active', C: 'active', F: 'locked' },
    checkpoint: 'cp_plaza', coreRestored: false, ended: false, introSeen: false, talked: [],
    playTime: 0, respawns: 0, savedAt: Date.now(),
  };
}

const QS = ['locked', 'active', 'done'];
function isStrArr(v: unknown): v is string[] { return Array.isArray(v) && v.every(s => typeof s === 'string'); }

export function validateSave(d: any, validShards: string[], validCps: string[]): SaveData | null {
  if (!d || typeof d !== 'object' || d.version !== SAVE_VERSION) return null;
  if (!isStrArr(d.shards) || !d.shards.every((s: string) => validShards.includes(s))) return null;
  if (!d.quests || typeof d.quests !== 'object') return null;
  for (const k of ['A', 'B', 'C', 'F']) if (!QS.includes(d.quests[k])) return null;
  if (typeof d.checkpoint !== 'string' || !validCps.includes(d.checkpoint)) return null;
  if (typeof d.coreRestored !== 'boolean' || typeof d.ended !== 'boolean' || typeof d.introSeen !== 'boolean') return null;
  if (!isStrArr(d.talked)) return null;
  if (typeof d.playTime !== 'number' || !isFinite(d.playTime) || d.playTime < 0) return null;
  if (typeof d.respawns !== 'number' || !isFinite(d.respawns)) return null;
  // logical consistency: final can only be unlocked after A, B, C
  const core = d.quests.A === 'done' && d.quests.B === 'done' && d.quests.C === 'done';
  if (!core && (d.quests.F !== 'locked' || d.coreRestored || d.ended)) return null;
  return { ...newSave(), ...d, shards: [...new Set<string>(d.shards)] };
}

export type LoadResult = { status: 'none' } | { status: 'ok'; data: SaveData } | { status: 'invalid' };

export function loadSave(validShards: string[], validCps: string[]): LoadResult {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return { status: 'none' }; }
  if (raw == null) return { status: 'none' };
  try {
    const parsed = JSON.parse(raw);
    const v = validateSave(parsed, validShards, validCps);
    return v ? { status: 'ok', data: v } : { status: 'invalid' };
  } catch { return { status: 'invalid' }; }
}

export function writeSave(d: SaveData): boolean {
  try { d.savedAt = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(d)); return true; } catch { return false; }
}
export function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

export function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object') return def;
    const out: Settings = { ...def };
    for (const k of ['master', 'music', 'sfx', 'textScale'] as const) if (typeof s[k] === 'number' && isFinite(s[k])) out[k] = s[k];
    for (const k of ['muted', 'reducedMotion', 'highContrast', 'surges', 'debug', 'aimAssist'] as const) if (typeof s[k] === 'boolean') out[k] = s[k];
    if ([0, 30, 60].includes(s.fpsCap)) out.fpsCap = s.fpsCap;
    out.textScale = Math.min(1.6, Math.max(0.8, out.textScale));
    if (s.bindings && typeof s.bindings === 'object') {
      for (const a of ACTIONS) if (isStrArr(s.bindings[a]) && s.bindings[a].length) out.bindings[a] = s.bindings[a].slice(0, 3);
    }
    return out;
  } catch { return def; }
}
export function writeSettings(s: Settings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
