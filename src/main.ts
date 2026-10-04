import Matter from 'matter-js';
import { Game, STEP_MS } from './game';
import { Renderer } from './render';
import { Input, keyLabel } from './input';
import { Audio } from './audio';
import { SHARDS, CHECKPOINTS, ZONES, NPCS } from './level';
import { ACTIONS, type Action, type Settings, loadSave, loadSettings, writeSettings, newSave, clearSave, writeSave, DEFAULT_BINDINGS, SAVE_KEY } from './save';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('c') as HTMLCanvasElement;
let settings: Settings = loadSettings();
const S = () => settings;
const input = new Input(S, canvas);
const audio = new Audio(S);

type State = 'title' | 'intro' | 'play' | 'ending';
let state: State = 'title';
let paused = false;
const overlays = ['pause', 'settings', 'controls', 'confirm'];

// ------------------------------------------------------------------ UI hooks
const toastsEl = $('toasts');
function toast(msg: string, kind: 'info' | 'good' | 'warn' | 'bad' | 'quest' = 'info') {
  const d = document.createElement('div'); d.className = 'toast ' + kind; d.textContent = msg;
  toastsEl.appendChild(d);
  while (toastsEl.children.length > 4) toastsEl.firstChild!.remove();
  setTimeout(() => d.remove(), kind === 'quest' ? 5500 : 3600);
}
let bannerTimer = 0;
function banner(t: string, s: string, color: string) {
  $('bannerT').textContent = t; ($('bannerT') as HTMLElement).style.color = color; $('bannerS').textContent = s;
  $('banner').style.opacity = '1';
  clearTimeout(bannerTimer); bannerTimer = window.setTimeout(() => ($('banner').style.opacity = '0'), 2600);
}
let dlg: { name: string; lines: string[]; i: number; color: string; t: number } | null = null;
function dialog(name: string, lines: string[], color: string) {
  dlg = { name, lines, i: 0, color, t: 0 }; showDlg();
}
function showDlg() {
  if (!dlg) { $('dialog').classList.add('hidden'); return; }
  $('dialog').classList.remove('hidden');
  $('dlgWho').textContent = dlg.name; ($('dlgWho') as HTMLElement).style.color = dlg.color;
  $('dlgLine').textContent = dlg.lines[dlg.i];
  audio.play('talk');
}
function advanceDlg() { if (!dlg) return; dlg.i++; dlg.t = 0; if (dlg.i >= dlg.lines.length) dlg = null; showDlg(); }
$('dialog').addEventListener('click', advanceDlg);

const game = new Game(input, audio, S, { toast, dialog, banner, refresh: refreshHud, ending: showEnding });
const renderer = new Renderer(canvas, game, S);
renderer.resize();
window.addEventListener('resize', () => renderer.resize());

// ------------------------------------------------------------------ HUD
const QINFO = {
  A: { name: 'Furnace Gate', zone: 'The Foundry', desc: 'The furnace gate is tied by pulley to a counterweight pan. Load the pan heavier than the gate (3 units) to lift it, then grab the fragment. Crates = 1, iron = 2, you = 1.', tags: ['Weight / counterweight', 'Momentum (haul the iron block down)'], multi: 'Multiple solutions: 3 crates · iron + crate · any mix ≥ 3' },
  B: { name: 'Break the Seawall', zone: 'Frozen Docks', desc: 'A cracked seawall seals the pier. Only a heavy object with enough momentum (mass × speed ≥ 85) can break it.', tags: ['Pendulum', 'Momentum / impulse', 'Friction (ice)'], multi: 'Multiple solutions: swing the wrecking ball · slide the iron crate down the frictionless ice' },
  C: { name: 'Light the Beacon', zone: 'Sky Gardens', desc: 'Deliver the Aether Orb into the brazier on the beacon tower across the chasm.', tags: ['Springs / elastic', 'Projectile motion'], multi: 'Multiple solutions: spring launcher arc · carry it across on your web · throw it' },
  F: { name: 'Reignite the Core', zone: 'Aether Plaza → Spire Crown', desc: 'Return all three fragments to the Aether Core, then ride its gravity lift to the Spire Crown.', tags: ['Gravity field'], multi: '' },
};

function objectiveText(): string {
  const s = game.save;
  if (s.ended) return `The city is restored! Echo Shards ${s.shards.length}/${SHARDS.length}. Keep exploring.`;
  if (s.coreRestored) return 'Ride the gravity lift above the Core up to the Spire Crown, then touch the beam.';
  if (game.questsCoreDone()) return 'All fragments found! Bring them to the Aether Core in the Plaza.';
  const n = (['A', 'B', 'C'] as const).filter(k => s.quests[k] === 'done').length;
  const zq: Record<string, 'A' | 'B' | 'C'> = { foundry: 'A', docks: 'B', gardens: 'C' };
  const q = zq[game.zone];
  if (q && s.quests[q] !== 'done') {
    const hints = { A: 'Furnace Gate: load the counterweight pan with 3+ weight (crate = 1, iron = 2).', B: 'Break the Seawall: hit it with something heavy, momentum 85+.', C: 'Light the Beacon: get the Aether Orb into the tower brazier.' };
    return `Fragments ${n}/3 · ${hints[q]}`;
  }
  const left = (['A', 'B', 'C'] as const).filter(k => s.quests[k] !== 'done').map(k => QINFO[k].zone);
  return `Recover the Aether Fragments (${n}/3). Still lost in: ${left.join(', ')}.`;
}

function refreshHud() {
  $('objTxt').textContent = objectiveText();
  const zd = ZONES.find(z => z.id === game.zone)!;
  $('zoneTxt').textContent = `📍 ${zd.name}`;
  $('fragIcons').innerHTML = (['A', 'B', 'C'] as const).map(k => `<i class="frag ${game.save.quests[k] === 'done' ? 'on' : ''}" title="${QINFO[k].name}"></i>`).join(' ') + ' <span class="small">Fragments</span>';
  $('shardTxt').textContent = `${game.save.shards.length}/${SHARDS.length}`;
  if (!$('journal').classList.contains('hidden')) renderJournal();
}

function k(a: Action) { return settings.bindings[a].map(c => `<kbd>${keyLabel(c)}</kbd>`).join(' '); }
let lastHint = '';
function updateHint() {
  let h: string;
  if (game.tether) h = `${k('up')}/${k('down')} reel · ${k('left')}${k('right')} pump · ${k('slingshot')} hold = slingshot · ${k('jump')} release+boost · ${k('tether')} release`;
  else if (game.carry) h = `${k('throw')} throw (follow the arc) · ${k('grab')} drop · ${k('tether')} tether still works`;
  else {
    h = `${k('left')}${k('right')} move · ${k('jump')} jump · ${k('tether')} or click: web tether · ${k('grab')} grab/talk · ${k('journal')} journal · ${k('pause')} menu`;
    if (game.target?.prop) h = `Yellow reticle on an object: ${k('tether')} to tether it, then ${k('up')} to haul it · ` + h;
  }
  if (h !== lastHint) { $('hint').innerHTML = h; lastHint = h; }
  const tn = $('tension');
  if (game.tether && game.tether.tension > 0.01) { tn.classList.remove('hidden'); (tn.firstElementChild as HTMLElement).style.width = Math.min(100, game.tether.tension * 300) + '%'; }
  else tn.classList.add('hidden');
}

function renderJournal() {
  const s = game.save;
  let h = `<h3 class="disp">Journal</h3><div class="small">Press ${k('journal')} to close. The game keeps running.</div>`;
  for (const id of ['A', 'B', 'C', 'F'] as const) {
    const q = QINFO[id], st = s.quests[id];
    h += `<div class="q ${st}"><div class="t">${st === 'done' ? '✔' : st === 'locked' ? '🔒' : '◇'} ${q.name} <span class="small">· ${q.zone}</span></div>
      <div class="small" style="margin-top:3px">${st === 'locked' ? 'Unlocks when all three Aether Fragments are recovered.' : q.desc}</div>
      <div class="tags">${q.tags.map(t => `<span>${t}</span>`).join('')}${q.multi ? `<span class="multi">${q.multi}</span>` : ''}${q.tags.length > 1 ? '<span class="multi">Combines physics ideas</span>' : ''}</div></div>`;
  }
  h += `<div class="q"><div class="t">Echo Shards ${s.shards.length}/${SHARDS.length}</div><div class="small">`;
  h += SHARDS.map(sh => `${s.shards.includes(sh.id) ? '✔' : '◇'} ${sh.hint}`).join('<br/>') + '</div></div>';
  $('journal').innerHTML = h;
}
function toggleJournal(force?: boolean) {
  const j = $('journal'); const show = force ?? j.classList.contains('hidden');
  j.classList.toggle('hidden', !show); if (show) renderJournal();
}

// ------------------------------------------------------------------ settings
function applySettings() {
  document.documentElement.classList.toggle('hc', settings.highContrast);
  document.documentElement.classList.toggle('rm', settings.reducedMotion);
  document.documentElement.style.setProperty('--ts', String(settings.textScale));
  $('debugInfo').classList.toggle('hidden', !settings.debug);
  audio.applyVolumes();
  writeSettings(settings);
  lastHint = '';
}
function renderSettings() {
  const b = $('settingsBody');
  const sl = (key: 'master' | 'music' | 'sfx', label: string) => `<label for="s_${key}">${label}</label><input id="s_${key}" type="range" min="0" max="1" step="0.05" value="${settings[key]}">`;
  const cb = (key: keyof Settings, label: string) => `<label for="s_${String(key)}">${label}</label><input id="s_${String(key)}" type="checkbox" ${settings[key] ? 'checked' : ''}>`;
  b.innerHTML = `<div class="set">
    ${sl('master', 'Master volume')}${sl('music', 'Music volume')}${sl('sfx', 'Effects volume')}
    ${cb('muted', 'Mute all audio')}
    ${cb('reducedMotion', 'Reduced motion (no shake, fewer particles)')}
    ${cb('highContrast', 'High-contrast mode')}
    <label for="s_textScale">Text size</label><input id="s_textScale" type="range" min="0.8" max="1.6" step="0.1" value="${settings.textScale}">
    ${cb('surges', 'Aether Surges (low-gravity world events)')}
    ${cb('debug', 'Physics debug view (F3)')}
    <label for="s_fps">Frame-rate cap (physics is fixed 60 Hz)</label><select id="s_fps"><option value="0">Uncapped</option><option value="60">60 FPS</option><option value="30">30 FPS</option></select>
  </div>
  <h3>Key bindings</h3><div class="small" style="margin-bottom:8px">Click a binding, then press the new key. Esc cancels.</div>
  <div class="keys">${ACTIONS.map(a => `<span>${a}</span><button data-act="${a}">${settings.bindings[a].map(keyLabel).join(' / ')}</button>`).join('')}</div>
  <button id="resetKeys" style="margin-top:10px;width:100%">Reset key bindings</button>`;
  ($('s_fps') as HTMLSelectElement).value = String(settings.fpsCap);
  for (const key of ['master', 'music', 'sfx', 'textScale'] as const) $('s_' + key).addEventListener('input', e => { (settings as any)[key] = parseFloat((e.target as HTMLInputElement).value); applySettings(); });
  for (const key of ['muted', 'reducedMotion', 'highContrast', 'surges', 'debug'] as const) $('s_' + key).addEventListener('change', e => { (settings as any)[key] = (e.target as HTMLInputElement).checked; applySettings(); });
  $('s_fps').addEventListener('change', e => { settings.fpsCap = parseInt((e.target as HTMLSelectElement).value) as 0 | 30 | 60; applySettings(); });
  b.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach(btn => btn.addEventListener('click', () => {
    const act = btn.dataset.act as Action; btn.textContent = 'Press a key…';
    input.onKeyCapture = code => {
      if (code !== 'Escape') {
        for (const a of ACTIONS) settings.bindings[a] = settings.bindings[a].filter(c => c !== code);
        settings.bindings[act] = [code, ...settings.bindings[act].filter(c => c !== code)].slice(0, 2);
        for (const a of ACTIONS) if (!settings.bindings[a].length) settings.bindings[a] = [...DEFAULT_BINDINGS[a]].slice(0, 1);
        applySettings();
      }
      renderSettings();
    };
  }));
  $('resetKeys').addEventListener('click', () => { settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); applySettings(); renderSettings(); });
}
function renderControls() {
  $('controlsBody').innerHTML = `<div class="ctrl">
    <span>${k('left')} ${k('right')}</span><span>Run (momentum carries, ice has no grip)</span>
    <span>${k('jump')} ${k('up')}</span><span>Jump (hold for higher, one jump only)</span>
    <span>${k('tether')} / Left-click</span><span>Fire web tether at the highlighted anchor or object (click aims with the mouse)</span>
    <span>${k('up')} ${k('down')}</span><span>Reel the tether in / out (haul objects toward you)</span>
    <span>${k('left')} ${k('right')} (swinging)</span><span>Pump the swing to build momentum</span>
    <span>${k('jump')} (swinging)</span><span>Release with an upward boost, then re-attach mid-air</span>
    <span>${k('slingshot')} (hold)</span><span>Elastic slingshot: overcharge the web, then release to launch</span>
    <span>${k('grab')}</span><span>Grab / drop light crates and the orb · talk · launcher lever</span>
    <span>${k('throw')}</span><span>Throw what you carry along the dotted arc</span>
    <span>${k('respawn')} (hold)</span><span>Respawn at the last checkpoint</span>
    <span>${k('journal')}</span><span>Journal: quests, physics and shards</span>
    <span>${k('pause')}</span><span>Pause menu: settings, reset puzzle, new game</span>
    <span>${k('debug')}</span><span>Physics debug view</span>
  </div><p class="small">Gamepad: left stick move · A jump · RB/RT tether · X grab · Y throw · LB/LT slingshot · Start pause.</p>`;
}

function openOverlay(id: string) { overlays.forEach(o => $(o).classList.add('hidden')); $(id).classList.remove('hidden'); }
function closeOverlays() { overlays.forEach(o => $(o).classList.add('hidden')); }
let returnTo: string | null = null;
function openSettings(from: string | null) { returnTo = from; renderSettings(); if (from) $(from).classList.add('hidden'); $('settings').classList.remove('hidden'); }
function openControls(from: string | null) { returnTo = from; renderControls(); if (from) $(from).classList.add('hidden'); $('controls').classList.remove('hidden'); }
$('setClose').addEventListener('click', () => { $('settings').classList.add('hidden'); if (returnTo) $(returnTo).classList.remove('hidden'); });
$('ctlClose').addEventListener('click', () => { $('controls').classList.add('hidden'); if (returnTo) $(returnTo).classList.remove('hidden'); });

function setPaused(p: boolean) {
  if (state !== 'play') return;
  paused = p; game.paused = p;
  if (p) openOverlay('pause'); else { closeOverlays(); canvas.focus(); }
}

let confirmCb: (() => void) | null = null;
function confirmBox(text: string, cb: () => void, from: string | null) {
  $('cfText').textContent = text; confirmCb = cb; returnTo = from;
  if (from) $(from).classList.add('hidden');
  $('confirm').classList.remove('hidden');
}
$('cfNo').addEventListener('click', () => { $('confirm').classList.add('hidden'); if (returnTo) $(returnTo).classList.remove('hidden'); });
$('cfYes').addEventListener('click', () => { $('confirm').classList.add('hidden'); confirmCb?.(); });

// ------------------------------------------------------------------ flow
const validShards = SHARDS.map(s => s.id), validCps = CHECKPOINTS.map(c => c.id);
function refreshTitle() {
  const r = loadSave(validShards, validCps);
  const has = r.status === 'ok';
  $('btnContinue').classList.toggle('hidden', !has);
  if (r.status === 'ok') {
    const d = r.data; const n = (['A', 'B', 'C'] as const).filter(q => d.quests[q] === 'done').length;
    $('saveInfo').textContent = `Saved game: ${n}/3 fragments · ${d.shards.length}/8 shards · ${fmtTime(d.playTime)} played${d.ended ? ' · city restored' : ''}`;
  } else $('saveInfo').textContent = r.status === 'invalid' ? 'Saved data was unreadable, so New Game will start fresh.' : 'No saved game yet.';
}
function fmtTime(s: number) { const m = Math.floor(s / 60); return `${m}m ${Math.floor(s % 60).toString().padStart(2, '0')}s`; }

function startPlay() {
  state = 'play'; paused = false; game.paused = false;
  $('title').classList.add('hidden'); $('intro').classList.add('hidden'); $('ending').classList.add('hidden');
  $('hud').classList.remove('hidden');
  refreshHud(); renderer.updateCamera(true); canvas.focus();
}

function continueGame() {
  audio.unlock();
  const r = loadSave(validShards, validCps);
  if (r.status !== 'ok') { if (r.status === 'invalid') toast('Saved data was invalid, so a fresh game was started safely.', 'warn'); newGame(); return; }
  game.loadFrom(r.data);
  startPlay();
  toast('Welcome back! Progress restored.', 'good');
}

function newGame() {
  audio.unlock();
  clearSave();
  const s = newSave();
  game.loadFrom(s);
  game.persist();
  showIntro();
}

const INTRO = [
  '<h2 class="disp">The Surge</h2><p>Last night an energy surge tore through the city and cracked the <b style="color:#7af7ff">Aether Core</b>, the crystal that powers every district.</p><p>Its three <b style="color:#ffe066">Aether Fragments</b> were flung into the Foundry, the Frozen Docks and the Sky Gardens.</p>',
  '<h2 class="disp">The Web-Slinger</h2><p>Bridges are down and the streets are broken. Walking won\'t get you far, but your <b>web tether</b> will.</p><p>Swing on glowing anchors, haul crates, throw, launch and smash. <b>Momentum, gravity, springs and weight</b> are your tools.</p>',
  '<h2 class="disp">Your Task</h2><p>Recover the three fragments in <b>any order</b>, return them to the Core in Aether Plaza, and climb to the Spire Crown.</p><p>Collect the 8 hidden <b style="color:#7af7ff">Echo Shards</b> along the way. Progress saves automatically.</p><p class="small">Press <kbd>J</kbd> for the journal · <kbd>Esc</kbd> for the menu.</p>',
];
let introI = 0;
function showIntro() {
  state = 'intro'; introI = 0;
  $('title').classList.add('hidden'); $('ending').classList.add('hidden'); $('intro').classList.remove('hidden');
  $('introBody').innerHTML = INTRO[0];
}
function nextIntro() {
  introI++;
  if (introI >= INTRO.length) return endIntro();
  $('introBody').innerHTML = INTRO[introI];
  audio.play('ui');
}
function endIntro() {
  game.save.introSeen = true; game.persist();
  startPlay();
  banner('Aether Plaza', 'Heart of the city', '#3ff0d0');
  setTimeout(() => { const m = NPCS.find(n => n.id === 'mayor')!; game.talk(m); }, 900);
}
$('introNext').addEventListener('click', nextIntro);
$('introSkip').addEventListener('click', endIntro);

function showEnding() {
  state = 'ending';
  const s = game.save;
  $('endStats').innerHTML = `<span>Time</span><b>${fmtTime(s.playTime)}</b><span>Aether Fragments</span><b>3 / 3</b><span>Echo Shards</span><b>${s.shards.length} / ${SHARDS.length}</b><span>Web swings</span><b>${game.stats.swings}</b><span>Top speed</span><b>${(game.stats.maxSpeed * 60).toFixed(0)} px/s</b><span>Respawns</span><b>${s.respawns}</b>`;
  $('ending').classList.remove('hidden');
}
$('endKeep').addEventListener('click', () => { $('ending').classList.add('hidden'); state = 'play'; refreshHud(); canvas.focus(); });
$('endNew').addEventListener('click', () => { $('ending').classList.add('hidden'); newGame(); });

$('btnContinue').addEventListener('click', continueGame);
$('btnNew').addEventListener('click', () => {
  const r = loadSave(validShards, validCps);
  if (r.status === 'ok') confirmBox('Start a new game? Your saved progress will be erased.', newGame, 'title'); else newGame();
});
$('btnSettings').addEventListener('click', () => openSettings('title'));
$('btnControls').addEventListener('click', () => openControls('title'));
$('pResume').addEventListener('click', () => setPaused(false));
$('pJournal').addEventListener('click', () => { setPaused(false); toggleJournal(true); });
$('pSettings').addEventListener('click', () => openSettings('pause'));
$('pControls').addEventListener('click', () => openControls('pause'));
$('pRespawn').addEventListener('click', () => { setPaused(false); game.respawn(); });
$('pReset').addEventListener('click', () => { setPaused(false); game.resetPuzzle(); });
$('pTitle').addEventListener('click', () => { game.persist(); paused = false; game.paused = false; closeOverlays(); state = 'title'; $('hud').classList.add('hidden'); toggleJournal(false); refreshTitle(); $('title').classList.remove('hidden'); });
$('pNew').addEventListener('click', () => confirmBox('Reset all progress and start a new game?', () => { paused = false; game.paused = false; closeOverlays(); newGame(); }, 'pause'));

// global keys (work while paused too)
window.addEventListener('keydown', e => {
  audio.unlock();
  if (input.onKeyCapture) return;
  const b = settings.bindings;
  if (state === 'intro' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); nextIntro(); return; }
  if (state === 'intro' && e.code === 'Escape') { endIntro(); return; }
  if (state !== 'play') return;
  if (b.pause.includes(e.code)) {
    if (!$('settings').classList.contains('hidden') || !$('controls').classList.contains('hidden')) { $('settings').classList.add('hidden'); $('controls').classList.add('hidden'); $('pause').classList.remove('hidden'); return; }
    if (!$('journal').classList.contains('hidden') && !paused) { toggleJournal(false); return; }
    setPaused(!paused); return;
  }
  if (paused) return;
  if (b.journal.includes(e.code)) { e.preventDefault(); toggleJournal(); return; }
  if (b.debug.includes(e.code)) { e.preventDefault(); settings.debug = !settings.debug; applySettings(); toast(`Physics debug view ${settings.debug ? 'on' : 'off'}`, 'info'); return; }
  if (e.code === 'Enter' && dlg) advanceDlg();
});
window.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('visibilitychange', () => { if (document.hidden && (state === 'play' || state === 'ending')) { game.persist(); if (state === 'play' && !paused) setPaused(true); } });
window.addEventListener('beforeunload', () => { if (state === 'play' || state === 'ending') game.persist(); });

// ------------------------------------------------------------------ loop
let last = performance.now(), acc = 0, lastRender = 0, fpsT = 0, fpsN = 0, fps = 0, stepsThisSec = 0, sps = 0;
const urlFps = Number(new URLSearchParams(location.search).get('fps'));
function frame(now: number) {
  requestAnimationFrame(frame);
  const cap = urlFps || settings.fpsCap;
  if (cap && now - lastRender < 1000 / cap - 1) return;
  lastRender = now;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  fpsT += dt; fpsN++;
  if (fpsT >= 1) { fps = fpsN / fpsT; sps = stepsThisSec / fpsT; fpsT = 0; fpsN = 0; stepsThisSec = 0; }
  const mw = renderer.toWorld(input.mouse.x, input.mouse.y);
  (game as any)._mouseWorld = mw;
  if ((state === 'play' || state === 'ending') && !paused) {
    acc += dt * 1000;
    let steps = 0;
    while (acc >= STEP_MS && steps < 5) {
      input.pollPad();
      if (state === 'play') game.step();
      input.endStep();
      renderer.updateCamera();
      acc -= STEP_MS; steps++; stepsThisSec++;
    }
    if (steps >= 5) acc = 0;
    if (dlg) { dlg.t += dt; if (dlg.t > 5.5) advanceDlg(); }
    updateHint();
  } else if (state === 'title') {
    // attract mode: slow pan over the plaza
    renderer.cam.x = 2300 + Math.sin(now / 9000) * 800; renderer.cam.y = 1560;
  }
  renderer.render(dt);
  if (settings.debug) {
    const p = game.player.position, v = game.player.velocity;
    $('debugInfo').textContent = `FPS ${fps.toFixed(0)} · physics ${sps.toFixed(0)} steps/s (fixed ${STEP_MS.toFixed(2)} ms)\npos ${p.x.toFixed(0)},${p.y.toFixed(0)}  vel ${(v.x * 60).toFixed(0)},${(v.y * 60).toFixed(0)} px/s\ngrounded ${game.grounded} (${game.groundKind})  mass ${game.player.mass.toFixed(0)}\ngravity ${(game.engine.gravity.y * 1000).toFixed(0)} px/s²${game.surge.active > 0 ? ' (SURGE)' : ''}\ntether ${game.tether ? `L=${game.tether.len.toFixed(0)} stretch=${(game.tether.tension * 100).toFixed(1)}%` : '-'}\nbodies ${game.engine.world.bodies.length}`;
  }
}

applySettings();
refreshTitle();
requestAnimationFrame(frame);

// test / judge hooks
(window as any).__game = {
  game, renderer, settings: S,
  tp(x: number, y: number) { Matter.Body.setPosition(game.player, { x, y }); Matter.Body.setVelocity(game.player, { x: 0, y: 0 }); },
  corrupt() { localStorage.setItem(SAVE_KEY, '{"version":1,"shards":"oops"'); },
  surge() { game.triggerSurge(); },
  // deterministic test driver: run n fixed steps holding the given key codes
  run(n: number, keys: string[] = [], press: string[] = []) {
    for (const c of keys) input.down.add(c);
    for (const c of press) { input.down.add(c); (input as any).pressedQ.add(c); }
    for (let i = 0; i < n; i++) { game.step(); input.endStep(); renderer.updateCamera(); if (i === 0) for (const c of press) if (!keys.includes(c)) input.down.delete(c); }
    for (const c of keys) input.down.delete(c);
    renderer.render(0.016);
    const p = game.player.position, v = game.player.velocity;
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +v.x.toFixed(2), vy: +v.y.toFixed(2), g: game.grounded, tether: !!game.tether, zone: game.zone };
  },
  writeSave,
};
