/** Application state (Svelte 5 runes). Everything visible is derived from these few fields. */

import { analyse, type Analysis } from './damage/analysis';
import { applyDamage, type DamageOp, type DamageState } from './damage/damage';
import { encode, type EncodeResult, type ModeChoice, type QrSymbol } from './qr/encoder';
import type { RoleId } from './qr/matrix';
import type { EcLevel } from './qr/tables';

export const DEFAULT_TEXT = 'https://mustafaobaidd1.github.io/quiet-zone-qr/';

/** The opening damage: the bottom-right corner torn away (see tests/damage.test.ts). */
export const OPENING_TEAR: DamageOp = { kind: 'tear', corner: 'br', depth: 0.3, seed: 1 };

export type Tool = 'inspect' | 'scratch' | 'erase' | 'sticker' | 'tear';
export type BrushSize = 'S' | 'M' | 'L';

/** Brush radius in modules of the symbol on screen. */
export const BRUSH_RADIUS: Record<BrushSize, number> = { S: 0.5, M: 0.85, L: 1.6 };

const MAX_HISTORY = 200;

export class AppState {
  text = $state(DEFAULT_TEXT);
  level = $state<EcLevel>('M');
  mode = $state<ModeChoice>('auto');
  version = $state<number | 'auto'>('auto');
  mask = $state<number | 'auto'>('auto');

  /** Committed damage operations (normalised coordinates). */
  ops = $state.raw<DamageOp[]>([OPENING_TEAR]);
  /** Operations removed by undo, for redo. */
  redoStack = $state.raw<DamageOp[]>([]);
  /** The stroke or sticker being drawn right now. */
  live = $state.raw<DamageOp | null>(null);

  tool = $state<Tool>('scratch');
  brush = $state<BrushSize>('S');
  noiseP = $state(0.04);
  erasureMode = $state(false);
  /** Anatomy layers that are switched on. */
  regions = $state.raw<RoleId[]>([]);
  /** Module under the pointer or keyboard cursor. */
  probeIndex = $state<number | null>(null);
  /** Block whose meter is hovered/focused (highlighted on the code). */
  focusBlock = $state<number | null>(null);
  /** Has the visitor damaged the code themselves yet? (hides the hint) */
  touched = $state(false);
  /** Export feedback. */
  toast = $state<{ id: number; message: string; tone: 'ok' | 'error' } | null>(null);

  result: EncodeResult = $derived(
    encode(this.text, {
      level: this.level,
      mode: this.mode,
      version: this.version,
      mask: this.mask,
    }),
  );

  symbol: QrSymbol | null = $derived(this.result.ok ? this.result.symbol : null);

  allOps: DamageOp[] = $derived(this.live ? [...this.ops, this.live] : this.ops);

  damage: DamageState | null = $derived(
    this.symbol ? applyDamage(this.symbol.modules, this.symbol.size, this.allOps) : null,
  );

  analysis: Analysis | null = $derived(
    this.symbol && this.damage ? analyse(this.symbol, this.damage, this.erasureMode) : null,
  );

  commit(op: DamageOp) {
    const next = [...this.ops, op];
    this.ops = next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    this.redoStack = [];
    this.live = null;
    this.touched = true;
  }

  undo() {
    if (!this.ops.length) return;
    this.redoStack = [...this.redoStack, this.ops[this.ops.length - 1]];
    this.ops = this.ops.slice(0, -1);
  }

  redo() {
    if (!this.redoStack.length) return;
    this.ops = [...this.ops, this.redoStack[this.redoStack.length - 1]];
    this.redoStack = this.redoStack.slice(0, -1);
  }

  clear() {
    if (!this.ops.length) return;
    this.ops = [];
    this.redoStack = [];
    this.live = null;
    this.touched = true;
  }

  addNoise() {
    this.commit({ kind: 'noise', p: this.noiseP, seed: Math.floor(Math.random() * 2 ** 31) });
  }

  toggleRegion(id: RoleId) {
    this.regions = this.regions.includes(id)
      ? this.regions.filter((r) => r !== id)
      : [...this.regions, id];
  }

  notify(message: string, tone: 'ok' | 'error' = 'ok') {
    this.toast = { id: Date.now(), message, tone };
  }
}

export const app = new AppState();
