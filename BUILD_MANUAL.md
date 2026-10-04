# ECHOES OF THE WEB — Locked Build Manual

> Silicon Maze 2026 · Dev Task 4 (100 + 10 bonus). Deadline **4 Oct 18:00 IST**. Built from 13:15.
> Rule: a smaller, stable world with polished physics beats a big unfinished one. Core first, bonuses after.

## 0. Stack (locked)
- **Vite + TypeScript**, single-page, static build → **Vercel** (`npx vercel --prod`, account already logged in).
- **Matter.js 0.20** for rigid bodies, constraints (tether, pendulum chain), collisions, queries (raycast).
- **Canvas 2D** custom renderer (procedural neon art, no image assets → nothing to license), DOM overlay for HUD/menus.
- **Web Audio API** synthesized SFX + ambient pad (no audio files).
- Fixed logical viewport **1280×720**, scaled to fit, camera clamped to world bounds.
- **Fixed timestep** 60 Hz accumulator, frame dt clamped to 100 ms, max 5 substeps. `?fps=30` / settings FPS cap to demo frame-rate independence.

## 1. World (≈ 7200 × 2600 px, 4 connected zones)
```
              ┌──────────── SKY GARDENS (violet) ────────────┐   ← Spire Crown (final)
              │ beacon brazier · spring launcher · float isle │
              └───────────┬───────────────────┬──────────────┘
                 anchors  │                   │ anchors
 ┌─ FOUNDRY (amber) ─┬────┴─ AETHER PLAZA (teal hub) ─┴────┬─ FROZEN DOCKS (ice) ─┐
 │ furnace gate, pan │ broken Aether Core, clock tower,   │ ice, crane + wrecking │
 │ crates, spring pad│ mayor, gravity lift (after core)   │ ball, cracked seawall │
 └───────────────────┴────────────────────────────────────┴──── harbor water ────┘
```
- Landmarks: Foundry chimneys + furnace glow, Plaza clock tower + Core pedestal, Docks crane, Gardens beacon tower. Zone name banner on entry, per-zone palette + parallax skyline, signposts with arrows.
- Boundaries: solid walls left/right, ceiling, kill-planes (harbor water, furnace pit) → respawn.

## 2. Rubric → feature map
| Rubric | Pts | How we hit it |
|---|---|---|
| 1.1 Connected world | 9 | 4 zones in one continuous world, thick static terrain (≥40px, no tunneling), walls/boundaries, clamped follow-camera with look-ahead, landmarks + zone banners + signposts |
| 1.2 Player movement | 8 | Velocity/accel model (ground accel, air control, ground friction, air drag), Matter gravity, coyote time + jump buffer + variable jump, **single jump only** (grounded = contact normal pointing up), fixed timestep, FPS-cap toggle to prove stability |
| 1.3 Tether & swing | 8 | Elastic constraint (stiffness 0.06) to glowing anchors; raycast line-of-sight; range 460; reel in/out; pump while swinging; release (jump = boost) & re-attach mid-air; reticle on the one valid target; red fizzle line + sound on fail |
| 2.1 Collectibles | 8 | **8 Echo Shards**; 5 need physics (swing, spring bounce, ice momentum, slingshot/low-g, breakable wall); pickup burst + toast + counter `x/8` + journal list |
| 2.2 World interaction | 8 | Crates (light/heavy/iron) with mass, friction, restitution; push (collide), **pull (tether objects)**, **carry & throw (E / Q)**; ice crates slide; wrecking ball pendulum |
| 2.3 Physics quests | 14 | 3 quests below; journal names their physics; one combines 2+, two have multiple solutions |
| 3.1 Quest flow | 7 | Opening scene (story cards) + Mayor dialogue; 3 quests fully independent, reachable from hub on fresh save; final unlocks at 3 fragments |
| 3.2 World feedback | 6 | Journal (J) active/completed + HUD tracker; non-blocking toasts/dialogue; environment changes (furnace lights, beacon lit, seawall rubble, Core glows, plaza lamps, bridge restored) |
| 3.3 Save/resume | 7 | localStorage versioned + schema-validated; saves shards, quests, final state, checkpoint, settings, playtime; continue after refresh; New Game/Reset; invalid → safe fresh start |
| 4.1 Gameplay loop | 9 | Title → intro → play → final → **ending screen with stats**; checkpoints + respawn key; quest objects auto-respawn if lost/out of bounds; per-zone "reset puzzle" |
| 4.2 Presentation/a11y | 6 | Controls panel, objective text, high contrast, audio sliders + mute, reduced motion (no shake/flash, fewer particles), full keyboard play (+ mouse aim optional, gamepad optional) |
| 4.3 Docs/deploy | 10 | Vercel deploy, README (premise, controls, stack, setup, physics explanation, limitations, link), video script |

## 3. Quests (each awards one Aether Fragment)
| # | Quest | Zone | Physics ideas | Solutions |
|---|---|---|---|---|
| A | **Furnace Gate** — load the counterweight pan until it outweighs the gate (≥ 3 units) so the gate rises; grab the fragment | Foundry | **weight / counterweight** (+ momentum to tether the iron block down) | Multiple: light+light+light, iron(2)+light, player standing + iron while… (any combo ≥3; gate height ∝ excess weight) |
| B | **Break the Seawall** — the cracked seawall blocks the frozen pier; hit it with impulse ≥ threshold | Docks | **pendulum** + **momentum/impulse** + **friction (ice)** → *combines ideas* | Multiple: (1) pull the crane's wrecking ball back with the tether and let it swing; (2) slide the heavy iron crate across the frictionless ice into the wall |
| C | **Light the Beacon** — deliver the Aether Orb into the brazier atop the beacon tower across a chasm | Sky Gardens | **springs/elastic** + **projectile motion** → *combines ideas* | Multiple: (1) drop orb on the spring launcher and stomp the trigger → parabolic arc; (2) carry and **throw** it (Q) from a swing; (3) tether-drag it |
| F | **Reignite the Core** (final, unlocks after A+B+C) — place fragments at the Plaza Core → gravity-lift column awakens → ride the **gravity field** to the Spire Crown → touch the beam | Plaza→Crown | gravity field | ending screen |

Six physics ideas are all present (momentum, pendulum, weight, projectile, friction, springs/gravity field).

## 4. Echo Shards (8)
1. Plaza underpass — walk (tutorial) · 2. Clock tower top — **swing** · 3. Foundry chimney — **spring pad + tether** · 4. Foundry crate stack — push crates · 5. Docks ice ramp gap — **ice momentum jump** · 6. Under the pier — swing under ledge · 7. Gardens float isle — **slingshot or Aether Surge low-g** · 8. Beacon tower ledge — tether climb.

## 5. Controls (remappable)
Move **A/D ←/→** · Jump **Space / W / ↑** · Tether **Shift or K** (auto-targets highlighted anchor) or **Left-click** (aim) · Reel **W/S** while tethered · Pump **A/D** · Grab/Drop **E** · Throw **Q** · Respawn **R** (hold) · Journal **J/Tab** · Pause **Esc** · Debug **F3**.

## 6. Systems
- **Player**: Matter rectangle (chamfered), `inertia: Infinity`, friction 0; we set velocity from our own accel/drag model; ground probe by contact normals (`normal·up > 0.6`). Max speed caps.
- **Tether**: `Constraint` (player ↔ anchor point or dynamic body), `length` = hit distance, `stiffness` 0.06, `damping` 0.02. Reel changes length (min 40, max 520). Slingshot = reel-in beyond rest stores elastic energy, release flings.
- **Carry**: constraint to a hand point; throw = release + impulse along aim; held object collides normally.
- **Impulse check**: on `collisionStart` with seawall, `m·|v_rel|` ≥ 18 → break into debris bodies.
- **Weight pan**: sensor over pan sums masses of bodies on it (crate unit = 1, iron = 2, player = 1); pan sinks (visual) and gate y = lerp by excess weight, smooth.
- **Spring launcher**: plate with stored compression → impulse on bodies above when triggered; visible coil.
- **Gravity field**: rect region applying upward force `−g·m·1.6` (lift) once Core is restored.
- **Soft-lock guards**: quest bodies respawn when out of world / sunk / idle > 25 s far from zone; "Reset puzzle" in pause menu; respawn key; checkpoints auto-activate.
- **Save** (`echoes.save.v1`): `{version, shards[], quests{A,B,C}, coreRestored, ended, checkpoint, playTime, introSeen}`; settings in `echoes.settings.v1`. try/catch everywhere; validator rejects bad shapes → fresh start + toast.

## 7. Bonus (+10)
- **Debug view (F3)**: body outlines, velocity vectors, tether length/tension, force arrows, pan weight readout, FPS.
- **Dynamic event — Aether Surge**: every ~80 s gravity → 35 % for 15 s (warning toast 3 s before, sky tint; reduced-motion safe).
- **Advanced a11y**: remappable keys + text scale + high-contrast mode.
- **Original mechanic — Elastic Slingshot**: overcharge the tether (hold reel-in) to store elastic energy, release to fling; tension meter.

## 8. Phases & hard stops
1. 13:15 manual + scaffold + placeholder deploy (13:50)
2. Engine: loop, terrain, player, camera, tether (15:00)
3. World layout + quests + shards (16:10) — commit/deploy per quest
4. Save, HUD/journal, menus, respawn, settings (16:40)
5. Bonuses, README, video script, final deploy (17:00) → user records video
6. Verify Minimum Playable Checklist on the **deployed URL**.

## 9. Verification matrix (on deployed build)
start → intro understood · walk 4 zones · swing/release/reattach · fail-attach feedback · collect shard (toast + count) · A/B/C in any order (and both alt solutions for B, C) · final unlock → ending · refresh → continue · garbage save → safe new game · reset progress · respawn from kill-plane · lost object respawns · FPS cap 30 vs 60 feel identical · reduced motion / contrast / text scale / remap.
