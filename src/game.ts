import Matter from 'matter-js';
import {
  WORLD_W, WORLD_H, ZONES, SOLIDS, ANCHORS, SHARDS, CHECKPOINTS, NPCS, CRATES, QUEST_GEOM as Q, PLAYER_START,
  type ZoneId, type NpcDef, type Rect,
} from './level';
import { type SaveData, type Settings, newSave, writeSave } from './save';
import type { Input } from './input';
import type { Audio } from './audio';

const { Engine, Bodies, Body, Composite, Constraint, Query, Events } = Matter;
type MBody = Matter.Body;

export const STEP_MS = 1000 / 60;
export const GRAVITY = 1.6;              // engine gravity (scale 0.001) => ~1600 px/s^2
const G_STEP = GRAVITY * 0.001 * STEP_MS * STEP_MS; // velocity gain per step (px/step^2)
const PW = 34, PH = 58;
const TETHER_RANGE = 500, TETHER_MIN = 45, TETHER_MAX = 540;
const RUN = 7.2, JUMP_V = 15.5;
const BREAK_MOMENTUM = 85;

export const CAT = { TERRAIN: 0x1, PLAYER: 0x2, PROP: 0x4, DEBRIS: 0x8 };

export interface Prop {
  id: string; body: MBody; home: { x: number; y: number }; zone: ZoneId;
  type: 'light' | 'iron' | 'orb' | 'ball'; weight: number; carryable: boolean; size: number; lostT: number;
}
export interface Target { x: number; y: number; body: MBody | null; prop?: Prop }
export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; g: number }
export interface Fragment { id: 'A' | 'B' | 'C'; x: number; y: number; taken: boolean; fly?: { t: number; sx: number; sy: number } }

export interface UiHooks {
  toast(msg: string, kind?: 'info' | 'good' | 'warn' | 'bad' | 'quest'): void;
  dialog(name: string, lines: string[], color: string): void;
  banner(title: string, sub: string, color: string): void;
  refresh(): void;
  ending(): void;
}

function approach(v: number, t: number, a: number) { return v < t ? Math.min(v + a, t) : Math.max(v - a, t); }
function inRect(x: number, y: number, r: Rect) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

export class Game {
  engine = Engine.create({ gravity: { x: 0, y: GRAVITY, scale: 0.001 }, positionIterations: 8, velocityIterations: 6 });
  player!: MBody;
  terrain: MBody[] = [];
  props: Prop[] = [];
  debris: { body: MBody; t: number }[] = [];
  gate!: MBody; pan!: MBody; seawall: MBody | null = null; launcher!: MBody; stomp!: MBody; ball!: Prop; orb!: Prop;
  ballChain!: Matter.Constraint;
  save: SaveData = newSave();
  // player state
  facing = 1; grounded = false; groundBody: MBody | null = null; groundKind = 'ground';
  coyote = 0; jumpBuf = 0; jumpCut = false; airTime = 0; landFx = 0; runPhase = 0;
  tether: { c: Matter.Constraint; x: number; y: number; body: MBody | null; prop?: Prop; len: number; charging: boolean; tension: number } | null = null;
  failFx: { x1: number; y1: number; x2: number; y2: number; t: number } | null = null;
  shootFx = 0;
  target: Target | null = null;
  carry: { prop: Prop; c: Matter.Constraint } | null = null;
  respawnHold = 0;
  // world state
  zone: ZoneId = 'plaza';
  time = 0;
  particles: Particle[] = [];
  shake = 0;
  panWeight = 0; panOffset = 0; gateRise = 0;
  launcherNotch = 2; launchCooldown = 0; stompPress = 0; wasOnStomp = false;
  springAnim: number[] = Q.springPads.map(() => 0);
  fragments: Fragment[] = [];
  beaconLit = false;
  activeCps = new Set<string>();
  surge = { next: 75, active: 0, warn: false };
  gravityScale = 1;
  cutscene: { kind: 'core'; t: number } | null = null;
  lockInput = 0;
  talkCooldown = new Map<string, number>();
  lastImpactToast = 0;
  stats = { swings: 0, maxSpeed: 0 };
  lastCheckpointToast = '';
  saveTimer = 0;
  paused = false;

  constructor(public input: Input, public audio: Audio, public settings: () => Settings, public ui: UiHooks) {
    this.buildWorld();
    Events.on(this.engine, 'collisionStart', ev => this.onCollide(ev));
  }

  // ---------------------------------------------------------------- world
  private buildWorld() {
    const W = this.engine.world;
    for (const s of SOLIDS) {
      const b = Bodies.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, {
        isStatic: true, label: s.kind, friction: s.kind === 'ice' ? 0 : 0.8, frictionStatic: s.kind === 'ice' ? 0 : 1,
        angle: s.angle ?? 0, collisionFilter: { category: CAT.TERRAIN, mask: 0xffff },
      });
      (b as any).meta = s;
      // Matter's setStatic forces friction = 1, so re-apply the surface friction afterwards
      b.friction = s.kind === 'ice' ? 0 : 0.8; b.frictionStatic = s.kind === 'ice' ? 0 : 1;
      this.terrain.push(b);
    }
    // quest statics
    this.gate = Bodies.rectangle(Q.gate.x + Q.gate.w / 2, Q.gate.y + Q.gate.h / 2, Q.gate.w, Q.gate.h, { isStatic: true, label: 'gate', friction: 0.5 });
    this.pan = Bodies.rectangle(Q.pan.x + Q.pan.w / 2, Q.pan.y + Q.pan.h / 2, Q.pan.w, Q.pan.h, { isStatic: true, label: 'pan', friction: 0.9 });
    this.seawall = Bodies.rectangle(Q.seawall.x + Q.seawall.w / 2, Q.seawall.y + Q.seawall.h / 2, Q.seawall.w, Q.seawall.h, { isStatic: true, label: 'seawall' });
    this.launcher = Bodies.rectangle(Q.launcher.x + Q.launcher.w / 2, Q.launcher.y + Q.launcher.h / 2, Q.launcher.w, Q.launcher.h, { isStatic: true, label: 'launcher', friction: 0.9 });
    this.stomp = Bodies.rectangle(Q.stomp.x + Q.stomp.w / 2, Q.stomp.y + Q.stomp.h / 2, Q.stomp.w, Q.stomp.h, { isStatic: true, label: 'stomp' });
    const bx = Q.brazier.x, cupTop = 668;
    const cupL = Bodies.rectangle(bx - Q.brazier.w / 2 + 6, cupTop + 26, 12, 52, { isStatic: true, label: 'cup' });
    const cupR = Bodies.rectangle(bx + Q.brazier.w / 2 - 6, cupTop + 26, 12, 52, { isStatic: true, label: 'cup' });
    for (const b of [this.gate, this.pan, this.seawall, this.launcher, this.stomp, cupL, cupR]) {
      b.collisionFilter = { category: CAT.TERRAIN, mask: 0xffff, group: 0 }; this.terrain.push(b);
    }
    Composite.add(W, this.terrain);

    // player
    this.player = Bodies.rectangle(PLAYER_START.x, PLAYER_START.y, PW, PH, {
      chamfer: { radius: 12 }, friction: 0, frictionStatic: 0, frictionAir: 0, restitution: 0, label: 'player',
      collisionFilter: { category: CAT.PLAYER, mask: 0xffff },
    });
    this.setPlayerMass(5);
    Composite.add(W, this.player);

    // props
    for (const c of CRATES) {
      const iron = c.type === 'iron';
      const b = Bodies.rectangle(c.x, c.y, c.size, c.size, {
        label: c.type, friction: iron ? 0.5 : 0.6, frictionStatic: 0, frictionAir: 0.005, restitution: 0.05, chamfer: { radius: 4 },
        collisionFilter: { category: CAT.PROP, mask: 0xffff },
      });
      Body.setMass(b, iron ? 9 : 3);
      Body.setInertia(b, iron ? Infinity : b.inertia * 2); // iron blocks never tumble: they slide predictably
      this.props.push({ id: c.id, body: b, home: { x: c.x, y: c.y }, zone: c.zone, type: c.type, weight: iron ? 2 : 1, carryable: !iron, size: c.size, lostT: 0 });
    }
    const orbB = Bodies.circle(Q.orbHome.x, Q.orbHome.y, 20, { label: 'orb', friction: 0.3, frictionAir: 0, restitution: 0.25, collisionFilter: { category: CAT.PROP, mask: 0xffff } });
    Body.setMass(orbB, 2);
    this.orb = { id: 'orb', body: orbB, home: { ...Q.orbHome }, zone: 'gardens', type: 'orb', weight: 0.5, carryable: true, size: 40, lostT: 0 };
    this.props.push(this.orb);
    const bp = Q.ballPivot;
    const ballB = Bodies.circle(bp.x, bp.y + Q.ballLen, Q.ballR, { label: 'ball', friction: 0.1, frictionAir: 0.0015, restitution: 0.1, collisionFilter: { category: CAT.PROP, mask: 0xffff } });
    Body.setMass(ballB, 25);
    this.ball = { id: 'ball', body: ballB, home: { x: bp.x, y: bp.y + Q.ballLen }, zone: 'docks', type: 'ball', weight: 5, carryable: false, size: Q.ballR * 2, lostT: 0 };
    this.props.push(this.ball);
    this.ballChain = Constraint.create({ pointA: { x: bp.x, y: bp.y }, bodyB: ballB, length: Q.ballLen, stiffness: 1, damping: 0 });
    Composite.add(W, this.props.map(p => p.body));
    Composite.add(W, this.ballChain);
  }

  private setPlayerMass(m: number) {
    if (Math.abs(this.player.mass - m) < 0.01) return;
    Body.setMass(this.player, m);
    Body.setInertia(this.player, Infinity);
  }

  // ---------------------------------------------------------------- save/load
  loadFrom(save: SaveData) {
    this.save = save;
    this.releaseTether(false); this.drop();
    this.fragments = [
      { id: 'A', x: Q.fragA.x, y: Q.fragA.y, taken: save.quests.A === 'done' },
      { id: 'B', x: Q.fragB.x, y: Q.fragB.y, taken: save.quests.B === 'done' },
      { id: 'C', x: Q.brazier.x, y: 600, taken: save.quests.C === 'done' },
    ];
    this.beaconLit = save.quests.C === 'done';
    // seawall
    if (save.quests.B === 'done') { if (this.seawall) { Composite.remove(this.engine.world, this.seawall); this.terrain = this.terrain.filter(b => b !== this.seawall); this.seawall = null; } }
    else if (!this.seawall) {
      this.seawall = Bodies.rectangle(Q.seawall.x + Q.seawall.w / 2, Q.seawall.y + Q.seawall.h / 2, Q.seawall.w, Q.seawall.h, { isStatic: true, label: 'seawall' });
      Composite.add(this.engine.world, this.seawall); this.terrain.push(this.seawall);
    }
    for (const d of this.debris) Composite.remove(this.engine.world, d.body);
    this.debris = [];
    this.gateRise = save.quests.A === 'done' ? 230 : 0;
    for (const p of this.props) this.resetProp(p);
    this.activeCps = new Set([save.checkpoint]);
    this.surge = { next: 75, active: 0, warn: false }; this.gravityScale = 1; this.engine.gravity.y = GRAVITY;
    this.cutscene = null; this.lockInput = 0;
    this.respawn(false);
    this.zone = this.zoneAt(this.player.position.x, this.player.position.y) ?? 'plaza';
    this.audio.setZone(this.save.coreRestored ? 'final' : this.zone);
    this.ui.refresh();
  }

  persist() { writeSave(this.save); }

  // ---------------------------------------------------------------- helpers
  zoneAt(x: number, y: number): ZoneId | null {
    for (const z of ZONES) if (inRect(x, y, z.rect)) return z.id;
    return null;
  }
  get pos() { return this.player.position; }
  questsCoreDone() { const q = this.save.quests; return q.A === 'done' && q.B === 'done' && q.C === 'done'; }

  resetProp(p: Prop) {
    if (this.carry?.prop === p) this.drop();
    if (this.tether?.prop === p) this.releaseTether(false);
    Body.setPosition(p.body, { ...p.home }); Body.setVelocity(p.body, { x: 0, y: 0 });
    Body.setAngle(p.body, 0); Body.setAngularVelocity(p.body, 0); p.lostT = 0;
    p.body.collisionFilter.mask = 0xffff;
  }

  resetPuzzle() {
    const z = this.zone;
    let n = 0;
    for (const p of this.props) if (p.zone === z) { this.resetProp(p); n++; }
    if (z === 'gardens') this.launcherNotch = 2;
    this.ui.toast(n ? `Puzzle objects in ${ZONES.find(q => q.id === z)!.name} reset.` : 'Nothing to reset here.', 'info');
  }

  burst(x: number, y: number, color: string, n = 16, speed = 4, g = 0.05, size = 3) {
    if (this.settings().reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 30 + Math.random() * 30, color, size: size * (0.5 + Math.random()), g });
    }
  }
  addShake(v: number) { if (!this.settings().reducedMotion) this.shake = Math.min(18, this.shake + v); }

  // ---------------------------------------------------------------- main step
  step() {
    if (this.paused) return;
    const inp = this.input;
    const dt = STEP_MS / 1000;
    this.time += dt;
    if (!this.save.ended || true) this.save.playTime += dt;
    if (this.lockInput > 0) this.lockInput -= dt;
    const canAct = this.lockInput <= 0;

    this.updateSurge(dt);
    this.updateGrounded();
    if (canAct) this.updateTetherInput();
    this.updateMovement(canAct);
    if (canAct) this.updateCarryInput();
    this.updateTetherPhysics();
    this.updateQuestA();
    this.updateLauncher();
    this.updateLift();
    this.updateSprings();

    Engine.update(this.engine, STEP_MS);

    this.postStep(dt, canAct);
  }

  private updateSurge(dt: number) {
    const s = this.settings();
    if (!s.surges || this.cutscene || !this.save.introSeen) { if (this.surge.active > 0) { this.surge.active = 0; this.endSurge(); } return; }
    if (this.surge.active > 0) {
      this.surge.active -= dt;
      if (this.surge.active <= 0) this.endSurge();
    } else {
      this.surge.next -= dt;
      if (!this.surge.warn && this.surge.next <= 3) { this.surge.warn = true; this.ui.toast('⚠ Aether Surge incoming: gravity is about to weaken!', 'warn'); this.audio.play('surge'); }
      if (this.surge.next <= 0) {
        this.surge.active = 14; this.surge.warn = false; this.surge.next = 80;
        this.gravityScale = 0.36; this.engine.gravity.y = GRAVITY * this.gravityScale;
        this.ui.toast('Aether Surge! Low gravity for 14 s. Jumps and throws go much further.', 'warn');
      }
    }
  }
  private endSurge() {
    this.gravityScale = 1; this.engine.gravity.y = GRAVITY;
    this.ui.toast('The surge fades. Gravity is back to normal.', 'info');
  }
  triggerSurge() { this.surge.next = 3.1; this.surge.warn = false; }

  private standables(): MBody[] {
    const list: MBody[] = this.terrain.slice();
    for (const p of this.props) if (this.carry?.prop !== p) list.push(p.body);
    for (const d of this.debris) list.push(d.body);
    return list;
  }

  private updateGrounded() {
    const p = this.pos, v = this.player.velocity;
    const yb = p.y + PH / 2 + 3;
    const pts = [{ x: p.x - PW / 2 + 4, y: yb }, { x: p.x, y: yb + 1 }, { x: p.x + PW / 2 - 4, y: yb }];
    let hit: MBody | null = null;
    const cands = this.standables();
    for (const pt of pts) {
      const r = Query.point(cands, pt);
      if (r.length) { hit = r[0]; break; }
    }
    const was = this.grounded;
    this.grounded = !!hit && v.y >= -2.5;
    this.groundBody = this.grounded ? hit : null;
    this.groundKind = hit ? (hit.label === 'ice' ? 'ice' : hit.label) : 'air';
    if (this.grounded) {
      this.coyote = 6;
      if (!was && this.airTime > 10) {
        const impact = Math.min(1.5, this.airTime / 40);
        this.audio.play('land', impact); this.landFx = 1;
        this.burst(p.x, p.y + PH / 2, 'rgba(220,230,255,0.6)', 6 + Math.round(impact * 6), 2.2, 0.02, 2);
      }
      this.airTime = 0;
    } else { this.coyote = Math.max(0, this.coyote - 1); this.airTime++; }
    // planted feet: heavier while grounded so you can haul objects with the tether
    this.setPlayerMass(this.grounded ? 40 : 5);
  }

  private updateMovement(canAct: boolean) {
    const inp = this.input, v = this.player.velocity;
    let vx = v.x, vy = v.y;
    const dir = canAct ? (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0) : 0;
    if (dir) this.facing = dir;
    const ice = this.groundKind === 'ice' && this.grounded;
    const carryingHeavy = !!this.carry;
    const max = carryingHeavy ? RUN * 0.85 : RUN;

    if (this.grounded) {
      if (dir) {
        if (vx * dir > max) vx = approach(vx, dir * max, ice ? 0.01 : 0.35);
        else vx = approach(vx, dir * max, ice ? 0.13 : (vx * dir < 0 ? 1.7 : 1.0));
      } else vx = approach(vx, 0, ice ? 0.025 : 1.2);
      // moving platform-ish: inherit some velocity of a dynamic body we stand on
      if (this.groundBody && !this.groundBody.isStatic) vx += this.groundBody.velocity.x * 0.15;
      if (Math.abs(vx) > 0.5) this.runPhase += Math.abs(vx) * 0.05;
    } else if (this.tether) {
      // pump the swing: force along facing direction
      vx += dir * 0.2;
      vx *= 0.999;
    } else {
      if (dir) {
        if (vx * dir < max) vx = approach(vx, dir * max, 0.5);
      }
      vx *= 0.996; // air drag
    }

    // jumping
    const jp = canAct && (inp.pressed('jump') || (inp.pressed('up') && !this.tether));
    if (jp) this.jumpBuf = 8; else this.jumpBuf = Math.max(0, this.jumpBuf - 1);
    if (this.jumpBuf > 0 && !this.tether && (this.grounded || this.coyote > 0)) {
      vy = -JUMP_V; this.jumpBuf = 0; this.coyote = 0; this.jumpCut = true; this.grounded = false;
      this.setPlayerMass(5);
      this.audio.play('jump');
      this.burst(this.pos.x, this.pos.y + PH / 2, 'rgba(200,220,255,0.5)', 5, 1.8, 0.02, 2);
    }
    const held = inp.held('jump') || inp.held('up');
    if (this.jumpCut && !held && vy < -5 && !this.tether) { vy *= 0.5; this.jumpCut = false; }
    if (vy >= 0) this.jumpCut = false;

    vy = Math.min(vy, 22);
    const sp = Math.hypot(vx, vy);
    if (sp > 30) { vx *= 30 / sp; vy *= 30 / sp; }
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, sp);
    Body.setVelocity(this.player, { x: vx, y: vy });
  }

  // ---------------------------------------------------------------- tether
  private tetherOrigin() { return { x: this.pos.x, y: this.pos.y - 12 }; }

  private lineOfSight(a: { x: number; y: number }, b: { x: number; y: number }, ignore: MBody | null) {
    const bodies = this.terrain.filter(t => t !== ignore);
    const hits = Query.ray(bodies, a, b, 2);
    return hits.length === 0;
  }

  candidates(): Target[] {
    const out: Target[] = [];
    for (const a of ANCHORS) out.push({ x: a.x, y: a.y, body: null });
    for (const p of this.props) if (this.carry?.prop !== p) out.push({ x: p.body.position.x, y: p.body.position.y, body: p.body, prop: p });
    return out;
  }

  private validTarget(t: Target, o: { x: number; y: number }) {
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    if (d > TETHER_RANGE || d < 30) return false;
    return this.lineOfSight(o, { x: t.x, y: t.y }, t.body);
  }

  mouseWorld(): { x: number; y: number } | null { return (this as any)._mouseWorld ?? null; }

  pickTarget(): Target | null {
    const o = this.tetherOrigin();
    const mw = this.mouseWorld();
    const mouseRecent = mw && performance.now() - this.input.mouse.lastMove < 2500;
    let best: Target | null = null, bestS = Infinity;
    const vel = this.player.velocity;
    const speed = Math.hypot(vel.x, vel.y);
    for (const t of this.candidates()) {
      const dx = t.x - o.x, dy = t.y - o.y, d = Math.hypot(dx, dy);
      if (d > TETHER_RANGE || d < 30) continue;
      let s: number;
      if (mouseRecent && mw) {
        const md = Math.hypot(t.x - mw.x, t.y - mw.y);
        if (md > 110) continue;
        s = md;
      } else {
        if (!t.body && dy > 40) continue; // anchors must be above-ish
        s = d;
        if (this.input.held('up')) s += dy * 1.2; // holding Up aims the web upward
        else if (dx * this.facing > 0) s -= 120;
        if (!t.body && dy < 0) s += dy * 0.5; // prefer anchors higher up
        if (speed > 3) s -= ((dx * vel.x + dy * vel.y) / (d * speed)) * 90;
        if (t.body) s += t.prop?.type === 'ball' ? 20 : 90;
      }
      if (this.tether && Math.hypot(t.x - this.tether.x, t.y - this.tether.y) < 5) continue; // chain to a *new* anchor
      if (s < bestS && this.validTarget(t, o)) { bestS = s; best = t; }
    }
    return best;
  }

  private updateTetherInput() {
    const inp = this.input;
    this.target = this.pickTarget();
    const clicked = inp.mouse.clicked;
    if (inp.mouse.rclicked && this.tether) { this.releaseTether(false); return; }
    if (inp.pressed('tether') || clicked) {
      // tether key while swinging: chain to the highlighted next anchor, or let go if there is none
      if (this.tether && !clicked && !this.target) { this.releaseTether(false); return; }
      if (this.target) this.attach(this.target);
      else {
        // failed attempt: fizzle toward the aim direction
        const o = this.tetherOrigin();
        const mw = this.mouseWorld();
        let dx: number, dy: number;
        if (clicked && mw) { dx = mw.x - o.x; dy = mw.y - o.y; } else { dx = this.facing * 0.6; dy = -0.8; }
        const l = Math.hypot(dx, dy) || 1;
        let ex = o.x + (dx / l) * TETHER_RANGE, ey = o.y + (dy / l) * TETHER_RANGE;
        const hits = Query.ray(this.terrain, o, { x: ex, y: ey }, 2);
        if (hits.length) {
          // shorten to first obstruction (approx by stepping)
          for (let k = 1; k <= 20; k++) {
            const px = o.x + (dx / l) * TETHER_RANGE * k / 20, py = o.y + (dy / l) * TETHER_RANGE * k / 20;
            if (Query.point(this.terrain, { x: px, y: py }).length) { ex = px; ey = py; break; }
          }
        }
        this.failFx = { x1: o.x, y1: o.y, x2: ex, y2: ey, t: 0.45 };
        this.audio.play('fail');
        this.burst(ex, ey, '#ff5d6c', 8, 2.5, 0.05, 2);
      }
    }
    if (this.tether) {
      if (inp.pressed('jump')) {
        this.releaseTether(true);
      } else {
        const charging = inp.held('slingshot');
        if (charging && !this.tether.charging) this.audio.play('shoot');
        this.tether.charging = charging;
        if (charging) this.tether.len = Math.max(TETHER_MIN, this.tether.len - 9);
        else if (inp.held('up')) this.tether.len = Math.max(TETHER_MIN, this.tether.len - 5);
        else if (inp.held('down')) this.tether.len = Math.min(TETHER_MAX, this.tether.len + 5);
      }
    }
  }

  attach(t: Target) {
    if (this.tether) this.releaseTether(false, true);
    const o = this.tetherOrigin();
    const len = Math.max(TETHER_MIN, Math.hypot(t.x - o.x, t.y - o.y));
    const c = t.body
      ? Constraint.create({ bodyA: this.player, pointA: { x: 0, y: -12 }, bodyB: t.body, pointB: { x: 0, y: 0 }, length: len, stiffness: 0.3, damping: 0.03 })
      : Constraint.create({ bodyA: this.player, pointA: { x: 0, y: -12 }, pointB: { x: t.x, y: t.y }, length: len, stiffness: 0.3, damping: 0.03 });
    Composite.add(this.engine.world, c);
    this.tether = { c, x: t.x, y: t.y, body: t.body, prop: t.prop, len, charging: false, tension: 0 };
    this.shootFx = 1;
    this.stats.swings++;
    this.audio.play('attach');
    this.burst(t.x, t.y, '#bff8ff', 10, 2.5, 0, 2);
  }

  releaseTether(boost: boolean, silent = false) {
    if (!this.tether) return;
    Composite.remove(this.engine.world, this.tether.c);
    const wasCharging = this.tether.charging;
    this.tether = null;
    if (boost) {
      const v = this.player.velocity;
      Body.setVelocity(this.player, { x: v.x * 1.05, y: Math.min(v.y, 0) - 4.5 });
      this.audio.play('jump');
    } else if (!silent) this.audio.play('release');
    if (wasCharging) this.burst(this.pos.x, this.pos.y, '#7af7ff', 10, 3, 0, 2);
  }

  private updateTetherPhysics() {
    const t = this.tether;
    if (!t) return;
    // anchors on props follow the body
    if (t.body) { t.x = t.body.position.x; t.y = t.body.position.y; }
    const o = this.tetherOrigin();
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    // elastic rope: only pulls when stretched past rest length
    t.c.length = t.len;
    if (d < t.len) t.c.stiffness = 0.0001;
    else t.c.stiffness = t.charging ? 0.06 : 0.3;
    t.tension = Math.max(0, (d - t.len) / t.len);
    // snap if absurdly stretched or line of sight lost for anchors behind thick walls
    if (d > TETHER_MAX * 1.6) this.releaseTether(false);
  }

  // ---------------------------------------------------------------- carry
  private updateCarryInput() {
    const inp = this.input;
    if (this.carry) {
      const cp = this.carry.prop.body;
      Body.setAngularVelocity(cp, cp.angularVelocity * 0.8);
      const hand = { x: this.pos.x, y: this.pos.y - PH / 2 - this.carry.prop.size / 2 - 4 };
      if (Math.hypot(cp.position.x - hand.x, cp.position.y - hand.y) > 140) { this.drop(); return; }
      if (inp.pressed('throw')) { this.throwCarry(); return; }
      if (inp.pressed('grab')) { this.drop(); return; }
      return;
    }
    if (inp.pressed('throw') && !this.carry) { /* nothing to throw */ }
    if (inp.pressed('grab')) {
      // lever on the spring launcher
      if (this.zone === 'gardens' && Math.abs(this.pos.x - (Q.launcher.x - 40)) < 55 && Math.abs(this.pos.y - 920) < 60) {
        this.launcherNotch = this.launcherNotch % 3 + 1;
        this.audio.play('lever');
        this.ui.toast(`Spring compression: notch ${this.launcherNotch} of 3`, 'info');
        return;
      }
      // NPC
      const npc = this.nearNpc(80);
      let best: Prop | null = null, bd = 85;
      for (const p of this.props) {
        if (!p.carryable) continue;
        const d = Math.hypot(p.body.position.x - this.pos.x, p.body.position.y - this.pos.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (npc && (!best || bd > 60)) { this.talk(npc, true); return; }
      if (best) this.grab(best);
      else if (this.zone === 'plaza' && this.questsCoreDone() && !this.save.coreRestored && Math.abs(this.pos.x - Q.core.x) < 120) this.restoreCore();
    }
  }

  grab(p: Prop) {
    if (this.tether?.prop === p) this.releaseTether(false, true);
    p.body.collisionFilter.mask = 0xffff & ~CAT.PLAYER;
    const c = Constraint.create({ bodyA: this.player, pointA: { x: 0, y: -PH / 2 - p.size / 2 - 4 }, bodyB: p.body, length: 0, stiffness: 0.25, damping: 0.15 });
    Composite.add(this.engine.world, c);
    this.carry = { prop: p, c };
    this.audio.play('grab');
  }
  drop() {
    if (!this.carry) return;
    Composite.remove(this.engine.world, this.carry.c);
    const b = this.carry.prop.body;
    this.carry = null;
    // put down in front, keep momentum
    Body.setVelocity(b, { x: this.player.velocity.x + this.facing * 1.5, y: Math.min(0, this.player.velocity.y) });
    setTimeout(() => { b.collisionFilter.mask = 0xffff; }, 250);
  }
  throwCarry() {
    if (!this.carry) return;
    const b = this.carry.prop.body;
    Composite.remove(this.engine.world, this.carry.c);
    this.carry = null;
    let dx = this.facing * 0.82, dy = -0.57;
    const mw = this.mouseWorld();
    if (mw && performance.now() - this.input.mouse.lastMove < 2500) { dx = mw.x - b.position.x; dy = mw.y - b.position.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    const pv = this.player.velocity, power = 13;
    Body.setVelocity(b, { x: pv.x + dx * power, y: pv.y * 0.5 + dy * power });
    setTimeout(() => { b.collisionFilter.mask = 0xffff; }, 250);
    this.audio.play('throw');
  }

  throwPreview(): { x: number; y: number }[] | null {
    if (!this.carry) return null;
    const b = this.carry.prop.body;
    let dx = this.facing * 0.82, dy = -0.57;
    const mw = this.mouseWorld();
    if (mw && performance.now() - this.input.mouse.lastMove < 2500) { dx = mw.x - b.position.x; dy = mw.y - b.position.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
    const pv = this.player.velocity;
    return this.arc(b.position.x, b.position.y, pv.x + dx * 13, pv.y * 0.5 + dy * 13, 45);
  }

  arc(x: number, y: number, vx: number, vy: number, n: number) {
    const g = G_STEP * this.gravityScale; const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      vy += g; x += vx; y += vy;
      if (i % 3 === 0) pts.push({ x, y });
      if (Query.point(this.terrain, { x, y }).length) break;
    }
    return pts;
  }

  // ---------------------------------------------------------------- NPC
  nearNpc(r: number): NpcDef | null {
    for (const n of NPCS) if (Math.abs(n.x - this.pos.x) < r && Math.abs(n.y - 30 - this.pos.y) < 70) return n;
    return null;
  }
  talk(n: NpcDef, forced = false) {
    let lines = n.lines;
    if (n.id === 'mayor' && this.questsCoreDone() && !this.save.coreRestored) lines = ['All three fragments! Bring them to the Core, right there. Stand by it and press E.'];
    if (n.id === 'mayor' && this.save.coreRestored && !this.save.ended) lines = ['The Core lives! Its lift will carry you up to the Spire Crown. Touch the crown beam to restart the city.'];
    if (n.id === 'mayor' && this.save.ended) lines = ['The whole city is humming again. Thank you, web-slinger.'];
    if (n.id === 'smith' && this.save.quests.A === 'done') lines = ['The furnace roars again! That gate is latched open for good now.'];
    if (n.id === 'dockhand' && this.save.quests.B === 'done') lines = ['Ha! What a hit! The pier is open again.'];
    if (n.id === 'gardener' && this.save.quests.C === 'done') lines = ['The beacon burns bright. The skyline can see us again.'];
    this.ui.dialog(n.name, lines, n.color);
    if (!this.save.talked.includes(n.id)) { this.save.talked.push(n.id); }
    this.talkCooldown.set(n.id, this.time + (forced ? 2 : 999999));
  }

  // ---------------------------------------------------------------- quests
  bodiesOnRegion(x0: number, x1: number, top: number): Set<MBody> {
    const all: MBody[] = [this.player, ...this.props.filter(p => this.carry?.prop !== p).map(p => p.body)];
    const on = new Set<MBody>();
    let surfaces: { x0: number; x1: number; top: number }[] = [{ x0, x1, top }];
    for (let iter = 0; iter < 3; iter++) {
      const next: typeof surfaces = [];
      for (const b of all) {
        if (on.has(b)) continue;
        const bb = b.bounds;
        for (const s of surfaces) {
          if (bb.max.x > s.x0 + 4 && bb.min.x < s.x1 - 4 && Math.abs(bb.max.y - s.top) < 9) {
            on.add(b); next.push({ x0: bb.min.x, x1: bb.max.x, top: bb.min.y }); break;
          }
        }
      }
      if (!next.length) break;
      surfaces = next;
    }
    return on;
  }

  private weightOf(b: MBody) {
    if (b === this.player) return 1 + (this.carry ? this.carry.prop.weight : 0);
    const p = this.props.find(q => q.body === b);
    return p ? p.weight : 0;
  }

  private updateQuestA() {
    const top = Q.pan.y + this.panOffset;
    const on = this.bodiesOnRegion(Q.pan.x, Q.pan.x + Q.pan.w, top);
    let w = 0; on.forEach(b => (w += this.weightOf(b)));
    this.panWeight = w;
    const targetOff = Math.min(w, 4) * 6;
    const nOff = approach(this.panOffset, targetOff, 0.6);
    if (nOff !== this.panOffset) { this.panOffset = nOff; Body.setPosition(this.pan, { x: Q.pan.x + Q.pan.w / 2, y: Q.pan.y + Q.pan.h / 2 + this.panOffset }); }
    // counterweight: gate (3 units) only lifts when the pan outweighs it
    const done = this.save.quests.A === 'done';
    let targetRise = done ? 230 : w >= 3 ? 230 : w * 5;
    const rate = done ? 3 : w >= 3 ? 1.2 + (w - 3) * 1.5 : 2.5;
    // don't crush anything under the gate
    if (targetRise < this.gateRise) {
      const gx0 = Q.gate.x - 4, gx1 = Q.gate.x + Q.gate.w + 4;
      const under = [this.player, ...this.props.map(p => p.body)].some(b => b.bounds.max.x > gx0 && b.bounds.min.x < gx1 && b.bounds.max.y > Q.gate.y + Q.gate.h - this.gateRise - 2 && b.bounds.min.y < Q.gate.y + Q.gate.h);
      if (under) targetRise = this.gateRise;
    }
    const prev = this.gateRise;
    this.gateRise = approach(this.gateRise, targetRise, rate);
    if (Math.abs(prev - this.gateRise) > 0.01) {
      Body.setPosition(this.gate, { x: Q.gate.x + Q.gate.w / 2, y: Q.gate.y + Q.gate.h / 2 - this.gateRise });
      if (Math.floor(prev / 40) !== Math.floor(this.gateRise / 40)) this.audio.play('gate');
    }
  }

  private updateLauncher() {
    if (this.launchCooldown > 0) this.launchCooldown--;
    this.stompPress = Math.max(0, this.stompPress - 0.05);
    const onStomp = this.groundBody === this.stomp;
    const landed = onStomp && !this.wasOnStomp;
    this.wasOnStomp = onStomp;
    if (landed && this.launchCooldown <= 0) {
      this.launchCooldown = 45; this.stompPress = 1;
      const on = this.bodiesOnRegion(Q.launcher.x, Q.launcher.x + Q.launcher.w, Q.launcher.y);
      const v = this.launchVelocity();
      let launched = 0;
      on.forEach(b => {
        if (b === this.player) { Body.setVelocity(b, { x: v.x * 0.6, y: v.y * 0.85 }); return; }
        Body.setVelocity(b, { x: v.x, y: v.y }); launched++;
      });
      this.audio.play('spring');
      this.burst(Q.launcher.x + Q.launcher.w / 2, Q.launcher.y, '#b48cff', 12, 3, 0.05, 2);
      if (!launched && !on.has(this.player)) this.ui.toast('The launcher fired empty. Put something on the plate first.', 'info');
    }
  }
  launchVelocity() {
    const speed = [0, 17.5, 22.1, 26.5][this.launcherNotch];
    const a = 55 * Math.PI / 180;
    return { x: Math.cos(a) * speed, y: -Math.sin(a) * speed };
  }
  launchPreview() {
    const v = this.launchVelocity();
    return this.arc(Q.launcher.x + Q.launcher.w / 2, Q.launcher.y - 22, v.x, v.y, 110);
  }

  private updateLift() {
    if (!this.save.coreRestored) return;
    const L = Q.lift;
    const affect = (b: MBody, isPlayer: boolean) => {
      const p = b.position;
      if (p.x > L.x - 10 && p.x < L.x + L.w + 10 && p.y > L.y - 40 && p.y < L.y + L.h) {
        const v = b.velocity;
        const g = G_STEP * this.gravityScale;
        const top = p.y < L.y + 90;
        // rise steadily, then hover at the top and drift toward the Spire Crown
        const targetVy = top ? (L.y + 15 - p.y) * 0.08 : -8.5;
        const nvy = approach(v.y, targetVy, g + 0.45);
        const nvx = top ? approach(v.x, -2.6, 0.12) : v.x * 0.98 + ((L.x + L.w / 2) - p.x) * 0.004;
        Body.setVelocity(b, { x: nvx, y: nvy });
        if (isPlayer && Math.random() < 0.3) this.particles.push({ x: p.x + (Math.random() - 0.5) * 40, y: p.y + 30, vx: 0, vy: -2, life: 0, max: 30, color: '#7af7ff', size: 2, g: 0 });
      }
    };
    affect(this.player, true);
    for (const pr of this.props) affect(pr.body, false);
  }

  private updateSprings() {
    Q.springPads.forEach((s, i) => {
      this.springAnim[i] = Math.max(0, this.springAnim[i] - 0.06);
      const bodies = [this.player, ...this.props.filter(p => this.carry?.prop !== p).map(p => p.body)];
      for (const b of bodies) {
        const bb = b.bounds;
        if (bb.max.x > s.x - 34 && bb.min.x < s.x + 34 && Math.abs(bb.max.y - s.y) < 10 && b.velocity.y >= -0.5) {
          Body.setVelocity(b, { x: b.velocity.x, y: -s.power });
          if (b === this.player) { this.setPlayerMass(5); this.grounded = false; this.jumpCut = false; }
          this.springAnim[i] = 1;
          this.audio.play('spring');
          this.burst(s.x, s.y - 10, '#7af7ff', 8, 2.5, 0.05, 2);
        }
      }
    });
  }

  private onCollide(ev: Matter.IEventCollision<Matter.Engine>) {
    for (const pair of ev.pairs) {
      const a = pair.bodyA, b = pair.bodyB;
      // seawall impulse check
      if (this.seawall && (a === this.seawall || b === this.seawall)) {
        const o = a === this.seawall ? b : a;
        if (o === this.player) continue;
        const rel = Math.hypot(o.velocity.x, o.velocity.y);
        const momentum = o.mass * rel;
        if (o.mass >= 8 && momentum >= BREAK_MOMENTUM) this.breakWall(o, momentum);
        else if (momentum > 12 && this.time - this.lastImpactToast > 1.2) {
          this.lastImpactToast = this.time;
          this.audio.play('crack');
          this.ui.toast(o.mass < 8 ? `Too light! The wall needs something heavy (mass ${o.mass.toFixed(0)}).` : `Impact momentum ${momentum.toFixed(0)} / ${BREAK_MOMENTUM}. Hit it harder!`, 'warn');
          this.addShake(2);
        }
        continue;
      }
      // generic impact sounds for props
      const hasProp = this.props.find(p => p.body === a || p.body === b);
      if (hasProp) {
        const rv = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
        if (rv > 3) {
          this.audio.play(hasProp.type === 'iron' || hasProp.type === 'ball' ? 'clank' : 'thud', Math.min(2, rv / 6));
          if (rv > 8) this.addShake(hasProp.type === 'ball' ? 4 : 1.5);
        }
      }
    }
  }

  breakWall(by: MBody, momentum: number) {
    if (!this.seawall) return;
    const w = this.seawall;
    Composite.remove(this.engine.world, w);
    this.terrain = this.terrain.filter(t => t !== w);
    this.seawall = null;
    for (let i = 0; i < 14; i++) {
      const s = 18 + Math.random() * 22;
      const d = Bodies.rectangle(Q.seawall.x + Math.random() * Q.seawall.w, Q.seawall.y + Math.random() * Q.seawall.h, s, s * (0.6 + Math.random() * 0.6), {
        friction: 0.6, restitution: 0.2, label: 'debris', collisionFilter: { category: CAT.DEBRIS, mask: CAT.TERRAIN | CAT.DEBRIS | CAT.PROP },
      });
      Body.setVelocity(d, { x: 2 + Math.random() * 6 + by.velocity.x * 0.3, y: -3 - Math.random() * 6 });
      Body.setAngularVelocity(d, (Math.random() - 0.5) * 0.4);
      this.debris.push({ body: d, t: 7 + Math.random() * 3 });
      Composite.add(this.engine.world, d);
    }
    this.audio.play('break');
    this.addShake(14);
    this.burst(Q.seawall.x + 30, Q.seawall.y + 300, '#cfefff', 40, 6, 0.1, 4);
    this.ui.toast(`CRASH! The seawall gives way (momentum ${momentum.toFixed(0)}). The pier is open.`, 'good');
  }

  collectFragment(f: Fragment) {
    if (f.taken) return;
    f.taken = true;
    f.fly = { t: 0, sx: f.x, sy: f.y };
    this.save.quests[f.id] = 'done';
    const names = { A: 'Furnace Gate', B: 'Break the Seawall', C: 'Light the Beacon' };
    this.audio.play('quest');
    this.burst(f.x, f.y, '#fff3a0', 40, 6, 0.02, 3);
    this.addShake(5);
    const n = (['A', 'B', 'C'] as const).filter(k => this.save.quests[k] === 'done').length;
    this.ui.toast(`QUEST COMPLETE: ${names[f.id]}. Aether Fragment ${n}/3 recovered!`, 'quest');
    if (this.questsCoreDone() && this.save.quests.F === 'locked') {
      this.save.quests.F = 'active';
      setTimeout(() => this.ui.toast('All fragments found! Return to the Aether Core in the Plaza.', 'quest'), 1800);
    }
    this.persist();
    this.ui.refresh();
  }

  restoreCore() {
    if (this.save.coreRestored) return;
    this.cutscene = { kind: 'core', t: 0 };
    this.lockInput = 3;
    this.releaseTether(false, true); this.drop();
    this.audio.play('final');
    this.ui.toast('The fragments lock into place...', 'quest');
    setTimeout(() => {
      this.save.coreRestored = true;
      this.cutscene = null;
      this.audio.setZone('final');
      this.burst(Q.core.x, Q.core.y - 80, '#7af7ff', 80, 8, 0, 4);
      this.addShake(8);
      this.ui.toast('THE AETHER CORE IS REIGNITED! A gravity lift rises. Ride it to the Spire Crown.', 'quest');
      this.ui.banner('Core Reignited', 'Ride the lift to the Spire Crown', '#7af7ff');
      this.persist(); this.ui.refresh();
    }, 2600);
  }

  finishGame() {
    if (this.save.ended) return;
    this.save.ended = true; this.save.quests.F = 'done';
    this.audio.play('final');
    this.burst(Q.crown.x, Q.crown.y - 40, '#fff3a0', 90, 9, 0.02, 4);
    this.persist(); this.ui.refresh();
    setTimeout(() => this.ui.ending(), 900);
  }

  // ---------------------------------------------------------------- respawn
  respawn(fx = true) {
    const cp = CHECKPOINTS.find(c => c.id === this.save.checkpoint) ?? CHECKPOINTS[0];
    this.releaseTether(false, true); this.drop();
    Body.setPosition(this.player, { x: cp.x, y: cp.y - PH / 2 - 2 });
    Body.setVelocity(this.player, { x: 0, y: 0 });
    if (fx) {
      this.save.respawns++;
      this.audio.play('respawn');
      this.burst(cp.x, cp.y - 30, '#7af7ff', 24, 4, 0, 3);
    }
  }

  // ---------------------------------------------------------------- post step
  private postStep(dt: number, canAct: boolean) {
    const p = this.pos;
    // respawn hold
    if (canAct && this.input.held('respawn')) { this.respawnHold += dt; if (this.respawnHold >= 0.6) { this.respawnHold = 0; this.respawn(); } }
    else this.respawnHold = 0;
    // water / void
    const inWater = p.x > Q.waterX && p.y + PH / 2 > Q.waterY + 10;
    if (inWater || p.y > WORLD_H + 100 || p.x < 0 || p.x > WORLD_W) {
      if (inWater) { this.audio.play('splash'); this.burst(p.x, Q.waterY, '#8fd8ff', 20, 4, 0.15, 3); }
      this.ui.toast(inWater ? 'Splash! Back to the last checkpoint.' : 'Lost in the void. Back to the last checkpoint.', 'bad');
      this.respawn();
    }
    // zone
    const z = this.zoneAt(p.x, p.y);
    if (z && z !== this.zone) {
      this.zone = z;
      const zd = ZONES.find(q => q.id === z)!;
      this.ui.banner(zd.name, zd.sub, zd.color);
      if (!this.save.coreRestored) this.audio.setZone(z);
      this.ui.refresh();
    }
    // checkpoints
    for (const c of CHECKPOINTS) {
      if (Math.abs(p.x - c.x) < 40 && Math.abs(p.y + PH / 2 - c.y) < 40 && this.save.checkpoint !== c.id) {
        this.save.checkpoint = c.id; this.activeCps.add(c.id);
        this.audio.play('checkpoint');
        this.burst(c.x, c.y - 70, '#7af7ff', 14, 3, 0, 2);
        this.ui.toast('Checkpoint saved.', 'info');
        this.persist();
      }
    }
    // shards
    for (const s of SHARDS) {
      if (this.save.shards.includes(s.id)) continue;
      const near = (bx: number, by: number) => Math.abs(bx - s.x) < 34 && Math.abs(by - s.y) < 44;
      if (near(p.x, p.y)) {
        this.save.shards.push(s.id);
        this.audio.play('collect');
        this.burst(s.x, s.y, '#7af7ff', 30, 5, 0.02, 3);
        this.ui.toast(`Echo Shard found! ${this.save.shards.length}/${SHARDS.length}`, 'good');
        if (this.save.shards.length === SHARDS.length) setTimeout(() => this.ui.toast('Every Echo Shard recovered. The city remembers you.', 'quest'), 1500);
        this.persist(); this.ui.refresh();
      }
    }
    // fragments
    for (const f of this.fragments) {
      if (f.taken) { if (f.fly) { f.fly.t += dt; if (f.fly.t > 1.2) f.fly = undefined; } continue; }
      if (f.id === 'C') continue;
      if (Math.abs(p.x - f.x) < 44 && Math.abs(p.y - f.y) < 75) this.collectFragment(f);
    }
    // beacon: orb in brazier cup
    if (!this.beaconLit) {
      const ob = this.orb.body.position;
      if (Math.abs(ob.x - Q.brazier.x) < Q.brazier.w / 2 - 8 && ob.y > 650 && ob.y < 712 && this.carry?.prop !== this.orb) {
        this.beaconLit = true;
        this.audio.play('break');
        this.burst(Q.brazier.x, 680, '#ffcf5a', 60, 7, -0.02, 4);
        this.ui.toast('The beacon flares to life!', 'good');
        const f = this.fragments.find(q => q.id === 'C')!;
        f.x = Q.brazier.x; f.y = 640;
        setTimeout(() => this.collectFragment(f), 700);
      }
    }
    // core proximity hint / auto restore
    if (this.questsCoreDone() && !this.save.coreRestored && !this.cutscene && Math.abs(p.x - Q.core.x) < 70 && Math.abs(p.y - (Q.core.y - 40)) < 80) this.restoreCore();
    // crown
    if (this.save.coreRestored && !this.save.ended && Math.abs(p.x - Q.crown.x) < 110 && p.y < Q.crown.y && p.y > Q.crown.y - 120) this.finishGame();
    // NPC auto-talk when first approached
    if (canAct) {
      const n = this.nearNpc(110);
      if (n && !this.save.talked.includes(n.id) && (this.talkCooldown.get(n.id) ?? 0) < this.time) this.talk(n);
    }
    // props: soft-lock guard
    for (const pr of this.props) {
      if (this.carry?.prop === pr) { pr.lostT = 0; continue; }
      const b = pr.body.position;
      const zr = ZONES.find(z => z.id === pr.zone)!.rect;
      const water = b.x > Q.waterX && b.y > Q.waterY + 10;
      const outside = !inRect(b.x, b.y, { x: zr.x - 150, y: zr.y - 400, w: zr.w + 300, h: zr.h + 450 });
      if (water || b.y > WORLD_H || b.x < 0 || b.x > WORLD_W) pr.lostT += 1;
      else if (outside) pr.lostT += dt;
      else pr.lostT = 0;
      if (water && pr.lostT === 1) { this.audio.play('splash'); this.burst(b.x, Q.waterY, '#8fd8ff', 14, 3, 0.15, 3); }
      if (pr.lostT > 2.5 || (water && pr.lostT > 40)) {
        if (pr.type === 'ball') { this.resetProp(pr); continue; }
        this.resetProp(pr);
        this.burst(pr.home.x, pr.home.y, '#ffffff', 14, 3, 0, 2);
        const zn = ZONES.find(z => z.id === pr.zone)!.name;
        this.ui.toast(`${pr.type === 'orb' ? 'The Aether Orb' : 'A crate'} was lost and has been returned (${zn}).`, 'info');
      }
    }
    // debris lifetime
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.t -= dt;
      if (d.t <= 0) { Composite.remove(this.engine.world, d.body); this.debris.splice(i, 1); }
    }
    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]; q.life++; q.x += q.vx; q.y += q.vy; q.vy += q.g; q.vx *= 0.98;
      if (q.life >= q.max) this.particles.splice(i, 1);
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
    this.shake *= 0.86;
    this.shootFx = Math.max(0, this.shootFx - 0.08);
    this.landFx = Math.max(0, this.landFx - 0.1);
    if (this.failFx) { this.failFx.t -= dt; if (this.failFx.t <= 0) this.failFx = null; }
    // autosave every 10s
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.persist(); }
  }
}
