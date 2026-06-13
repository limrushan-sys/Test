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
  private isPointerDown = false;
  private pointerDownPos = new THREE.Vector2();

  constructor() {
    const canvas = document.getElementById('app-canvas') as HTMLCanvasElement;
    this.sceneSetup = new SceneSetup(canvas);

    // Enclosure
    this.enclosure = new Enclosure(this.sceneSetup.scene, 6, 4, 2);

    // Gecko
    this.gecko = new Gecko(this.sceneSetup.scene);

    // Item manager
    this.itemManager = new ItemManager(this.sceneSetup.scene, this.enclosure.floorMesh);
    this.itemManager.onSelectionChange = (item) => {
      this.ui?.showItemControls(item);
    };

    // UI
    this.ui = new UI({
      onTogglePlaceMode: (active) => {
        this.itemManager.togglePlaceMode(active);
        if (!active) this.itemManager.selectedItem = null;
      },
      onSelectItemType: (type) => {
        this.itemManager.setSelectedType(type);
      },
      onResizeEnclosure: (w, d, h) => {
        this.enclosure.resize(w, d, h);
        this.itemManager.setFloor(this.enclosure.floorMesh);
        this.itemManager.clampAllToBounds(this.enclosure.bounds);
        // Clamp gecko too
        const pos = this.gecko.group.position;
        const b = this.enclosure.bounds;
        pos.x = Math.max(b.minX + 0.2, Math.min(b.maxX - 0.2, pos.x));
        pos.z = Math.max(b.minZ + 0.2, Math.min(b.maxZ - 0.2, pos.z));
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
    });

    this.bindPointer(canvas);
    this.animate();
  }

  private bindPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
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
      const moved = Math.sqrt(dx * dx + dy * dy);
      if (moved > 5) return; // was a drag, not a click

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (this.itemManager.placeModeActive) {
        const placed = this.itemManager.tryPlace(this.mouse, this.sceneSetup.camera, this.enclosure.bounds);
        if (placed) {
          this.ui.showTip(`Placed! Click again to place more, or press Escape to exit place mode.`, 2500);
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
    const delta = this.clock.getDelta();

    this.gecko.update(delta, this.itemManager.getItems(), this.enclosure.bounds);
    this.itemManager.update(this.mouse, this.sceneSetup.camera, this.enclosure.bounds);
    this.sceneSetup.update();
  }
}

new GeckoHomeApp();
