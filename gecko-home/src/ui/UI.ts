import { ItemType, ITEM_EMOJIS } from '../items/ItemTypes.js';
import type { PlacedItem } from '../items/ItemManager.js';

export interface UICallbacks {
  onTogglePlaceMode: (active: boolean) => void;
  onSelectItemType: (type: ItemType) => void;
  onResizeEnclosure: (w: number, d: number, h: number) => void;
  onMoveItem: (dx: number, dz: number) => void;
  onRotateItem: (angle: number) => void;
  onDeleteItem: () => void;
  onBodyColor: (hex: number) => void;
  onSpotColor: (hex: number) => void;
  onBellyColor: (hex: number) => void;
  onAddCrickets: () => void;
}

const BODY_COLOURS = [
  { label: 'Wild Green',    hex: '#a8c060' },
  { label: 'Tangerine',     hex: '#e07030' },
  { label: 'Albino',        hex: '#e8c870' },
  { label: 'Blizzard',      hex: '#dcddd8' },
  { label: 'Melanistic',    hex: '#4a5a28' },
  { label: 'Carrot Tail',   hex: '#d05820' },
  { label: 'Lavender',      hex: '#9090b8' },
  { label: 'Chocolate',     hex: '#7a4820' },
];

const SPOT_COLOURS = [
  { label: 'Yellow',        hex: '#f0d060' },
  { label: 'White',         hex: '#f0ede0' },
  { label: 'Orange',        hex: '#e88030' },
  { label: 'Cream',         hex: '#e8d8a0' },
  { label: 'Dark Brown',    hex: '#5a3818' },
  { label: 'Match Body',    hex: '#a8c060' },
  { label: 'Bright Red',    hex: '#d04030' },
  { label: 'None (Hide)',   hex: '#00000000' },
];

const BELLY_COLOURS = [
  { label: 'Cream',         hex: '#d4c890' },
  { label: 'White',         hex: '#eeeae0' },
  { label: 'Pale Yellow',   hex: '#e8e0a0' },
  { label: 'Pink Tint',     hex: '#e0c8b8' },
  { label: 'Light Green',   hex: '#c0d080' },
  { label: 'Sandy',         hex: '#d8c080' },
];

export class UI {
  private placeModeActive = false;
  private encW = 6; private encD = 4; private encH = 2;
  private callbacks: UICallbacks;
  private selectedItemType: ItemType | null = null;

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;
    this.buildDOM();
    this.bindKeys();
  }

  private buildDOM() {
    const root = document.getElementById('ui-root')!;

    // ── Left panel ──────────────────────────────────────────────────────────
    const left = document.createElement('div');
    left.id = 'left-panel';
    left.className = 'panel';
    left.innerHTML = `
      <h3>🦎 Gecko Home</h3>

      <div class="section">
        <label>Mode</label>
        <button id="place-toggle" class="btn">Place Mode: OFF</button>
      </div>

      <div class="section">
        <label>Item Type</label>
        <div class="item-grid" id="item-grid"></div>
      </div>

      <div class="section">
        <label>Gecko Colours</label>
        <div class="colour-row">
          <span class="colour-label">Body</span>
          <select id="sel-body" class="colour-select"></select>
        </div>
        <div class="colour-row">
          <span class="colour-label">Spots</span>
          <select id="sel-spots" class="colour-select"></select>
        </div>
        <div class="colour-row">
          <span class="colour-label">Belly</span>
          <select id="sel-belly" class="colour-select"></select>
        </div>
      </div>

      <div class="section">
        <label>Enclosure Size</label>
        <div class="resize-row">
          <span>W</span>
          <input type="range" id="enc-w" min="3" max="12" step="0.5" value="${this.encW}" />
          <span class="val" id="enc-w-val">${this.encW}</span>
        </div>
        <div class="resize-row">
          <span>D</span>
          <input type="range" id="enc-d" min="3" max="10" step="0.5" value="${this.encD}" />
          <span class="val" id="enc-d-val">${this.encD}</span>
        </div>
        <div class="resize-row">
          <span>H</span>
          <input type="range" id="enc-h" min="1" max="4" step="0.5" value="${this.encH}" />
          <span class="val" id="enc-h-val">${this.encH}</span>
        </div>
      </div>

      <div class="section" style="font-size:11px;color:#64748b;line-height:1.7;">
        <strong style="color:#8890a4">Controls</strong><br/>
        Orbit: Left drag &nbsp; Zoom: Scroll<br/>
        Select item: Click (place mode OFF)<br/>
        Move: Arrow keys &nbsp; Rotate: Q / E<br/>
        Delete: Del / Backspace &nbsp; Exit: Esc
      </div>
    `;
    root.appendChild(left);

    // ── Top bar ─────────────────────────────────────────────────────────────
    const top = document.createElement('div');
    top.id = 'top-bar';
    top.className = 'panel';
    top.textContent = 'Gecko Home — Single Player Enclosure';
    root.appendChild(top);

    // ── Status bar ───────────────────────────────────────────────────────────
    const status = document.createElement('div');
    status.id = 'status-bar';
    status.className = 'panel';
    status.innerHTML = `<span id="gecko-status">🦎 Gecko: Resting…</span>`;
    root.appendChild(status);

    // ── Info tip ─────────────────────────────────────────────────────────────
    const tip = document.createElement('div');
    tip.id = 'info-tip';
    tip.className = 'panel';
    root.appendChild(tip);

    // ── Item controls (bottom right) ─────────────────────────────────────────
    const ctrl = document.createElement('div');
    ctrl.id = 'item-controls';
    ctrl.className = 'panel';
    ctrl.innerHTML = `
      <h4>Selected Item</h4>
      <div class="ctrl-row">
        <button id="rot-left">↺ Q</button>
        <button id="rot-right">↻ E</button>
      </div>
      <div class="ctrl-row" style="flex-direction:column;gap:4px;">
        <button id="move-up"   style="width:100%">↑ Forward</button>
        <div style="display:flex;gap:5px;">
          <button id="move-left"  style="flex:1">← Left</button>
          <button id="move-right" style="flex:1">Right →</button>
        </div>
        <button id="move-down" style="width:100%">↓ Back</button>
      </div>
      <div id="cricket-section" style="display:none;padding:0 12px 8px;">
        <button id="add-crickets" class="btn" style="font-size:11px;padding:5px 8px;">
          🦗 Add Crickets
        </button>
      </div>
      <button id="del-item" class="del-btn">🗑 Delete Item</button>
    `;
    root.appendChild(ctrl);

    // ── Populate item grid ───────────────────────────────────────────────────
    const grid = document.getElementById('item-grid')!;
    Object.values(ItemType).forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'item-btn';
      btn.dataset.type = t;
      btn.innerHTML = `${ITEM_EMOJIS[t]}<br/><span style="font-size:10px">${t}</span>`;
      btn.onclick = () => this.selectItemType(t);
      grid.appendChild(btn);
    });

    // ── Place toggle ─────────────────────────────────────────────────────────
    document.getElementById('place-toggle')!.onclick = () => this.togglePlaceMode();

    // ── Resize sliders ────────────────────────────────────────────────────────
    for (const dim of ['w', 'd', 'h']) {
      const input = document.getElementById(`enc-${dim}`) as HTMLInputElement;
      const val   = document.getElementById(`enc-${dim}-val`)!;
      input.oninput = () => {
        val.textContent = input.value;
        if (dim === 'w') this.encW = +input.value;
        if (dim === 'd') this.encD = +input.value;
        if (dim === 'h') this.encH = +input.value;
        this.callbacks.onResizeEnclosure(this.encW, this.encD, this.encH);
      };
    }

    // ── Gecko colour dropdowns ────────────────────────────────────────────────
    this.populateSelect('sel-body',  BODY_COLOURS,  '#a8c060', hex => this.callbacks.onBodyColor(hex));
    this.populateSelect('sel-spots', SPOT_COLOURS,  '#f0d060', hex => this.callbacks.onSpotColor(hex));
    this.populateSelect('sel-belly', BELLY_COLOURS, '#d4c890', hex => this.callbacks.onBellyColor(hex));

    // ── Item move/rotate/delete buttons ───────────────────────────────────────
    const step = 0.14;
    document.getElementById('move-up')!.onclick    = () => this.callbacks.onMoveItem(0, -step);
    document.getElementById('move-down')!.onclick  = () => this.callbacks.onMoveItem(0, step);
    document.getElementById('move-left')!.onclick  = () => this.callbacks.onMoveItem(-step, 0);
    document.getElementById('move-right')!.onclick = () => this.callbacks.onMoveItem(step, 0);
    document.getElementById('rot-left')!.onclick   = () => this.callbacks.onRotateItem(-Math.PI / 8);
    document.getElementById('rot-right')!.onclick  = () => this.callbacks.onRotateItem(Math.PI / 8);
    document.getElementById('del-item')!.onclick   = () => this.callbacks.onDeleteItem();
    document.getElementById('add-crickets')!.onclick = () => this.callbacks.onAddCrickets();
  }

  // ── Colour select helper ──────────────────────────────────────────────────
  private populateSelect(
    id: string,
    options: { label: string; hex: string }[],
    defaultHex: string,
    onChange: (hex: number) => void
  ) {
    const sel = document.getElementById(id) as HTMLSelectElement;
    for (const opt of options) {
      const el = document.createElement('option');
      el.value = opt.hex;
      el.textContent = opt.label;
      if (opt.hex === defaultHex) el.selected = true;
      sel.appendChild(el);
    }
    sel.onchange = () => {
      const raw = sel.value.replace('#', '').replace('00000000', '000000');
      onChange(parseInt(raw, 16));
    };
  }

  // ── Toggle place mode ─────────────────────────────────────────────────────
  private togglePlaceMode() {
    this.placeModeActive = !this.placeModeActive;
    const btn = document.getElementById('place-toggle')!;
    btn.textContent = `Place Mode: ${this.placeModeActive ? 'ON' : 'OFF'}`;
    btn.className   = 'btn' + (this.placeModeActive ? ' active' : '');
    this.callbacks.onTogglePlaceMode(this.placeModeActive);
    this.showTip(this.placeModeActive ? 'Click inside the enclosure to place an item' : '');
  }

  private selectItemType(type: ItemType) {
    this.selectedItemType = type;
    document.querySelectorAll('.item-btn').forEach(b => {
      b.classList.toggle('selected', (b as HTMLElement).dataset.type === type);
    });
    this.callbacks.onSelectItemType(type);
    if (!this.placeModeActive) {
      this.placeModeActive = true;
      const btn = document.getElementById('place-toggle')!;
      btn.textContent = 'Place Mode: ON';
      btn.className   = 'btn active';
      this.callbacks.onTogglePlaceMode(true);
      this.showTip('Click inside the enclosure to place an item');
    }
  }

  setPlaceModeOff() {
    this.placeModeActive = false;
    const btn = document.getElementById('place-toggle');
    if (btn) { btn.textContent = 'Place Mode: OFF'; btn.className = 'btn'; }
  }

  showItemControls(item: PlacedItem | null) {
    const panel = document.getElementById('item-controls')!;
    const cricketSection = document.getElementById('cricket-section')!;
    if (item) {
      panel.className = 'panel visible';
      panel.querySelector('h4')!.textContent = `${ITEM_EMOJIS[item.type]} ${item.type}`;
      // Show cricket button only for food bowls
      cricketSection.style.display = item.type === ItemType.FOOD_BOWL ? 'block' : 'none';
    } else {
      panel.className = 'panel';
    }
  }

  showTip(msg: string, duration = 3000) {
    const tip = document.getElementById('info-tip')!;
    tip.textContent = msg;
    tip.className   = 'panel' + (msg ? ' visible' : '');
    if (msg && duration > 0) setTimeout(() => { tip.className = 'panel'; }, duration);
  }

  private bindKeys() {
    window.addEventListener('keydown', e => {
      const step = 0.14;
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); this.callbacks.onMoveItem(0, -step); break;
        case 'ArrowDown':  e.preventDefault(); this.callbacks.onMoveItem(0, step); break;
        case 'ArrowLeft':  e.preventDefault(); this.callbacks.onMoveItem(-step, 0); break;
        case 'ArrowRight': e.preventDefault(); this.callbacks.onMoveItem(step, 0); break;
        case 'q': case 'Q': this.callbacks.onRotateItem(-Math.PI / 8); break;
        case 'e': case 'E': this.callbacks.onRotateItem( Math.PI / 8); break;
        case 'Delete': case 'Backspace': this.callbacks.onDeleteItem(); break;
        case 'Escape':
          if (this.placeModeActive) this.togglePlaceMode();
          break;
      }
    });
  }
}
