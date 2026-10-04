// World layout. All coordinates are world pixels, rects are top-left based.
export const WORLD_W = 7200;
export const WORLD_H = 2600;

export type ZoneId = 'foundry' | 'plaza' | 'docks' | 'gardens';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Solid extends Rect { kind: 'ground' | 'ice' | 'wall' | 'roof' | 'metal'; zone?: ZoneId; angle?: number; hidden?: boolean }

export interface ZoneDef { id: ZoneId; name: string; sub: string; rect: Rect; color: string; sky: [string, string]; }

export const ZONES: ZoneDef[] = [
  { id: 'gardens', name: 'Sky Gardens', sub: 'Where the old beacon sleeps', rect: { x: 1800, y: 0, w: 3400, h: 1260 }, color: '#b48cff', sky: ['#1b1036', '#3b1f5e'] },
  { id: 'foundry', name: 'The Foundry', sub: 'Furnaces cold, gates sealed', rect: { x: 0, y: 1260, w: 2200, h: 1340 }, color: '#ffae42', sky: ['#1d0f0a', '#4a2412'] },
  { id: 'plaza', name: 'Aether Plaza', sub: 'Heart of the city', rect: { x: 2200, y: 1260, w: 2200, h: 1340 }, color: '#3ff0d0', sky: ['#06141f', '#0f3a4a'] },
  { id: 'docks', name: 'Frozen Docks', sub: 'The harbor iced over in the surge', rect: { x: 4400, y: 1260, w: 2800, h: 1340 }, color: '#8fd8ff', sky: ['#07101f', '#1c3b66'] },
];

const G = 2200; // main ground top

export const SOLIDS: Solid[] = [
  // world shell
  { x: -100, y: -100, w: 160, h: WORLD_H + 200, kind: 'wall' },
  { x: WORLD_W - 60, y: -100, w: 160, h: WORLD_H + 200, kind: 'wall' },
  { x: -100, y: -100, w: WORLD_W + 200, h: 140, kind: 'wall' },

  // ---------- FOUNDRY ----------
  { x: 60, y: G, w: 2140, h: 400, kind: 'ground', zone: 'foundry' },
  { x: 60, y: 1880, w: 500, h: 80, kind: 'roof', zone: 'foundry' },        // furnace roof
  { x: 60, y: 1260, w: 120, h: 620, kind: 'metal', zone: 'foundry' },      // furnace back wall
  { x: 1330, y: 1990, w: 200, h: 40, kind: 'metal', zone: 'foundry' },     // crate shelf
  { x: 1560, y: 1900, w: 260, h: 300, kind: 'metal', zone: 'foundry' },    // tall stack (shard on top via crate step)
  { x: 1650, y: 1720, w: 170, h: 40, kind: 'metal', zone: 'foundry' },     // iron block ledge (above stack)
  { x: 1960, y: 1520, w: 200, h: 40, kind: 'metal', zone: 'foundry' },     // chimney ledge
  { x: 2060, y: 1060, w: 100, h: 460, kind: 'metal', zone: 'foundry' },    // chimney
  { x: 640, y: 1500, w: 240, h: 36, kind: 'metal', zone: 'foundry' },      // catwalk

  // ---------- PLAZA ----------
  { x: 2200, y: G, w: 2200, h: 400, kind: 'ground', zone: 'plaza' },
  { x: 2380, y: 1880, w: 240, h: 40, kind: 'roof', zone: 'plaza' },        // rooftop R1
  { x: 2380, y: 1920, w: 30, h: 280, kind: 'metal', zone: 'plaza' },
  { x: 2590, y: 1920, w: 30, h: 280, kind: 'metal', zone: 'plaza' },
  { x: 2900, y: 1620, w: 200, h: 40, kind: 'roof', zone: 'plaza' },        // rooftop R2
  { x: 3820, y: 1500, w: 120, h: 700, kind: 'metal', zone: 'plaza' },      // clock tower
  { x: 3560, y: 1840, w: 160, h: 36, kind: 'roof', zone: 'plaza' },        // awning by tower
  { x: 4120, y: 1700, w: 200, h: 40, kind: 'roof', zone: 'plaza' },        // east rooftop

  // ---------- DOCKS ----------
  { x: 4400, y: G, w: 750, h: 400, kind: 'ground', zone: 'docks' },
  { x: 4760, y: 2080, w: 140, h: 120, kind: 'metal', zone: 'docks' },      // step
  { x: 4900, y: 1950, w: 250, h: 250, kind: 'metal', zone: 'docks' },      // ledge (iron crate)
  { x: 5150, y: G, w: 750, h: 400, kind: 'ice', zone: 'docks' },           // ice floor
  { x: 5108, y: 2074, w: 520, h: 40, kind: 'ice', zone: 'docks', angle: 0.5 }, // ice ramp
  { x: 5860, y: 40, w: 200, h: 1660, kind: 'wall', zone: 'docks' },        // sea cliff above wall
  { x: 5960, y: G, w: 200, h: 400, kind: 'ground', zone: 'docks' },        // landing behind wall
  { x: 6160, y: 2330, w: 1000, h: 270, kind: 'ground', zone: 'docks', hidden: true }, // harbor bed
  { x: 6300, y: 2060, w: 150, h: 30, kind: 'metal', zone: 'docks' },       // pier P1
  { x: 6620, y: 1960, w: 150, h: 30, kind: 'metal', zone: 'docks' },       // pier P2
  { x: 6920, y: 2010, w: 220, h: 30, kind: 'metal', zone: 'docks' },       // pier P3
  { x: 6340, y: 2090, w: 20, h: 260, kind: 'metal', zone: 'docks' },
  { x: 6680, y: 1990, w: 20, h: 360, kind: 'metal', zone: 'docks' },
  { x: 7020, y: 2040, w: 20, h: 310, kind: 'metal', zone: 'docks' },
  { x: 4520, y: 1800, w: 200, h: 36, kind: 'roof', zone: 'docks' },        // warehouse roof

  // ---------- SKY GARDENS ----------
  { x: 1900, y: 950, w: 1200, h: 60, kind: 'ground', zone: 'gardens' },    // west terrace
  { x: 3500, y: 950, w: 1500, h: 60, kind: 'ground', zone: 'gardens' },    // east terrace
  { x: 3660, y: 720, w: 90, h: 230, kind: 'metal', zone: 'gardens' },      // beacon tower
  { x: 2180, y: 480, w: 200, h: 30, kind: 'ground', zone: 'gardens' },     // floating isle
  { x: 4480, y: 640, w: 200, h: 30, kind: 'ground', zone: 'gardens' },     // east spire ledge
  { x: 4630, y: 670, w: 50, h: 280, kind: 'metal', zone: 'gardens' },
  { x: 3190, y: 300, w: 220, h: 30, kind: 'metal', zone: 'gardens' },      // Spire Crown (final)
];

export interface AnchorDef { x: number; y: number }
export const ANCHORS: AnchorDef[] = [
  // foundry
  { x: 420, y: 1640 }, { x: 760, y: 1360 }, { x: 1150, y: 1640 }, { x: 1500, y: 1500 }, { x: 1820, y: 1180 }, { x: 1250, y: 1300 },
  // plaza
  { x: 2500, y: 1560 }, { x: 2800, y: 1380 }, { x: 3220, y: 1300 }, { x: 3600, y: 1360 }, { x: 4000, y: 1300 }, { x: 3060, y: 1080 }, { x: 4250, y: 1250 },
  // plaza → gardens climb
  { x: 3290, y: 760 }, { x: 3360, y: 1030 }, { x: 3570, y: 820 }, { x: 3030, y: 820 }, { x: 5120, y: 1220 }, { x: 5180, y: 780 }, { x: 1780, y: 820 },
  // docks
  { x: 4700, y: 1560 }, { x: 5050, y: 1560 }, { x: 5420, y: 1600 }, { x: 6360, y: 1680 }, { x: 6680, y: 1620 }, { x: 6980, y: 1660 }, { x: 6180, y: 1780 }, { x: 6520, y: 1800 },
  // gardens
  { x: 2100, y: 700 }, { x: 2520, y: 640 }, { x: 3880, y: 620 }, { x: 4300, y: 450 }, { x: 2900, y: 640 }, { x: 2420, y: 330 },
];

export interface ShardDef { id: string; x: number; y: number; hint: string }
export const SHARDS: ShardDef[] = [
  { id: 's1', x: 2470, y: 2150, hint: 'Under the plaza rooftop' },
  { id: 's2', x: 3880, y: 1450, hint: 'Atop the clock tower — swing up' },
  { id: 's3', x: 2005, y: 1480, hint: 'Foundry chimney ledge — spring pad + tether' },
  { id: 's4', x: 1690, y: 1860, hint: 'Top of the Foundry stack — use a crate as a step' },
  { id: 's5', x: 6530, y: 2210, hint: 'Skimming the harbor — dip low on a swing' },
  { id: 's6', x: 6830, y: 1650, hint: 'High above the pier — build momentum' },
  { id: 's7', x: 2280, y: 430, hint: 'Floating isle — slingshot or ride an Aether Surge' },
  { id: 's8', x: 4580, y: 590, hint: 'East spire ledge — climb with the tether' },
];

export interface CheckpointDef { id: string; x: number; y: number; zone: ZoneId }
export const CHECKPOINTS: CheckpointDef[] = [
  { id: 'cp_plaza', x: 2720, y: G, zone: 'plaza' },
  { id: 'cp_foundry', x: 1240, y: G, zone: 'foundry' },
  { id: 'cp_docks', x: 4560, y: G, zone: 'docks' },
  { id: 'cp_pier', x: 6060, y: G, zone: 'docks' },
  { id: 'cp_gardens', x: 2500, y: 950, zone: 'gardens' },
  { id: 'cp_gardens_e', x: 4100, y: 950, zone: 'gardens' },
];

export interface SignDef { x: number; y: number; text: string }
export const SIGNS: SignDef[] = [
  { x: 2300, y: G, text: '◀ FOUNDRY' },
  { x: 4300, y: G, text: 'DOCKS ▶' },
  { x: 3060, y: G, text: '▲ GARDENS (spring + swing)' },
  { x: 700, y: G, text: 'COUNTERWEIGHT PAN' },
  { x: 5000, y: 1950, text: 'ICE — NO GRIP' },
  { x: 2780, y: 950, text: 'SPRING LAUNCHER' },
];

export interface NpcDef { id: string; name: string; x: number; y: number; color: string; lines: string[] }
export const NPCS: NpcDef[] = [
  { id: 'mayor', name: 'Mayor Ilse', x: 2930, y: G, color: '#3ff0d0', lines: [
    'Thank the stars, a web-slinger! The surge shattered the Aether Core.',
    'Three Aether Fragments are lost: the Foundry, the Frozen Docks and the Sky Gardens. Go in any order.',
    'Bring all three back to the Core. Press J any time to check your journal.',
  ] },
  { id: 'smith', name: 'Forgehand Bo', x: 1000, y: G, color: '#ffae42', lines: [
    'The furnace gate is tied to that counterweight pan by a pulley.',
    'The gate weighs as much as three crates. Load the pan heavier than that and it lifts. Iron counts double!',
  ] },
  { id: 'dockhand', name: 'Dockhand Rue', x: 4640, y: G, color: '#8fd8ff', lines: [
    'The seawall cracked but never broke, and the fragment is stuck behind it.',
    'It needs a heavy hit with real momentum. That wrecking ball would do it... or anything heavy sliding fast across the ice.',
  ] },
  { id: 'gardener', name: 'Gardener Pell', x: 2380, y: 950, color: '#b48cff', lines: [
    'The beacon brazier on that tower needs the Aether Orb.',
    'The spring launcher throws it in an arc. Set the compression with E, then stomp the pad. Or just carry it over, if you are brave.',
  ] },
];

// interactive props
export interface CrateDef { id: string; x: number; y: number; size: number; type: 'light' | 'iron'; zone: ZoneId }
export const CRATES: CrateDef[] = [
  { id: 'c1', x: 1100, y: G - 30, size: 60, type: 'light', zone: 'foundry' },
  { id: 'c2', x: 1180, y: G - 30, size: 60, type: 'light', zone: 'foundry' },
  { id: 'c3', x: 1420, y: 1960, size: 60, type: 'light', zone: 'foundry' },
  { id: 'iron1', x: 1740, y: 1685, size: 70, type: 'iron', zone: 'foundry' },
  { id: 'iron2', x: 5060, y: 1915, size: 70, type: 'iron', zone: 'docks' },
  { id: 'c4', x: 3500, y: G - 30, size: 60, type: 'light', zone: 'plaza' },
];

export const QUEST_GEOM = {
  pan: { x: 700, y: 2170, w: 200, h: 30 },          // counterweight pan (top surface)
  gate: { x: 520, y: 1960, w: 40, h: 240 },         // furnace gate (closed)
  fragA: { x: 300, y: 2140 },
  ballPivot: { x: 5700, y: 1500 }, ballLen: 360, ballR: 46,
  seawall: { x: 5900, y: 1700, w: 60, h: 500 },
  fragB: { x: 7060, y: 1950 },
  launcher: { x: 2800, y: 930, w: 110, h: 20 },     // spring launcher plate
  stomp: { x: 2960, y: 935, w: 60, h: 15 },
  orbHome: { x: 2700, y: 900 },
  brazier: { x: 3705, y: 690, w: 100 },             // basket centre
  core: { x: 3460, y: G },
  lift: { x: 3420, y: 230, w: 80, h: 1970 },
  crown: { x: 3300, y: 300 },
  springPads: [ { x: 1880, y: G, power: 27 }, { x: 3180, y: G, power: 25 } ],
  waterY: 2250, waterX: 6160,
};

export const PLAYER_START = { x: 2650, y: G - 40 };
