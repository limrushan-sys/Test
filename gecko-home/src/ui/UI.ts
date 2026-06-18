import { ItemType, ITEM_EMOJIS, PLANT_STYLES } from '../items/ItemTypes.js';
import type { PlantStyle } from '../items/ItemTypes.js';
import type { PlacedItem } from '../items/ItemManager.js';

export interface UICallbacks {
  onTogglePlaceMode: (active: boolean) => void;
  onSelectItemType: (type: ItemType) => void;
  onResizeEnclosure: (w: number, d: number, h: number) => void;
  onMoveItem: (dx: number, dz: number) => void;
  onRotateItem: (angle: number) => void;
  onDeleteItem: () => void;
  onBodyColor: (hex: number) => void;
  onSpotColor: (hex: number | null) => void;
  onBellyColor: (hex: number) => void;
  onAddCrickets: () => void;
  onLampRadius: (radius: number) => void;
  onPlantStyle: (style: PlantStyle) => void;
  onItemScale: (scale: number) => void;
  onItemColor: (hex: number) => void;
  onTailBandColor: (hex: number) => void;
  onEyeColor: (hex: number) => void;
  onTailBaseColor: (hex: number) => void;
}

// null hex = "None" (hide spots)
type SwatchDef = { label: string; hex: string | null };

const BODY_COLOURS: SwatchDef[] = [
  { label: 'Wild Green',  hex: '#8fad3a' },
  { label: 'Tangerine',   hex: '#c95f18' },
  { label: 'Albino',      hex: '#e2c250' },
  { label: 'Blizzard',    hex: '#d8d6cc' },
  { label: 'Melanistic',  hex: '#3c4e1a' },
  { label: 'Carrot Tail', hex: '#c04415' },
  { label: 'Lavender',    hex: '#8a8ab2' },
  { label: 'Chocolate',   hex: '#7a4218' },
];

const SPOT_COLOURS: SwatchDef[] = [
  { label: 'Yellow',      hex: '#f0d040' },
  { label: 'White',       hex: '#f0ece0' },
  { label: 'Orange',      hex: '#d86820' },
  { label: 'Cream',       hex: '#e8d490' },
  { label: 'Brown',       hex: '#5c3614' },
  { label: 'Red',         hex: '#c83828' },
  { label: 'None',        hex: null      },
];

const BELLY_COLOURS: SwatchDef[] = [
  { label: 'Cream',       hex: '#d4c078' },
  { label: 'White',       hex: '#eae6d8' },
  { label: 'Pale Yellow', hex: '#e0d890' },
  { label: 'Pink',        hex: '#dcc0a8' },
  { label: 'Light Green', hex: '#b8cc68' },
  { label: 'Sandy',       hex: '#ccb060' },
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
        <div class="swatch-group">
          <span class="swatch-label">Body</span>
          <div class="swatch-row" id="swatches-body"></div>
        </div>
        <div class="swatch-group">
          <span class="swatch-label">Spots</span>
          <div class="swatch-row" id="swatches-spots"></div>
        </div>
        <div class="swatch-group">
          <span class="swatch-label">Belly</span>
          <div class="swatch-row" id="swatches-belly"></div>
        </div>
        <div class="swatch-group">
          <span class="swatch-label">Tail Bands</span>
          <input type="color" id="tail-band-color" value="#f5e8c0" style="width:50px;height:22px;border:none;cursor:pointer;vertical-align:middle;"/>
        </div>
        <div class="swatch-group">
          <span class="swatch-label">Tail Base</span>
          <input type="color" id="tail-base-color" value="#3a1a00" style="width:50px;height:22px;border:none;cursor:pointer;vertical-align:middle;"/>
        </div>
        <div class="swatch-group">
          <span class="swatch-label">Eyes</span>
          <input type="color" id="eye-color" value="#d4a820" style="width:50px;height:22px;border:none;cursor:pointer;vertical-align:middle;"/>
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
      <div id="lamp-section" style="display:none;padding:0 12px 8px;">
        <label style="font-size:11px;display:block;margin-bottom:4px;">Light Radius</label>
        <input type="range" id="lamp-radius" min="0.2" max="2.0" step="0.05" value="0.50" style="width:100%"/>
      </div>
      <div id="plant-section" style="display:none;padding:0 12px 8px;">
        <label style="font-size:11px;display:block;margin-bottom:4px;">Plant Style</label>
        <div id="plant-buttons" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
      </div>
      <div id="scale-section" style="display:none;padding:0 12px 8px;">
        <label style="font-size:11px;display:block;margin-bottom:4px;">Size</label>
        <input type="range" id="item-scale" min="0.5" max="2.0" step="0.05" value="1.00" style="width:100%"/>
      </div>
      <div id="item-color-section" style="display:none;padding:0 12px 8px;">
        <label style="font-size:11px;display:block;margin-bottom:4px;">Colour</label>
        <input type="color" id="item-color-picker" value="#000000" style="width:100%;height:28px;border:none;cursor:pointer;"/>
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

    // ── Gecko colour swatches ─────────────────────────────────────────────────
    this.buildSwatches('swatches-body',  BODY_COLOURS,  '#8fad3a',
      hex => this.callbacks.onBodyColor(hex as number));
    this.buildSwatches('swatches-spots', SPOT_COLOURS,  '#f0d040',
      hex => this.callbacks.onSpotColor(hex));
    this.buildSwatches('swatches-belly', BELLY_COLOURS, '#d4c078',
      hex => this.callbacks.onBellyColor(hex as number));

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
    (document.getElementById('lamp-radius') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onLampRadius(+(e.target as HTMLInputElement).value);
    };

    const plantBtns = document.getElementById('plant-buttons')!;
    const PLANT_EMOJIS: Record<string, string> = {
      mixed: '🌿', succulents: '🪴', ferns: '☘️', grass: '🌾',
    };
    for (const s of PLANT_STYLES) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.fontSize = '10px';
      btn.style.padding = '4px 7px';
      btn.textContent = `${PLANT_EMOJIS[s]} ${s}`;
      btn.dataset.style = s;
      btn.onclick = () => {
        plantBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.callbacks.onPlantStyle(s as PlantStyle);
      };
      plantBtns.appendChild(btn);
    }

    (document.getElementById('item-scale') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onItemScale(+(e.target as HTMLInputElement).value);
    };
    (document.getElementById('item-color-picker') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onItemColor(parseInt((e.target as HTMLInputElement).value.replace('#', ''), 16));
    };
    (document.getElementById('tail-band-color') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onTailBandColor(parseInt((e.target as HTMLInputElement).value.replace('#', ''), 16));
    };
    (document.getElementById('tail-base-color') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onTailBaseColor(parseInt((e.target as HTMLInputElement).value.replace('#', ''), 16));
    };
    (document.getElementById('eye-color') as HTMLInputElement).oninput = (e) => {
      this.callbacks.onEyeColor(parseInt((e.target as HTMLInputElement).value.replace('#', ''), 16));
    };
  }

  // ── Colour swatch builder ─────────────────────────────────────────────────
  private buildSwatches(
    id: string,
    options: SwatchDef[],
    defaultHex: string,
    onChange: (hex: number | null) => void
  ) {
    const row = document.getElementById(id)!;
    let activeBtn: HTMLButtonElement | null = null;

    const setActive = (btn: HTMLButtonElement) => {
      if (activeBtn) activeBtn.classList.remove('swatch-active');
      activeBtn = btn;
      btn.classList.add('swatch-active');
    };

    for (const opt of options) {
      const btn = document.createElement('button');
      btn.className = 'swatch';
      btn.title = opt.label;

      if (opt.hex === null) {
        // "None" — show an X
        btn.classList.add('swatch-none');
        btn.textContent = '✕';
      } else {
        btn.style.background = opt.hex;
        if (opt.hex === defaultHex) setActive(btn);
      }

      btn.onclick = () => {
        setActive(btn);
        onChange(opt.hex === null ? null : parseInt(opt.hex.replace('#', ''), 16));
      };

      row.appendChild(btn);
    }
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
      cricketSection.style.display = item.type === ItemType.FOOD_BOWL ? 'block' : 'none';
      const lampSection = document.getElementById('lamp-section')!;
      lampSection.style.display = item.type === ItemType.BASKING_LAMP ? 'block' : 'none';
      if (item.type === ItemType.BASKING_LAMP) {
        const radius = item.mesh.userData.lampRadius ?? 0.50;
        (document.getElementById('lamp-radius') as HTMLInputElement).value = String(radius);
      }
      const plantSection = document.getElementById('plant-section')!;
      plantSection.style.display = item.type === ItemType.PLATFORM ? 'block' : 'none';
      if (item.type === ItemType.PLATFORM) {
        const current = item.mesh.userData.plantStyle ?? 'mixed';
        document.querySelectorAll('#plant-buttons button').forEach(b => {
          b.classList.toggle('active', (b as HTMLElement).dataset.style === current);
        });
      }
      const scaleSection = document.getElementById('scale-section')!;
      const scalable = item.type === ItemType.STONE || item.type === ItemType.CLIMBING_BRANCH;
      scaleSection.style.display = scalable ? 'block' : 'none';
      if (scalable) {
        const s = item.mesh.userData.itemScale ?? 1.0;
        (document.getElementById('item-scale') as HTMLInputElement).value = String(s);
      }
      const colorSection = document.getElementById('item-color-section')!;
      const colorable = [
        ItemType.PLATFORM, ItemType.SLEEPING_HIDE, ItemType.STONE,
        ItemType.CORK_BARK, ItemType.FOOD_BOWL, ItemType.WATER_DISH,
      ].includes(item.type);
      colorSection.style.display = colorable ? 'block' : 'none';
      if (colorable) {
        const c = item.mesh.userData.itemColor ?? this.defaultItemColor(item.type);
        (document.getElementById('item-color-picker') as HTMLInputElement).value = '#' + c.toString(16).padStart(6, '0');
      }
    } else {
      panel.className = 'panel';
    }
  }

  private defaultItemColor(type: ItemType): number {
    switch (type) {
      case ItemType.PLATFORM:      return 0x2a2a2a;
      case ItemType.SLEEPING_HIDE: return 0x8b5e3c;
      case ItemType.STONE:         return 0x78909c;
      case ItemType.CORK_BARK:     return 0x795548;
      case ItemType.FOOD_BOWL:     return 0xc0392b;
      case ItemType.WATER_DISH:    return 0x78909c;
      default:                     return 0x888888;
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
