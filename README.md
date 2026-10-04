# Echoes of the Web

**A physics-driven web-slinger open world.** Swing, haul, throw, launch and smash your way across a broken city to restore the Aether Core.

### ▶ Play it: **https://echoes-of-the-web.vercel.app**

### 🎬 Explanation video: **YOUTUBE_LINK_HERE**

Silicon Maze 2026 · Dev Task 4. Runs in any modern desktop browser. Nothing to install, and progress saves automatically.


## ✅ Rubric coverage (where to find each requirement)

| Requirement | Pts | Where it lives in the game |
|---|---:|---|
| **1.1 Connected world** | 9 | 4 connected zones (Plaza, Foundry, Docks, Sky Gardens) in one continuous world. Thick static terrain, walls and world boundaries. A follow camera with look-ahead, clamped so it never shows outside the world. Landmarks (Core, clock tower, crane, beacon tower), signposts and zone banners. |
| **1.2 Physics movement** | 8 | Velocity + acceleration + gravity + ground friction + air drag. Coyote time, jump buffer, variable jump height. **Single jump only**: the ground check probes under the feet, so walls never reset it. A **fixed 60 Hz timestep** keeps it stable at any FPS, and a 30 FPS cap in Settings lets you check. |
| **1.3 Web tether & swinging** | 8 | An elastic rope constraint to anchors or objects. Swing, pump, reel, release with a boost and re-attach mid-air. A yellow reticle marks the valid target, a glowing line shows the active tether, and a missed shot draws a red "NO ANCHOR" line with a sound. |
| **2.1 Collectibles** | 8 | **8 Echo Shards**, 5 of which need physics to reach (swing, spring pad, low dip over water, chained tethers, crate step). Pickup burst, toast, `x/8` counter and journal list. |
| **2.2 World interaction** | 8 | Crates, iron blocks, an orb and a wrecking ball, all responding to forces, gravity and collisions. You can **push** them, **pull** them (tether + reel), **carry and throw** them (E/Q, with a predicted arc), or **tether** them. Iron blocks never tumble, so behaviour stays predictable. |
| **2.3 Physics quests** | 14 | 3 quests, each with a visible objective and a success state. Together they use **all 6 ideas**: weight, pendulum, momentum, friction, springs, projectile, plus a gravity field. **Seawall** and **Beacon** each **combine ideas**, and **all three have multiple solutions** (details below). |
| **3.1 Quest flow** | 7 | Intro story cards and Mayor dialogue. The three quests are independent (any order). The final objective unlocks after 3 fragments. |
| **3.2 World feedback** | 6 | Objective tracker, journal (J) showing active and completed quests, and non-blocking toasts and dialogue. Environment changes show progress: furnace glow, gate latched open, wall rubble, beacon flame, Core lighting up, gravity lift appearing. |
| **3.3 Save & resume** | 7 | localStorage save of shards, quests, final state, checkpoint and settings. Restored after a refresh. **New Game / Reset Progress** is on the title screen and in the pause menu. Saves are versioned and validated, so invalid or missing data starts safely from the beginning. |
| **4.1 Gameplay loop** | 9 | Title → intro → quests → final → **ending screen with stats**. Checkpoints, hold-R respawn, and water/void auto-respawn. Lost objects return home automatically, "Reset puzzle in this zone" is in the pause menu, and quests have no ordering dependencies. |
| **4.2 Presentation & a11y** | 6 | Controls panel and contextual hint bar, readable high-contrast HUD, volume sliders and mute, **reduced motion**, full keyboard play (+ mouse and gamepad). |
| **4.3 Docs & deployment** | 10 | Live on Vercel. This README covers the premise, controls, stack, setup, physics, limitations and link. The explanation video is linked above. |
| **Bonus** | +10 | **Debug view (F3)** · **Aether Surge** gravity event · **remappable keys + text scale + high contrast** · **Elastic Slingshot** original mechanic |

### Minimum playable checklist
1. ✅ Start a new game and understand the objective (intro, Mayor dialogue, objective tracker)
2. ✅ Explore 3+ connected zones (4)
3. ✅ Move and swing with physics
4. ✅ Find and collect objects (8 shards)
5. ✅ Complete 3 physics quests in any order
6. ✅ Unlock and finish the final objective (Core → gravity lift → Spire Crown → ending)
7. ✅ Refresh and continue from saved progress
8. ✅ Reset progress and begin again without errors

---

## Premise

An energy surge has cracked the **Aether Core**, the crystal that powers the city. Its three **Aether Fragments** were flung into three districts, and the bridges and streets between them are broken. You are a young web-slinger. Walking won't get you far, but your elastic **web tether** will.

Recover the three fragments **in any order**. Each one is guarded by a physics puzzle. Return them to the Core in Aether Plaza, then ride the Core's gravity lift to the Spire Crown to restart the city. Eight hidden **Echo Shards** reward players who master the movement.

## Controls

All keys can be remapped in **Settings**. The game is fully playable on keyboard; mouse and gamepad are optional.

| Action | Keys |
|---|---|
| Run | **A / D** or **← / →** |
| Jump (hold for higher, single jump only) | **Space** (or **W / ↑** when not swinging) |
| Fire web tether at the yellow-reticle target | **K** or **Shift**, or **left-click** near any anchor/object to aim with the mouse |
| Chain to the next anchor mid-swing | **K / Shift** again (hold **W** to prefer anchors above) |
| Reel in / out | **W / S** (or **↑ / ↓**) while tethered |
| Pump the swing | **A / D** while swinging |
| Release (with upward boost) | **Space** (or right-click) |
| Elastic slingshot | hold **C** or **L** while tethered, then release |
| Grab / drop light crates and the orb · talk · launcher lever | **E** |
| Throw along the dotted arc (hold **W** for a lob, **S** for a flat throw) | **Q** |
| Respawn at last checkpoint | hold **R** |
| Journal (quests, physics, shard hints) | **J** or **Tab** |
| Pause menu | **Esc** or **P** |
| Physics debug view | **F3** or **`** |

Gamepad: left stick moves · A jumps · RB/RT tether · X grabs · Y throws · LB/LT slingshot · B respawns · Back opens the journal · Start pauses.

## The world

One continuous world of about 7200 × 2600 px with **four connected zones**. Each zone has its own palette, music chord, landmarks and signposts:

| Zone | Landmark | Quest |
|---|---|---|
| **Aether Plaza** (hub) | Broken Aether Core, clock tower, Mayor Ilse | Final objective |
| **The Foundry** (west) | Furnace, pulley, chimneys | Furnace Gate |
| **Frozen Docks** (east) | Crane with wrecking ball, cracked seawall, harbor | Break the Seawall |
| **Sky Gardens** (above) | Beacon tower, spring launcher, floating isle | Light the Beacon |

The camera follows with look-ahead and is clamped to the world bounds, so it never shows the void. Zone banners and signs help you find your way.

## Quests and their physics

| Quest | Physics ideas | Valid solutions |
|---|---|---|
| **Furnace Gate** (Foundry): the gate hangs from a pulley against a counterweight pan. It only rises once the pan outweighs it (3 units). | **Weight / counterweight**, plus momentum to haul the iron block off its ledge | **Several:** three crates · iron (2) + crate · any mix ≥ 3. A gauge shows pan weight vs gate weight. |
| **Break the Seawall** (Docks): only an impact with **momentum = mass × speed ≥ 85** from something heavy breaks it. Weaker hits report their momentum. | **Pendulum** + **momentum/impulse** + **friction** (frictionless ice), so this quest **combines ideas** | **Two:** (1) tether the crane's 25-mass wrecking ball, reel it back and let it swing; (2) push the iron block down the ice ramp so it slides into the wall |
| **Light the Beacon** (Gardens): get the Aether Orb into the brazier on the beacon tower, across a chasm. | **Springs / elastic** + **projectile motion**, so this quest also **combines ideas** | **Three:** (1) place the orb on the spring launcher, set compression with the lever (E), stomp the pad and watch the predicted parabola; (2) carry it across on your web and drop it in; (3) throw it (Q) along the arc |
| **Reignite the Core** (final): unlocks after all three fragments. Return them to the Core, then ride the gravity lift to the Spire Crown. | **Gravity field** | — |

The three core quests are fully independent and can be done in any order. Every zone is reachable from the hub on a fresh save.

## Physics systems (how it works)

Built on **Matter.js** rigid-body physics, with the game logic written on top of it.

- **Fixed timestep.** The simulation always advances in 1/60 s steps through an accumulator loop. Frame time is clamped to 100 ms, with at most 5 steps per frame. Movement is identical at 30, 60 or 144 FPS. Settings → *Frame-rate cap* (or `?fps=30` in the URL) lets you check this yourself.
- **Player movement.** The player is a Matter body with infinite inertia, so it never rotates. Its velocity comes from our own model: ground acceleration and friction, weaker air control, air drag, terminal velocity and a speed cap. Gravity comes from the engine (about 1600 px/s²). Jumps use coyote time, a jump buffer and variable height. "Grounded" is decided by probing points *under the feet* only, so walls never refresh your jump and there are no mid-air jumps. On **ice** the ground acceleration and friction are about 10× lower.
- **Elastic web tether.** A Matter `Constraint` from the player's hand to an anchor point or to a dynamic body.
  - It acts like a **rope**: it only pulls when stretched past its rest length and goes slack otherwise. Stiffness is 0.3, so it stretches a little and swings feel springy.
  - Reeling changes the rest length. Pumping adds tangential force. Releasing keeps your momentum.
  - Targets need to be in range (500 px) with a clear raycast line of sight (`Query.ray`). The best target gets a yellow reticle. A failed shot draws a red dashed line with "NO ANCHOR" and a fizzle sound.
- **Elastic slingshot (original mechanic).** Hold **C** while tethered. The rest length collapses while the rope turns soft (stiffness 0.06), so the stretch stores elastic energy and flings you toward the anchor. Let go at the right moment to launch over obstacles. A tension meter shows how far the web is stretched.
- **Objects.**
  - Light crates (mass 3, weight 1) tumble.
  - Iron blocks (mass 9, weight 2) never rotate, so they slide predictably.
  - The orb is bouncy with no air drag. The wrecking ball has mass 25 on a rigid chain.
  - You can **push** objects (collisions), **pull** them (tether + reel), and **carry and throw** light ones (E/Q). Throws show a predicted arc.
  - While you are grounded your mass rises (feet planted), so you can haul heavy things toward you instead of being yanked off your feet.
- **Weight pan.** Each step we collect the bodies resting on the pan, including stacks, and add up their weight units. The pan sinks with the load. The gate's target height is a function of pan weight against the gate's 3-unit counterweight.
- **Impact check.** On `collisionStart` with the seawall we read the other body's pre-impact velocity and mass. If momentum ≥ 85 and mass ≥ 8, the wall shatters into debris bodies.
- **Spring pads and launcher.** Pads set an upward velocity (power 25–27) on anything that lands on them. The launcher's three compression notches set launch speed at a 55° angle. Its dotted preview uses the same discrete gravity integration as the engine.
- **Gravity lift.** Inside the column, an upward acceleration overcomes gravity and settles at a steady rise. At the top it hovers and drifts you toward the crown.
- **Aether Surge (dynamic world event).** About every 80 s, gravity drops to 36 % for 14 s, with a warning 3 s before. Jumps, throws and swings go much further. It can be turned off in Settings.

## Progression, saving and safety nets

- An opening story, Mayor dialogue, an objective tracker (top-left), a journal (J) listing active and completed quests with their physics, and toasts that never block play.
- **Visible consequences:** the furnace glows and its gate latches open, the seawall shatters, the beacon flames up, the Core lights one piece per fragment, and a lift and crown beam appear.
- **Save and resume:** saved to `localStorage` on every milestone, every 10 s, and when the tab hides or closes.
  - Saved: collected shards, quest states, final progress, checkpoint, play time, and settings (stored separately, so they survive a progress reset).
  - Saves carry a **version** field and a schema plus consistency validator. Corrupt or missing data starts a fresh game safely and tells you why.
- **New Game / Reset Progress** on the title screen and in the pause menu, with confirmation.
- **No soft locks:**
  - Checkpoint lamps auto-activate. Hold R to respawn. Water and the void respawn you automatically.
  - Lost quest objects (in water, out of their zone, out of the world) return home automatically.
  - *Reset puzzle in this zone* is in the pause menu. It returns objects home and rebuilds the seawall if its fragment is still there, so you can try the other solution.
  - The furnace gate never closes on you.
  - Quests have no ordering dependencies.

## Accessibility and presentation

- Readable HUD with high-contrast panels. Controls are shown in context (the hint bar changes when swinging or carrying). Full keyboard play.
- **Settings:** master, music and SFX volume, mute, **reduced motion** (no screen shake, fewer particles; it follows the OS preference by default), **high-contrast mode**, **text scale 80–160 %**, **fully remappable keys**, frame-rate cap, surge toggle and debug view.
- All audio is synthesized at runtime with the Web Audio API: SFX plus an ambient pad that changes chord per zone.

## Bonus features

| Bonus | Implementation |
|---|---|
| Physics debug view | **F3:** collision shapes (static, dynamic, player), velocity vectors with mass and speed, gravity arrow, tether rest length vs actual length, stretch %, tension force arrow, tether range, ground probe, pan weight, lift region, plus an FPS and physics step-rate panel |
| Dynamic world event | **Aether Surge** low-gravity event with warning, sky tint and floating motes |
| Advanced accessibility | Remappable controls + scalable text + high-contrast mode |
| Original mechanic | **Elastic slingshot:** overcharge the web to store elastic energy and launch |

## Tech stack

- **TypeScript** + **Vite** (static build)
- **Matter.js 0.20** for rigid bodies, constraints, collision events and raycasts
- **Canvas 2D**: a custom renderer with procedural art (parallax skyline, glow, particles). There are no image assets.
- **Web Audio API**: synthesized sound and music. There are no audio files.
- Deployed on **Vercel**

## Setup and run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the build
```

Requires Node 18+.

## Project structure

```
src/
  main.ts     game loop (fixed timestep), menus, HUD, journal, settings, save flow
  game.ts     physics world, player controller, tether, carry/throw, quests, events, respawn
  level.ts    world layout: zones, terrain, anchors, shards, checkpoints, NPCs, props, quest geometry
  render.ts   canvas renderer + physics debug view
  save.ts     versioned save/settings with validation, default key bindings
  input.ts    remappable keyboard, mouse, gamepad
  audio.ts    synthesized SFX and ambient music
BUILD_MANUAL.md   the locked design / rubric plan this was built from
```

## Known limitations

- The world is compact by design: four zones, three core quests and eight shards.
- Traversal anchors are fixed points. You can't attach the web to any wall surface.
- Partial puzzle progress (crates moved, wall broken but fragment not yet taken) is not saved. Unfinished puzzles reset to their starting layout when you load, which also means a puzzle can never be saved in a broken state.
- The art is fully procedural with simple shapes. There is no sprite animation.
- Touch controls are not implemented (keyboard, mouse and gamepad are).
- Matter.js is not perfectly deterministic across very different hardware, but every puzzle has generous tolerances.

## Credits

- Physics: [Matter.js](https://brm.io/matter-js/) (MIT) by Liam Brummitt
- Fonts: [Chakra Petch](https://fonts.google.com/specimen/Chakra+Petch) and [Inter](https://fonts.google.com/specimen/Inter) (SIL Open Font License) via Google Fonts
- All graphics and audio are generated procedurally in code for this project.
