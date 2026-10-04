import type Matter from 'matter-js';
import type { Game } from './game';
import { WORLD_W, WORLD_H, ZONES, ANCHORS, SHARDS, CHECKPOINTS, SIGNS, NPCS, QUEST_GEOM as Q, type ZoneId } from './level';
import type { Settings } from './save';

type V = { x: number; y: number };

function hexToRgb(h: string): [number, number, number] { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb(c: number[]) { return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
function mulberry(seed: number) { return () => { seed |= 0; seed = seed + 0x6d2b79f5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const ZCOL: Record<ZoneId, { base: string; edge: string; dark: string }> = {
  foundry: { base: '#2a1a14', edge: '#ffae42', dark: '#160d09' },
  plaza: { base: '#10262e', edge: '#3ff0d0', dark: '#08151a' },
  docks: { base: '#14223a', edge: '#8fd8ff', dark: '#0a1324' },
  gardens: { base: '#22183a', edge: '#b48cff', dark: '#120c22' },
};

export class Renderer {
  ctx: CanvasRenderingContext2D;
  cam = { x: 2200, y: 1700 };
  scale = 1; viewW = 1280; viewH = 720;
  sky = [hexToRgb('#06141f'), hexToRgb('#0f3a4a')];
  skyline: { x: number; w: number; h: number; win: number }[][] = [];
  stars: { x: number; y: number; r: number; t: number }[] = [];
  t = 0;
  constructor(public canvas: HTMLCanvasElement, public game: Game, public settings: () => Settings) {
    this.ctx = canvas.getContext('2d')!;
    const r = mulberry(7);
    for (let L = 0; L < 3; L++) {
      const arr: { x: number; w: number; h: number; win: number }[] = []; let x = -200;
      while (x < WORLD_W) { const w = 60 + r() * 140; arr.push({ x, w, h: 120 + r() * (220 + L * 140), win: r() }); x += w + r() * 30; }
      this.skyline.push(arr);
    }
    for (let i = 0; i < 160; i++) this.stars.push({ x: r() * 1, y: r() * 0.7, r: r() * 1.4 + 0.3, t: r() * 6 });
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    // 720 world units tall; width follows the aspect ratio (capped so we never exceed the world)
    this.scale = this.canvas.height / 720;
    this.viewW = Math.min(WORLD_W, this.canvas.width / this.scale);
    if (this.viewW < 900) { this.scale = this.canvas.width / 900; this.viewW = 900; }
    this.viewH = this.canvas.height / this.scale;
  }

  toWorld(nx: number, ny: number): V { return { x: this.cam.x + nx * this.viewW, y: this.cam.y + ny * this.viewH }; }

  updateCamera(snap = false) {
    const g = this.game, p = g.player.position, v = g.player.velocity;
    const tx = p.x - this.viewW / 2 + Math.max(-160, Math.min(160, v.x * 14));
    const ty = p.y - this.viewH * 0.6 + Math.max(-60, Math.min(120, v.y * 6));
    const k = snap ? 1 : 0.1;
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * (snap ? 1 : 0.12);
    this.cam.x = Math.max(0, Math.min(WORLD_W - this.viewW, this.cam.x));
    this.cam.y = Math.max(0, Math.min(WORLD_H - this.viewH, this.cam.y));
  }

  render(dt: number) {
    this.t += dt;
    const g = this.game, ctx = this.ctx, s = this.settings();
    const hc = s.highContrast;
    // sky colour follows the zone at the camera centre
    const cz = g.zoneAt(this.cam.x + this.viewW / 2, this.cam.y + this.viewH / 2) ?? g.zone;
    const zd = ZONES.find(z => z.id === cz)!;
    const tgt = [hexToRgb(zd.sky[0]), hexToRgb(zd.sky[1])];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) this.sky[i][j] += (tgt[i][j] - this.sky[i][j]) * 0.03;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const W = this.canvas.width, H = this.canvas.height;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, hc ? '#000' : rgb(this.sky[0])); grd.addColorStop(1, hc ? '#000' : rgb(this.sky[1]));
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    if (g.surge.active > 0 && !hc) { ctx.fillStyle = 'rgba(150,80,255,0.12)'; ctx.fillRect(0, 0, W, H); }
    // stars
    if (!hc) {
      for (const st of this.stars) {
        const a = 0.35 + 0.35 * Math.sin(this.t * 1.3 + st.t);
        ctx.fillStyle = `rgba(220,240,255,${a})`;
        const sx = ((st.x * W - this.cam.x * 0.03 * this.scale) % W + W) % W;
        ctx.fillRect(sx, st.y * H, st.r * this.scale, st.r * this.scale);
      }
      // big moon / core glow
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(W * 0.78 - this.cam.x * 0.02 * this.scale, H * 0.2, 60 * this.scale, 0, Math.PI * 2); ctx.fill();
    }
    this.drawSkyline(ctx, hc);

    // world transform
    let sx = 0, sy = 0;
    if (g.shake > 0.3 && !s.reducedMotion) { sx = (Math.random() - 0.5) * g.shake; sy = (Math.random() - 0.5) * g.shake; }
    ctx.setTransform(this.scale, 0, 0, this.scale, (-this.cam.x + sx) * this.scale, (-this.cam.y + sy) * this.scale);

    this.drawBackgroundProps(ctx);
    this.drawWater(ctx, true);
    this.drawTerrain(ctx, hc);
    this.drawQuestStatics(ctx, hc);
    this.drawCheckpoints(ctx);
    this.drawSigns(ctx, hc);
    this.drawNpcs(ctx);
    this.drawSprings(ctx);
    this.drawProps(ctx, hc);
    this.drawShards(ctx);
    this.drawFragments(ctx);
    this.drawAnchors(ctx, hc);
    this.drawTether(ctx);
    this.drawPlayer(ctx, hc);
    this.drawWater(ctx, false);
    this.drawParticles(ctx);
    if (s.debug) this.drawDebug(ctx);

    // vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!hc) {
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    }
  }

  private drawSkyline(ctx: CanvasRenderingContext2D, hc: boolean) {
    if (hc) return;
    const factors = [0.12, 0.25, 0.42];
    const cols = ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.4)'];
    const zc = ZONES.find(z => z.id === (this.game.zoneAt(this.cam.x + this.viewW / 2, this.cam.y + this.viewH / 2) ?? this.game.zone))!.color;
    const camCY = this.cam.y + this.viewH / 2;
    for (let L = 0; L < 3; L++) {
      const f = factors[L];
      const baseY = (560 + (2050 - camCY) * f * 0.6 + L * 40) * this.scale;
      ctx.fillStyle = cols[L];
      for (const b of this.skyline[L]) {
        const x = (b.x - this.cam.x * f) * this.scale * (1 + L * 0.1);
        if (x > this.canvas.width || x + b.w * this.scale < 0) continue;
        const h = b.h * this.scale * (0.6 + L * 0.2);
        ctx.fillRect(x, baseY - h, b.w * this.scale, h + this.canvas.height);
        if (L === 2 && b.win > 0.4) {
          ctx.fillStyle = zc + '33';
          for (let wy = baseY - h + 14 * this.scale; wy < baseY; wy += 26 * this.scale)
            for (let wx = x + 10 * this.scale; wx < x + b.w * this.scale - 14 * this.scale; wx += 22 * this.scale)
              if (((wx * 7 + wy * 13) | 0) % 5 < 2) ctx.fillRect(wx, wy, 8 * this.scale, 10 * this.scale);
          ctx.fillStyle = cols[L];
        }
      }
    }
  }

  private inView(x: number, y: number, w: number, h: number, pad = 100) {
    return x + w > this.cam.x - pad && x < this.cam.x + this.viewW + pad && y + h > this.cam.y - pad && y < this.cam.y + this.viewH + pad;
  }

  private drawBackgroundProps(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    // foundry chimneys smoke + furnace glow
    const furnaceOn = g.save.quests.A === 'done';
    if (this.inView(60, 1880, 600, 320)) {
      const fg = ctx.createRadialGradient(330, 2120, 10, 330, 2120, 260);
      fg.addColorStop(0, furnaceOn ? 'rgba(255,150,40,0.55)' : 'rgba(120,60,30,0.25)'); fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg; ctx.fillRect(60, 1880, 600, 320);
    }
    // crane (docks)
    if (this.inView(5450, 1300, 400, 900)) {
      ctx.strokeStyle = '#2d4a6e'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(5520, 2200); ctx.lineTo(5520, 1420); ctx.moveTo(5580, 2200); ctx.lineTo(5580, 1420); ctx.stroke();
      ctx.lineWidth = 3;
      for (let y = 1440; y < 2200; y += 60) { ctx.beginPath(); ctx.moveTo(5520, y); ctx.lineTo(5580, y + 60); ctx.moveTo(5580, y); ctx.lineTo(5520, y + 60); ctx.stroke(); }
      ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(5480, 1440); ctx.lineTo(5760, 1480); ctx.stroke();
      ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(Q.ballPivot.x, Q.ballPivot.y, 9, 0, 7); ctx.fill();
    }
    // clock tower face
    if (this.inView(3800, 1400, 160, 300)) {
      ctx.fillStyle = '#e8fff9'; ctx.beginPath(); ctx.arc(3880, 1580, 34, 0, 7); ctx.fill();
      ctx.strokeStyle = '#08151a'; ctx.lineWidth = 4; const a = this.t * 0.2;
      ctx.beginPath(); ctx.moveTo(3880, 1580); ctx.lineTo(3880 + Math.cos(a) * 24, 1580 + Math.sin(a) * 24); ctx.moveTo(3880, 1580); ctx.lineTo(3880 + Math.cos(a * 12) * 16, 1580 + Math.sin(a * 12) * 16); ctx.stroke();
    }
    // lift column
    if (g.save.coreRestored) {
      const L = Q.lift;
      const lg = ctx.createLinearGradient(L.x, 0, L.x + L.w, 0);
      lg.addColorStop(0, 'rgba(122,247,255,0)'); lg.addColorStop(0.5, `rgba(122,247,255,${0.18 + 0.06 * Math.sin(this.t * 3)})`); lg.addColorStop(1, 'rgba(122,247,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(L.x - 20, L.y - 60, L.w + 40, L.h + 60);
      ctx.strokeStyle = 'rgba(122,247,255,0.35)'; ctx.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const y = L.y + L.h - ((this.t * 220 + i * 170) % L.h); ctx.beginPath(); ctx.moveTo(L.x + 10, y); ctx.lineTo(L.x + L.w / 2, y - 18); ctx.lineTo(L.x + L.w - 10, y); ctx.stroke(); }
    }
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, hc: boolean) {
    for (const b of this.game.terrain) {
      const meta = (b as any).meta;
      if (!meta) continue;
      if (meta.hidden) continue;
      const bb = b.bounds;
      if (!this.inView(bb.min.x, bb.min.y, bb.max.x - bb.min.x, bb.max.y - bb.min.y)) continue;
      const zc = ZCOL[(meta.zone ?? this.game.zoneAt(b.position.x, b.position.y) ?? 'plaza') as ZoneId];
      ctx.beginPath();
      const vs = b.vertices; ctx.moveTo(vs[0].x, vs[0].y); for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y); ctx.closePath();
      if (meta.kind === 'ice') {
        const ig = ctx.createLinearGradient(0, bb.min.y, 0, bb.min.y + 60);
        ig.addColorStop(0, hc ? '#bfefff' : '#a8e6ff'); ig.addColorStop(1, hc ? '#5ab' : '#335a80');
        ctx.fillStyle = ig; ctx.fill();
        ctx.strokeStyle = '#e8fbff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(vs[0].x, vs[0].y); ctx.lineTo(vs[1].x, vs[1].y); ctx.stroke();
        // sheen
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
        for (let x = bb.min.x + ((this.t * 40) % 120); x < bb.max.x; x += 120) { if (!b.angle) { ctx.beginPath(); ctx.moveTo(x, bb.min.y + 6); ctx.lineTo(x + 30, bb.min.y + 6); ctx.stroke(); } }
        continue;
      }
      ctx.fillStyle = hc ? '#1a1a1a' : meta.kind === 'wall' ? zc.dark : meta.kind === 'metal' ? zc.base : zc.base;
      ctx.fill();
      if (meta.kind === 'metal' && !hc) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 2;
        for (let y = bb.min.y + 20; y < bb.max.y; y += 24) { ctx.beginPath(); ctx.moveTo(bb.min.x, y); ctx.lineTo(bb.max.x, y); ctx.stroke(); }
        ctx.restore();
      }
      if (meta.kind === 'roof' && !hc) {
        ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,0.06)';
        for (let x = bb.min.x; x < bb.max.x; x += 24) ctx.fillRect(x, bb.min.y, 12, bb.max.y - bb.min.y);
        ctx.restore();
      }
      // glowing top edge = walkable
      if (meta.kind !== 'wall') {
        ctx.strokeStyle = hc ? '#ffffff' : zc.edge; ctx.lineWidth = hc ? 4 : 3;
        ctx.shadowColor = zc.edge; ctx.shadowBlur = hc ? 0 : 10;
        ctx.beginPath(); ctx.moveTo(vs[0].x, vs[0].y); ctx.lineTo(vs[1].x, vs[1].y); ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (hc) { ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.stroke(); }
    }
  }

  private drawQuestStatics(ctx: CanvasRenderingContext2D, hc: boolean) {
    const g = this.game;
    // ---- Furnace gate + counterweight pan
    if (this.inView(450, 1600, 600, 650)) {
      const gb = g.gate.bounds, pb = g.pan.bounds;
      // pulley
      const px = 640, py = 1700;
      ctx.strokeStyle = '#c9a36b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gb.min.x + 20, gb.min.y); ctx.lineTo(px - 20, py); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 20, py); ctx.lineTo(pb.min.x + 100, pb.min.y - 130); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pb.min.x + 100, pb.min.y - 130); ctx.lineTo(pb.min.x + 10, pb.min.y); ctx.moveTo(pb.min.x + 100, pb.min.y - 130); ctx.lineTo(pb.max.x - 10, pb.min.y); ctx.stroke();
      ctx.fillStyle = '#3a2a20'; ctx.strokeStyle = '#ffae42'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px, py, 22, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(g.gateRise / 20) * 20, py + Math.sin(g.gateRise / 20) * 20); ctx.stroke();
      // gate
      ctx.fillStyle = hc ? '#555' : '#4a3426'; ctx.fillRect(gb.min.x, gb.min.y, gb.max.x - gb.min.x, gb.max.y - gb.min.y);
      ctx.strokeStyle = g.save.quests.A === 'done' ? '#7dff9a' : '#ffae42'; ctx.lineWidth = 2;
      for (let y = gb.min.y + 10; y < gb.max.y; y += 30) { ctx.beginPath(); ctx.moveTo(gb.min.x, y); ctx.lineTo(gb.max.x, y); ctx.stroke(); }
      ctx.strokeRect(gb.min.x, gb.min.y, gb.max.x - gb.min.x, gb.max.y - gb.min.y);
      // pan
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(pb.min.x, pb.min.y, pb.max.x - pb.min.x, 12);
      ctx.strokeStyle = '#ffae42'; ctx.strokeRect(pb.min.x, pb.min.y, pb.max.x - pb.min.x, 12);
      // gauge
      const w = g.panWeight, done = g.save.quests.A === 'done';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(700, 1930, 200, 50);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(done ? 'GATE LATCHED OPEN' : `PAN ${w.toFixed(1)}  vs  GATE 3.0`, 800, 1952);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = i < Math.floor(w) || done ? (i < 3 ? '#ffae42' : '#7dff9a') : '#333'; ctx.fillRect(720 + i * 42, 1962, 36, 10); }
    }
    // ---- seawall
    if (g.seawall && this.inView(Q.seawall.x - 50, Q.seawall.y, 200, 600)) {
      const s = Q.seawall;
      ctx.fillStyle = hc ? '#666' : '#4b5d73'; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = hc ? '#fff' : '#1b2738'; ctx.lineWidth = 2;
      for (let y = s.y; y < s.y + s.h; y += 40) { ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x + s.w, y); ctx.stroke(); }
      ctx.strokeStyle = '#ff7a59'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(s.x + 10, s.y + 200); ctx.lineTo(s.x + 30, s.y + 260); ctx.lineTo(s.x + 18, s.y + 320); ctx.lineTo(s.x + 40, s.y + 380); ctx.lineTo(s.x + 25, s.y + 450); ctx.stroke();
      ctx.fillStyle = '#ff7a59'; ctx.font = 'bold 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('CRACKED', s.x + s.w / 2, s.y + 180);
    }
    // ---- spring launcher + stomp + lever + preview arc
    if (this.inView(2650, 600, 1200, 450)) {
      const L = Q.launcher; const comp = 4 + g.launcherNotch * 4;
      ctx.strokeStyle = '#b48cff'; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const x = L.x + 10 + (i % 2) * (L.w - 20); const y = L.y + L.h + (i / 8) * (950 - L.y - L.h); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = '#3b2a5e'; ctx.fillRect(L.x, L.y, L.w, L.h); ctx.strokeRect(L.x, L.y, L.w, L.h);
      // lever
      const lx = L.x - 40, ang = -1.2 + g.launcherNotch * 0.6;
      ctx.strokeStyle = '#e0d0ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(lx, 950); ctx.lineTo(lx + Math.sin(ang) * 40, 950 - Math.cos(ang) * 40); ctx.stroke();
      ctx.fillStyle = '#ff5dd8'; ctx.beginPath(); ctx.arc(lx + Math.sin(ang) * 40, 950 - Math.cos(ang) * 40, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`NOTCH ${g.launcherNotch}/3  [E]`, lx, 890 - comp);
      // stomp pad
      const S = Q.stomp; const sp = g.stompPress * 6;
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(S.x, S.y + sp, S.w, S.h - sp);
      ctx.fillStyle = '#fff'; ctx.fillText('STOMP', S.x + S.w / 2, S.y - 8);
      // trajectory preview (projectile motion)
      if (g.zone === 'gardens' && !g.beaconLit) {
        const pts = g.launchPreview();
        ctx.fillStyle = 'rgba(200,170,255,0.55)';
        pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, 3 - i * 0.04 > 1 ? 3 - i * 0.04 : 1, 0, 7); ctx.fill(); });
      }
      // brazier
      const bx = Q.brazier.x;
      ctx.fillStyle = '#5a4630'; ctx.beginPath(); ctx.moveTo(bx - 50, 668); ctx.lineTo(bx + 50, 668); ctx.lineTo(bx + 36, 720); ctx.lineTo(bx - 36, 720); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 3; ctx.stroke();
      if (g.beaconLit) {
        for (let i = 0; i < 3; i++) {
          const fl = 40 + Math.sin(this.t * 9 + i) * 10;
          ctx.fillStyle = ['rgba(255,90,40,0.7)', 'rgba(255,170,60,0.75)', 'rgba(255,240,150,0.85)'][i];
          ctx.beginPath(); ctx.moveTo(bx - 30 + i * 10, 670); ctx.quadraticCurveTo(bx, 670 - fl * (1.6 - i * 0.3), bx + 30 - i * 10, 670); ctx.fill();
        }
        const bg = ctx.createRadialGradient(bx, 640, 5, bx, 640, 300); bg.addColorStop(0, 'rgba(255,200,90,0.35)'); bg.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.fillStyle = bg; ctx.fillRect(bx - 300, 340, 600, 600);
      } else { ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter, system-ui, sans-serif'; ctx.fillText('BRAZIER', bx, 655); }
    }
    // ---- Aether Core
    if (this.inView(Q.core.x - 200, Q.core.y - 300, 400, 300)) {
      const cx = Q.core.x, cy = Q.core.y;
      ctx.fillStyle = '#18323c'; ctx.beginPath(); ctx.moveTo(cx - 70, cy); ctx.lineTo(cx - 45, cy - 40); ctx.lineTo(cx + 45, cy - 40); ctx.lineTo(cx + 70, cy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#3ff0d0'; ctx.lineWidth = 2; ctx.stroke();
      const restored = g.save.coreRestored;
      const n = (['A', 'B', 'C'] as const).filter(k => g.save.quests[k] === 'done').length;
      const glow = restored ? 1 : 0.25 + n * 0.2;
      const cg = ctx.createRadialGradient(cx, cy - 110, 5, cx, cy - 110, 150 * glow + 40);
      cg.addColorStop(0, `rgba(122,247,255,${0.6 * glow})`); cg.addColorStop(1, 'rgba(122,247,255,0)');
      ctx.fillStyle = cg; ctx.fillRect(cx - 220, cy - 300, 440, 300);
      const bob = Math.sin(this.t * 2) * 6;
      if (restored || g.cutscene) {
        const sc = g.cutscene ? Math.min(1, g.cutscene.t) : 1;
        this.crystal(ctx, cx, cy - 110 + bob, 34 * (0.6 + 0.4 * sc), '#7af7ff', this.t);
      } else {
        // broken pieces orbit, one lights up per completed quest
        for (let i = 0; i < 3; i++) {
          const a = this.t * 0.8 + i * 2.094; const done = i < n;
          this.crystal(ctx, cx + Math.cos(a) * 46, cy - 110 + Math.sin(a) * 16 + bob, 14, done ? '#fff3a0' : '#33505a', a);
        }
      }
      ctx.fillStyle = '#e8fff9'; ctx.font = 'bold 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(restored ? 'AETHER CORE · ONLINE' : `AETHER CORE · ${n}/3`, cx, cy - 50);
    }
    if (g.cutscene) g.cutscene.t += 1 / 60;
    // ---- crown
    if (this.inView(3100, 150, 400, 250)) {
      const c = Q.crown;
      ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('SPIRE CROWN', c.x, c.y + 50);
      if (g.save.coreRestored) {
        const bg = ctx.createLinearGradient(c.x - 20, 0, c.x + 20, 0);
        bg.addColorStop(0, 'rgba(255,240,160,0)'); bg.addColorStop(0.5, `rgba(255,240,160,${g.save.ended ? 0.8 : 0.5 + 0.2 * Math.sin(this.t * 4)})`); bg.addColorStop(1, 'rgba(255,240,160,0)');
        ctx.fillStyle = bg; ctx.fillRect(c.x - 20, 0, 40, c.y);
      }
    }
  }

  private crystal(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, rot: number) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(rot) * 0.2);
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.6, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.6, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.25, -r * 0.1); ctx.lineTo(0, r * 0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawCheckpoints(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    for (const c of CHECKPOINTS) {
      if (!this.inView(c.x - 20, c.y - 120, 40, 120)) continue;
      const on = g.save.checkpoint === c.id;
      ctx.fillStyle = '#2b3a44'; ctx.fillRect(c.x - 3, c.y - 100, 6, 100);
      ctx.fillStyle = on ? '#7af7ff' : '#45606b';
      ctx.shadowColor = '#7af7ff'; ctx.shadowBlur = on ? 20 : 0;
      ctx.beginPath(); ctx.arc(c.x, c.y - 106, 9, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
  }

  private drawSigns(ctx: CanvasRenderingContext2D, hc: boolean) {
    ctx.font = 'bold 14px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const s of SIGNS) {
      if (!this.inView(s.x - 100, s.y - 90, 200, 90)) continue;
      const w = ctx.measureText(s.text).width + 20;
      ctx.fillStyle = '#2b3a44'; ctx.fillRect(s.x - 3, s.y - 50, 6, 50);
      ctx.fillStyle = hc ? '#000' : '#0b1b22'; ctx.strokeStyle = hc ? '#fff' : '#9fe'; ctx.lineWidth = 2;
      ctx.fillRect(s.x - w / 2, s.y - 80, w, 30); ctx.strokeRect(s.x - w / 2, s.y - 80, w, 30);
      ctx.fillStyle = '#fff'; ctx.fillText(s.text, s.x, s.y - 60);
    }
  }

  private drawNpcs(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    for (const n of NPCS) {
      if (!this.inView(n.x - 40, n.y - 120, 80, 120)) continue;
      const bob = Math.sin(this.t * 2 + n.x) * 2;
      ctx.fillStyle = '#1e2a33'; ctx.beginPath(); ctx.roundRect(n.x - 16, n.y - 60 + bob, 32, 60 - bob, 10); ctx.fill();
      ctx.fillStyle = n.color; ctx.fillRect(n.x - 16, n.y - 40 + bob, 32, 5);
      ctx.fillStyle = '#d9c3a5'; ctx.beginPath(); ctx.arc(n.x, n.y - 72 + bob, 13, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; const look = Math.sign(g.pos.x - n.x) * 4; ctx.fillRect(n.x - 5 + look, n.y - 75 + bob, 3, 4); ctx.fillRect(n.x + 3 + look, n.y - 75 + bob, 3, 4);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(n.name, n.x, n.y - 96 + bob);
      const near = Math.abs(g.pos.x - n.x) < 80 && Math.abs(g.pos.y - (n.y - 30)) < 70;
      if (!g.save.talked.includes(n.id)) { ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 22px Inter, system-ui, sans-serif'; ctx.fillText('!', n.x, n.y - 112 + Math.sin(this.t * 5) * 3); }
      else if (near) { ctx.fillStyle = '#9fe'; ctx.fillText('[E] Talk', n.x, n.y - 112); }
    }
  }

  private drawSprings(ctx: CanvasRenderingContext2D) {
    Q.springPads.forEach((s, i) => {
      if (!this.inView(s.x - 40, s.y - 40, 80, 40)) return;
      const c = this.game.springAnim[i];
      const h = 18 + c * 14;
      ctx.strokeStyle = '#7af7ff'; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 0; k <= 6; k++) { const x = s.x - 24 + (k % 2) * 48; const y = s.y - (k / 6) * h; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = '#7af7ff'; ctx.shadowColor = '#7af7ff'; ctx.shadowBlur = 12; ctx.fillRect(s.x - 32, s.y - h - 6, 64, 6); ctx.shadowBlur = 0;
    });
  }

  private drawProps(ctx: CanvasRenderingContext2D, hc: boolean) {
    const g = this.game;
    // wrecking ball chain
    const bp = Q.ballPivot, bb = g.ball.body.position;
    ctx.strokeStyle = '#9aa8b8'; ctx.lineWidth = 4; ctx.setLineDash([10, 6]);
    ctx.beginPath(); ctx.moveTo(bp.x, bp.y); ctx.lineTo(bb.x, bb.y); ctx.stroke(); ctx.setLineDash([]);
    for (const p of g.props) {
      const b = p.body; const pos = b.position;
      if (!this.inView(pos.x - 60, pos.y - 60, 120, 120)) continue;
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(b.angle);
      const s = p.size / 2;
      if (p.type === 'light') {
        ctx.fillStyle = hc ? '#c08040' : '#8a5a2b'; ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.strokeStyle = '#d9a066'; ctx.lineWidth = 4; ctx.strokeRect(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4);
        ctx.beginPath(); ctx.moveTo(-s + 4, -s + 4); ctx.lineTo(s - 4, s - 4); ctx.moveTo(s - 4, -s + 4); ctx.lineTo(-s + 4, s - 4); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1', 0, 5);
      } else if (p.type === 'iron') {
        ctx.fillStyle = hc ? '#999' : '#56606b'; ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.strokeStyle = '#9aa8b8'; ctx.lineWidth = 3; ctx.strokeRect(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4);
        ctx.fillStyle = '#c8d2dc'; for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(rx * (s - 9), ry * (s - 9), 3, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('IRON 2', 0, 5);
      } else if (p.type === 'orb') {
        ctx.rotate(-b.angle);
        const og = ctx.createRadialGradient(0, 0, 2, 0, 0, 34); og.addColorStop(0, '#fff'); og.addColorStop(0.4, '#c59bff'); og.addColorStop(1, 'rgba(180,140,255,0)');
        ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill();
        ctx.fillStyle = '#e6d6ff'; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.fill();
      } else if (p.type === 'ball') {
        const bg = ctx.createRadialGradient(-12, -14, 4, 0, 0, s); bg.addColorStop(0, '#8a96a6'); bg.addColorStop(1, '#262d36');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffcf5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, s - 3, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
    // debris
    ctx.fillStyle = '#4b5d73';
    for (const d of g.debris) {
      const vs = d.body.vertices; ctx.beginPath(); ctx.moveTo(vs[0].x, vs[0].y); for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y); ctx.closePath(); ctx.fill();
    }
    // throw preview
    const tp = g.throwPreview();
    if (tp) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; for (const p of tp) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); } }
  }

  private drawShards(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    for (const s of SHARDS) {
      if (g.save.shards.includes(s.id) || !this.inView(s.x - 30, s.y - 30, 60, 60)) continue;
      const bob = Math.sin(this.t * 3 + s.x) * 5;
      const gg = ctx.createRadialGradient(s.x, s.y + bob, 2, s.x, s.y + bob, 36); gg.addColorStop(0, 'rgba(122,247,255,0.5)'); gg.addColorStop(1, 'rgba(122,247,255,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(s.x, s.y + bob, 36, 0, 7); ctx.fill();
      this.crystal(ctx, s.x, s.y + bob, 13, '#7af7ff', this.t * 2 + s.x);
    }
  }

  private drawFragments(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    for (const f of g.fragments) {
      if (f.taken && !f.fly) continue;
      if (f.id === 'C' && !g.beaconLit) continue;
      let x = f.x, y = f.y + Math.sin(this.t * 2.5) * 6, sc = 1;
      if (f.fly) { const k = Math.min(1, f.fly.t / 1.2); const e = k * k; x = f.fly.sx + (g.pos.x - f.fly.sx) * e; y = f.fly.sy + (g.pos.y - f.fly.sy) * e - Math.sin(k * Math.PI) * 80; sc = 1 - k * 0.7; }
      const gg = ctx.createRadialGradient(x, y, 2, x, y, 60); gg.addColorStop(0, 'rgba(255,243,160,0.6)'); gg.addColorStop(1, 'rgba(255,243,160,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 60, 0, 7); ctx.fill();
      this.crystal(ctx, x, y, 22 * sc, '#fff3a0', this.t);
      if (!f.taken) { ctx.fillStyle = '#fff3a0'; ctx.font = 'bold 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('AETHER FRAGMENT', x, y - 40); }
    }
  }

  private drawAnchors(ctx: CanvasRenderingContext2D, hc: boolean) {
    const g = this.game; const p = g.pos;
    for (const a of ANCHORS) {
      if (!this.inView(a.x - 20, a.y - 20, 40, 40)) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      const inRange = d < 500;
      ctx.strokeStyle = inRange ? (hc ? '#fff' : '#bff8ff') : 'rgba(150,200,220,0.35)'; ctx.lineWidth = 3;
      ctx.shadowColor = '#7af7ff'; ctx.shadowBlur = inRange && !hc ? 12 : 0;
      ctx.beginPath(); ctx.arc(a.x, a.y, 9, 0, 7); ctx.stroke();
      ctx.fillStyle = inRange ? '#7af7ff' : 'rgba(120,160,180,0.4)'; ctx.beginPath(); ctx.arc(a.x, a.y, 3.5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }
    // target reticle
    const t = g.target;
    if (t && (!g.tether || Math.hypot(t.x - g.tether.x, t.y - g.tether.y) > 5)) {
      const r = (t.body ? 34 : 20) + Math.sin(this.t * 8) * 3;
      ctx.strokeStyle = hc ? '#ffff00' : '#ffe066'; ctx.lineWidth = 3;
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(this.t * 2);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r, i * Math.PI / 2 + 0.25, i * Math.PI / 2 + 1.2); ctx.stroke(); }
      ctx.restore();
    }
    // fail feedback
    const f = g.failFx;
    if (f) {
      const a = f.t / 0.45;
      ctx.strokeStyle = `rgba(255,93,108,${a})`; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.setLineDash([]);
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(f.x2 - 10, f.y2 - 10); ctx.lineTo(f.x2 + 10, f.y2 + 10); ctx.moveTo(f.x2 + 10, f.y2 - 10); ctx.lineTo(f.x2 - 10, f.y2 + 10); ctx.stroke();
      ctx.fillStyle = `rgba(255,93,108,${a})`; ctx.font = 'bold 13px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('NO ANCHOR', f.x2, f.y2 - 16);
    }
  }

  private drawTether(ctx: CanvasRenderingContext2D) {
    const g = this.game, t = g.tether;
    if (!t) return;
    const o = { x: g.pos.x, y: g.pos.y - 12 };
    const d = Math.hypot(t.x - o.x, t.y - o.y);
    const slack = Math.max(0, t.len - d);
    const ten = Math.min(1, t.tension * 6);
    const col = t.charging ? `rgb(255,${200 - ten * 120},${120 - ten * 80})` : `rgb(${200 + ten * 55},${255 - ten * 60},255)`;
    ctx.strokeStyle = col; ctx.lineWidth = 3 + (t.charging ? 1 : 0);
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(o.x, o.y);
    ctx.quadraticCurveTo((o.x + t.x) / 2, (o.y + t.y) / 2 + Math.min(120, slack * 0.7), t.x, t.y); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, 7); ctx.fill();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, hc: boolean) {
    const g = this.game, p = g.pos, v = g.player.velocity;
    const f = g.facing;
    ctx.save(); ctx.translate(p.x, p.y);
    const lean = Math.max(-0.25, Math.min(0.25, v.x * 0.025));
    ctx.rotate(lean);
    const squash = g.landFx * 0.12;
    ctx.scale(1 + squash, 1 - squash);
    // scarf trailing behind velocity
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -18);
    const sx = -v.x * 2.2 - f * 10, sy = -v.y * 1.2 + 6;
    ctx.quadraticCurveTo(sx * 0.5, -18 + sy * 0.3 + Math.sin(this.t * 12) * 3, sx, -14 + sy + Math.sin(this.t * 10) * 4);
    ctx.stroke();
    // legs
    const run = g.grounded ? Math.sin(g.runPhase) * 9 : 6;
    ctx.strokeStyle = hc ? '#fff' : '#1b2a4a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-6, 12); ctx.lineTo(-6 + run, 28); ctx.moveTo(6, 12); ctx.lineTo(6 - run, 28); ctx.stroke();
    // body
    ctx.fillStyle = hc ? '#0050ff' : '#203a6b'; ctx.beginPath(); ctx.roundRect(-14, -22, 28, 38, 10); ctx.fill();
    ctx.strokeStyle = '#7af7ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.moveTo(0, -20); ctx.lineTo(0, 14); ctx.stroke();
    // arm (towards tether when attached)
    ctx.strokeStyle = hc ? '#fff' : '#203a6b'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -12);
    if (g.tether) { const a = Math.atan2(g.tether.y - (p.y - 12), g.tether.x - p.x) - lean; ctx.lineTo(Math.cos(a) * 18, -12 + Math.sin(a) * 18); }
    else if (g.carry) ctx.lineTo(0, -32);
    else ctx.lineTo(f * 10, 4 + Math.sin(g.runPhase) * 3);
    ctx.stroke();
    // head + visor
    ctx.fillStyle = hc ? '#0050ff' : '#203a6b'; ctx.beginPath(); ctx.arc(0, -32, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#7af7ff'; ctx.shadowColor = '#7af7ff'; ctx.shadowBlur = hc ? 0 : 10;
    ctx.beginPath(); ctx.ellipse(f * 5, -33, 7, 4, 0, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
    // respawn hold ring
    if (g.respawnHold > 0) {
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 44, -Math.PI / 2, -Math.PI / 2 + (g.respawnHold / 0.6) * Math.PI * 2); ctx.stroke();
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D, back: boolean) {
    const x0 = Q.waterX, x1 = WORLD_W - 60, y = Q.waterY;
    if (!this.inView(x0, y - 50, x1 - x0, 400)) return;
    ctx.fillStyle = back ? 'rgba(20,60,110,0.9)' : 'rgba(60,140,210,0.35)';
    ctx.beginPath(); ctx.moveTo(x0, WORLD_H);
    for (let x = x0; x <= x1; x += 20) ctx.lineTo(x, y + Math.sin(x * 0.02 + this.t * (back ? 1.5 : 2.2)) * (back ? 4 : 6) + (back ? -4 : 0));
    ctx.lineTo(x1, WORLD_H); ctx.closePath(); ctx.fill();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const q of this.game.particles) {
      const a = 1 - q.life / q.max;
      ctx.globalAlpha = a; ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
    // surge motes
    if (this.game.surge.active > 0 && !this.settings().reducedMotion) {
      ctx.fillStyle = 'rgba(200,160,255,0.6)';
      for (let i = 0; i < 40; i++) {
        const x = this.cam.x + ((i * 137.5 + this.t * 20) % this.viewW);
        const y = this.cam.y + this.viewH - ((i * 89 + this.t * 60 * (1 + (i % 3))) % this.viewH);
        ctx.fillRect(x, y, 3, 3);
      }
    }
  }

  private drawDebug(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const all = Matter_allBodies(g);
    ctx.lineWidth = 1.5;
    for (const b of all) {
      const bb = b.bounds;
      if (!this.inView(bb.min.x, bb.min.y, bb.max.x - bb.min.x, bb.max.y - bb.min.y)) continue;
      ctx.strokeStyle = b === g.player ? '#00ffff' : b.isStatic ? 'rgba(0,255,120,0.8)' : '#ffd000';
      const vs = b.vertices; ctx.beginPath(); ctx.moveTo(vs[0].x, vs[0].y); for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x, vs[i].y); ctx.closePath(); ctx.stroke();
      if (!b.isStatic) {
        // velocity vector (x6)
        const v = b.velocity; this.arrow(ctx, b.position.x, b.position.y, b.position.x + v.x * 6, b.position.y + v.y * 6, '#ff40ff');
        ctx.fillStyle = '#fff'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`m=${b.mass.toFixed(1)} |v|=${Math.hypot(v.x, v.y).toFixed(1)}`, bb.max.x + 4, bb.min.y);
      }
    }
    // gravity arrow on player
    const p = g.pos;
    this.arrow(ctx, p.x, p.y, p.x, p.y + 40 * g.gravityScale, '#40ff40');
    // tether
    if (g.tether) {
      const t = g.tether; const o = { x: p.x, y: p.y - 12 }; const d = Math.hypot(t.x - o.x, t.y - o.y);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(t.x, t.y, t.len, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      const fx = (t.x - o.x) / d, fy = (t.y - o.y) / d; const F = Math.min(120, t.tension * 600);
      this.arrow(ctx, o.x, o.y, o.x + fx * F, o.y + fy * F, '#ff8040');
      ctx.fillStyle = '#ffb080'; ctx.font = '12px monospace'; ctx.fillText(`rest L=${t.len.toFixed(0)}  d=${d.toFixed(0)}  stretch=${(t.tension * 100).toFixed(1)}%`, o.x + 20, o.y + 40);
    }
    // tether range
    ctx.strokeStyle = 'rgba(122,247,255,0.15)'; ctx.beginPath(); ctx.arc(p.x, p.y - 12, 500, 0, 7); ctx.stroke();
    // grounded probe
    ctx.fillStyle = g.grounded ? '#0f0' : '#f00'; ctx.fillRect(p.x - 17, p.y + 30, 34, 3);
    // lift / spring regions
    ctx.strokeStyle = 'rgba(122,247,255,0.6)'; ctx.strokeRect(Q.lift.x, Q.lift.y, Q.lift.w, Q.lift.h);
    ctx.fillStyle = '#ffd000'; ctx.font = '12px monospace';
    ctx.fillText(`pan weight=${g.panWeight.toFixed(1)} gateRise=${g.gateRise.toFixed(0)}`, Q.pan.x, Q.pan.y - 90);
  }
  private arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, c: string) {
    ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    if (Math.hypot(x2 - x1, y2 - y1) > 6) { ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - Math.cos(a - 0.4) * 8, y2 - Math.sin(a - 0.4) * 8); ctx.lineTo(x2 - Math.cos(a + 0.4) * 8, y2 - Math.sin(a + 0.4) * 8); ctx.fill(); }
  }
}

function Matter_allBodies(g: Game) { return (g.engine.world.bodies as Matter.Body[]); }
