import './style.css';
import * as THREE from 'three';
import { SceneSetup } from './scene/SceneSetup.js';
import { Enclosure } from './scene/Enclosure.js';
import { Gecko } from './gecko/Gecko.js';
import { ItemManager } from './items/ItemManager.js';
import { ItemType, buildPlants } from './items/ItemTypes.js';
import type { PlantStyle } from './items/ItemTypes.js';
import { UI } from './ui/UI.js';

class GeckoHomeApp {
  private sceneSetup: SceneSetup;
  private enclosure: Enclosure;
  private geckos: Gecko[] = [];
  private activeGeckoIndex = 0;
  private itemManager: ItemManager;
  private ui: UI;

  private clock = new THREE.Clock();
  private mouse = new THREE.Vector2();
  private pointerDownPos = new THREE.Vector2();
  private isPointerDown = false;

  private get gecko(): Gecko {
    return this.geckos[this.activeGeckoIndex];
  }

  constructor() {
    const canvas = document.getElementById('app-canvas') as HTMLCanvasElement;
    this.sceneSetup = new SceneSetup(canvas);

    this.enclosure = new Enclosure(this.sceneSetup.scene, 6, 4, 2);

    const firstGecko = new Gecko(this.sceneSetup.scene);
    this.geckos.push(firstGecko);

    this.itemManager = new ItemManager(this.sceneSetup.scene, this.enclosure.floorMesh);
    this.itemManager.setWalls(this.enclosure.wallMeshes);
    this.itemManager.setGeckoPositionGetter(() => this.gecko.group.position);

    this.setupGeckoCallbacks(firstGecko);

    this.itemManager.onSelectionChange = (item) => {
      this.ui?.showItemControls(item);
    };

    this.ui = new UI({
      onTogglePlaceMode: (active) => {
        this.itemManager.togglePlaceMode(active);
      },
      onSelectItemType: (type) => {
        this.itemManager.setSelectedType(type);
      },
      onResizeEnclosure: (w, d, h) => {
        this.enclosure.resize(w, d, h);
        this.itemManager.setFloor(this.enclosure.floorMesh);
        this.itemManager.setWalls(this.enclosure.wallMeshes);
        this.itemManager.clampAllToBounds(this.enclosure.bounds);
        for (const g of this.geckos) {
          const pos = g.group.position;
          const b   = this.enclosure.bounds;
          pos.x = Math.max(b.minX + 0.2, Math.min(b.maxX - 0.2, pos.x));
          pos.z = Math.max(b.minZ + 0.2, Math.min(b.maxZ - 0.2, pos.z));
        }
      },
      onMoveItem: (dx, dz) => {
        this.itemManager.moveSelected(dx, dz, this.enclosure.bounds);
      },
      onRotateItem: (angle) => {
        this.itemManager.rotateSelected(angle);
      },
      onDeleteItem: () => {
        this.itemManager.deleteSelected();
      },
      onBodyColor:  (hex) => this.gecko.setBodyColor(hex as number),
      onSpotColor:  (hex) => this.gecko.setSpotColor(hex),
      onBellyColor: (hex) => this.gecko.setBellyColor(hex as number),
      onAddCrickets: () => {
        const item = this.itemManager.selectedItem;
        if (!item) return;
        const added = this.itemManager.addCrickets(item);
        this.ui.showTip(added ? '🦗 Crickets added! Gecko will come to eat them.' : 'Bowl is full of crickets!', 2500);
      },
      onLampRadius: (radius: number) => {
        const item = this.itemManager.selectedItem;
        if (!item) return;
        const mesh = item.mesh;
        mesh.userData.lampRadius = radius;
        const oldBeam = mesh.userData.lampBeam as THREE.Mesh;
        const oldSpot = mesh.userData.lampSpot as THREE.Mesh;
        if (oldBeam) {
          oldBeam.geometry.dispose();
          oldBeam.geometry = new THREE.CylinderGeometry(radius, radius, 2.05, 16, 1, true);
        }
        if (oldSpot) {
          oldSpot.geometry.dispose();
          oldSpot.geometry = new THREE.CircleGeometry(radius, 24);
        }
      },
      onPlantStyle: (style: PlantStyle) => {
        const item = this.itemManager.selectedItem;
        if (!item || item.type !== ItemType.PLATFORM) return;
        buildPlants(item.mesh, style);
      },
      onItemScale: (scale: number) => {
        const item = this.itemManager.selectedItem;
        if (!item) return;
        item.mesh.scale.set(scale, scale, scale);
        item.mesh.userData.itemScale = scale;
      },
      onItemColor: (hex: number) => {
        const item = this.itemManager.selectedItem;
        if (!item) return;
        item.mesh.userData.itemColor = hex;
        const color = new THREE.Color(hex);
        const skip = new Set<THREE.Object3D>();
        item.mesh.traverse(c => {
          if (c.userData.noRecolor || c.userData.isPlant) { skip.add(c); return; }
          if (c.parent && skip.has(c.parent)) { skip.add(c); return; }
          const m = c as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = m.material as THREE.MeshLambertMaterial;
          if (mat && mat.color && !mat.transparent) {
            mat.color.copy(color);
          }
        });
      },
      onTailBandColor: (hex: number) => this.gecko.setTailBandColor(hex),
      onTailBaseColor: (hex: number) => this.gecko.setTailBaseColor(hex),
      onEyeColor: (hex: number) => this.gecko.setEyeColor(hex),
      onAddGecko: () => {
        if (this.geckos.length >= 2) return;
        const g = new Gecko(this.sceneSetup.scene);
        g.name = 'Gecko 2';
        const b = this.enclosure.bounds;
        g.group.position.set(
          (b.minX + b.maxX) / 2 + 0.5,
          0,
          (b.minZ + b.maxZ) / 2
        );
        this.geckos.push(g);
        this.setupGeckoCallbacks(g);
        this.activeGeckoIndex = this.geckos.length - 1;
        this.ui.addGeckoTab(this.activeGeckoIndex, g.name);
      },
      onSelectGecko: (index: number) => {
        this.activeGeckoIndex = index;
        const g = this.gecko;
        this.ui.selectGeckoTab(index, g.name, g.getColors());
      },
      onRenameGecko: (name: string) => {
        this.gecko.name = name;
      },
      onShare: () => {
        const state = this.serializeState();
        const encoded = btoa(JSON.stringify(state));
        const url = `${location.origin}${location.pathname}#${encoded}`;
        navigator.clipboard.writeText(url).then(() => {
          this.ui.showTip('Share link copied to clipboard!', 2500);
        }).catch(() => {
          prompt('Copy this share link:', url);
        });
      },
    });

    this.loadFromHash();
    this.bindPointer(canvas);
    this.animate();
  }

  private setupGeckoCallbacks(gecko: Gecko) {
    gecko.onArrivedAtFoodBowl = (id) => {
      const item = this.itemManager.getItem(id);
      const cricket = this.itemManager.peekTopCricket(id);
      if (item && cricket) {
        gecko.startEatAnimation(
          id,
          cricket,
          item.position,
          () => this.itemManager.eatCricket(id)
        );
      }
    };
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    canvas.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.pointerDownPos.set(e.clientX, e.clientY);
    });

    canvas.addEventListener('pointerup', (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;

      const dx = e.clientX - this.pointerDownPos.x;
      const dy = e.clientY - this.pointerDownPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return; // was a drag

      this.mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.itemManager.placeModeActive) {
        const placed = this.itemManager.tryPlace(this.mouse, this.sceneSetup.camera, this.enclosure.bounds);
        if (placed) {
          this.ui.showTip('Placed! Click again to place more, or press Esc to exit.', 2200);
        } else {
          this.ui.showTip('Click inside the enclosure boundary', 1500);
        }
      } else {
        // Try clicking a gecko first
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(this.mouse, this.sceneSetup.camera);
        let clickedGecko = false;
        for (let i = 0; i < this.geckos.length; i++) {
          const hits = raycaster.intersectObjects(this.geckos[i].group.children, true);
          if (hits.length > 0) {
            this.activeGeckoIndex = i;
            this.ui.selectGeckoTab(i, this.geckos[i].name, this.geckos[i].getColors());
            const name = this.geckos[i].name || 'Gecko';
            const newName = prompt('Rename gecko:', name);
            if (newName !== null && newName.trim()) {
              this.geckos[i].name = newName.trim();
              this.ui.selectGeckoTab(i, newName.trim(), this.geckos[i].getColors());
              const tab = document.querySelector(`.gecko-tab[data-index="${i}"]`);
              if (tab) tab.textContent = newName.trim();
            }
            clickedGecko = true;
            break;
          }
        }
        if (!clickedGecko) {
          this.itemManager.trySelect(this.mouse, this.sceneSetup.camera);
        }
      }
    });
  }

  private serializeState() {
    const items = this.itemManager.getItems().map(it => ({
      t: it.type,
      x: +it.position.x.toFixed(3),
      y: +it.position.y.toFixed(3),
      z: +it.position.z.toFixed(3),
      r: +it.mesh.rotation.y.toFixed(3),
      ws: it.mesh.userData.wallSide || undefined,
      ud: {
        lampRadius: it.mesh.userData.lampRadius,
        itemScale: it.mesh.userData.itemScale,
        itemColor: it.mesh.userData.itemColor,
        plantStyle: it.mesh.userData.plantStyle,
      },
    }));
    const geckoData = this.geckos.map(g => ({
      name: g.name,
      colors: g.getColors(),
    }));
    return {
      enc: { w: +(this.enclosure.bounds.maxX * 2 + 0.16).toFixed(1), d: +(this.enclosure.bounds.maxZ * 2 + 0.16).toFixed(1), h: this.enclosure.bounds.maxY },
      items,
      geckos: geckoData,
    };
  }

  private loadFromHash() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    try {
      const state = JSON.parse(atob(hash));
      if (state.enc) {
        const { w, d, h } = state.enc;
        this.enclosure.resize(w, d, h);
        this.itemManager.setFloor(this.enclosure.floorMesh);
        this.itemManager.setWalls(this.enclosure.wallMeshes);
        const wSlider = document.getElementById('enc-w') as HTMLInputElement;
        const dSlider = document.getElementById('enc-d') as HTMLInputElement;
        const hSlider = document.getElementById('enc-h') as HTMLInputElement;
        if (wSlider) { wSlider.value = String(w); document.getElementById('enc-w-val')!.textContent = String(w); }
        if (dSlider) { dSlider.value = String(d); document.getElementById('enc-d-val')!.textContent = String(d); }
        if (hSlider) { hSlider.value = String(h); document.getElementById('enc-h-val')!.textContent = String(h); }
      }
      if (state.items) {
        this.itemManager.clearAll();
        for (const it of state.items) {
          const ud: Record<string, unknown> = {};
          if (it.ud?.lampRadius) ud.lampRadius = it.ud.lampRadius;
          if (it.ud?.itemScale) ud.itemScale = it.ud.itemScale;
          if (it.ud?.itemColor !== undefined) ud.itemColor = it.ud.itemColor;
          if (it.ud?.plantStyle) ud.plantStyle = it.ud.plantStyle;
          this.itemManager.placeItemDirect(it.t, it.x, it.y, it.z, it.r, it.ws, Object.keys(ud).length ? ud : undefined);
        }
      }
      if (state.geckos) {
        for (let i = 0; i < state.geckos.length; i++) {
          const gd = state.geckos[i];
          let g: Gecko;
          if (i === 0) {
            g = this.geckos[0];
          } else if (this.geckos.length < 2) {
            g = new Gecko(this.sceneSetup.scene);
            const b = this.enclosure.bounds;
            g.group.position.set((b.minX + b.maxX) / 2 + 0.5, 0, (b.minZ + b.maxZ) / 2);
            this.geckos.push(g);
            this.setupGeckoCallbacks(g);
            this.ui.addGeckoTab(i, gd.name);
          } else {
            g = this.geckos[i];
          }
          g.name = gd.name;
          if (gd.colors) {
            g.setBodyColor(gd.colors.body);
            g.setSpotColor(gd.colors.spot);
            g.setBellyColor(gd.colors.belly);
            g.setTailBandColor(gd.colors.tailBand);
            g.setTailBaseColor(gd.colors.tailBase);
            g.setEyeColor(gd.colors.eye);
          }
        }
        this.activeGeckoIndex = 0;
        const g = this.geckos[0];
        this.ui.selectGeckoTab(0, g.name, g.getColors());
        const tab = document.querySelector('.gecko-tab[data-index="0"]');
        if (tab) tab.textContent = g.name;
      }
      this.ui.showTip('Build loaded from shared link!', 3000);
    } catch {
      // invalid hash, ignore
    }
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05);

    for (const g of this.geckos) {
      g.update(delta, this.itemManager.getItems(), this.enclosure.bounds);
    }
    this.itemManager.update(delta, this.mouse, this.sceneSetup.camera, this.enclosure.bounds);
    this.sceneSetup.update();
  }
}

new GeckoHomeApp();
