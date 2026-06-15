import './style.css';
import * as THREE from 'three';
import { SceneSetup } from './scene/SceneSetup.js';
import { Enclosure } from './scene/Enclosure.js';
import { Gecko } from './gecko/Gecko.js';
import { ItemManager } from './items/ItemManager.js';
import { ItemType } from './items/ItemTypes.js';
import { UI } from './ui/UI.js';

class GeckoHomeApp {
  private sceneSetup: SceneSetup;
  private enclosure: Enclosure;
  private gecko: Gecko;
  private itemManager: ItemManager;
  private ui: UI;

  private clock = new THREE.Clock();
  private mouse = new THREE.Vector2();
  private pointerDownPos = new THREE.Vector2();
  private isPointerDown = false;

  constructor() {
    const canvas = document.getElementById('app-canvas') as HTMLCanvasElement;
    this.sceneSetup = new SceneSetup(canvas);

    this.enclosure = new Enclosure(this.sceneSetup.scene, 6, 4, 2);

    this.gecko = new Gecko(this.sceneSetup.scene);

    this.itemManager = new ItemManager(this.sceneSetup.scene, this.enclosure.floorMesh);
    this.itemManager.setGeckoPositionGetter(() => this.gecko.group.position);

    // When gecko reaches a food bowl, play tongue-shoot eating animation
    this.gecko.onArrivedAtFoodBowl = (id) => {
      const item = this.itemManager.getItem(id);
      const cricket = this.itemManager.peekTopCricket(id);
      if (item && cricket) {
        this.gecko.startEatAnimation(
          id,
          cricket,
          item.position,
          () => this.itemManager.eatCricket(id)
        );
      }
    };

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
        this.itemManager.clampAllToBounds(this.enclosure.placementBounds);
        const pos = this.gecko.group.position;
        const b   = this.enclosure.bounds;
        pos.x = Math.max(b.minX + 0.2, Math.min(b.maxX - 0.2, pos.x));
        pos.z = Math.max(b.minZ + 0.2, Math.min(b.maxZ - 0.2, pos.z));
      },
      onMoveItem: (dx, dz) => {
        this.itemManager.moveSelected(dx, dz, this.enclosure.placementBounds);
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
    });

    this.bindPointer(canvas);
    this.animate();
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
        const placed = this.itemManager.tryPlace(this.mouse, this.sceneSetup.camera, this.enclosure.placementBounds);
        if (placed) {
          this.ui.showTip('Placed! Click again to place more, or press Esc to exit.', 2200);
        } else {
          this.ui.showTip('Click inside the enclosure boundary', 1500);
        }
      } else {
        this.itemManager.trySelect(this.mouse, this.sceneSetup.camera);
      }
    });
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.05); // cap at 50ms

    this.gecko.update(delta, this.itemManager.getItems(), this.enclosure.bounds);
    this.itemManager.update(delta, this.mouse, this.sceneSetup.camera, this.enclosure.placementBounds);
    this.sceneSetup.update();
  }
}

new GeckoHomeApp();
