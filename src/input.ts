import type { Action, Settings } from './save';

// Keyboard (remappable) + mouse + optional gamepad, polled once per fixed step.
export class Input {
  down = new Set<string>();
  private pressedQ = new Set<string>();
  private releasedQ = new Set<string>();
  mouse = { x: 0, y: 0, clicked: false, rclicked: false, lastMove: 0 };
  pad: Gamepad | null = null;
  private padPrev: boolean[] = [];
  padPressed = new Set<number>();
  onKeyCapture: ((code: string) => void) | null = null;
  enabled = true;

  constructor(private settings: () => Settings, canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (this.onKeyCapture) { e.preventDefault(); const cb = this.onKeyCapture; this.onKeyCapture = null; cb(e.code); return; }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'ShiftLeft'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedQ.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', e => { this.down.delete(e.code); this.releasedQ.add(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); this.mouse.x = (e.clientX - r.left) / r.width; this.mouse.y = (e.clientY - r.top) / r.height; this.mouse.lastMove = performance.now(); });
    canvas.addEventListener('mousedown', e => {
      const r = canvas.getBoundingClientRect(); this.mouse.x = (e.clientX - r.left) / r.width; this.mouse.y = (e.clientY - r.top) / r.height;
      this.mouse.lastMove = performance.now();
      if (e.button === 0) this.mouse.clicked = true; else if (e.button === 2) this.mouse.rclicked = true;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  private codes(a: Action) { return this.settings().bindings[a]; }
  held(a: Action): boolean {
    if (!this.enabled) return false;
    if (this.codes(a).some(c => this.down.has(c))) return true;
    return this.padHeld(a);
  }
  pressed(a: Action): boolean {
    if (!this.enabled) return false;
    if (this.codes(a).some(c => this.pressedQ.has(c))) return true;
    return this.padPress(a);
  }
  released(a: Action): boolean { return this.codes(a).some(c => this.releasedQ.has(c)); }

  // gamepad mapping (standard layout)
  private padMap: Partial<Record<Action, number[]>> = { jump: [0], tether: [5, 7], grab: [2], throw: [3], respawn: [8], journal: [8], pause: [9], slingshot: [4, 6], up: [12], down: [13], left: [14], right: [15] };
  private padHeld(a: Action) {
    const p = this.pad; if (!p) return false;
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    if (a === 'left' && ax < -0.35) return true;
    if (a === 'right' && ax > 0.35) return true;
    if (a === 'up' && ay < -0.5) return true;
    if (a === 'down' && ay > 0.5) return true;
    return (this.padMap[a] ?? []).some(i => p.buttons[i]?.pressed);
  }
  private padPress(a: Action) { return (this.padMap[a] ?? []).some(i => this.padPressed.has(i)); }

  pollPad() {
    this.padPressed.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = null;
    for (const p of pads) if (p && p.connected) { this.pad = p; break; }
    if (!this.pad) return;
    this.pad.buttons.forEach((b, i) => { if (b.pressed && !this.padPrev[i]) this.padPressed.add(i); this.padPrev[i] = b.pressed; });
  }

  endStep() { this.pressedQ.clear(); this.releasedQ.clear(); this.mouse.clicked = false; this.mouse.rclicked = false; this.padPressed.clear(); }
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Backquote: '`', ControlLeft: 'Ctrl', Enter: 'Enter', Tab: 'Tab' };
  return map[code] ?? code;
}
