import * as THREE from 'three';
import { ItemType, createItemMesh } from './ItemTypes.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';

export interface PlacedItem {
  id: number;
  type: ItemType;
  mesh: THREE.Group;
  position: THREE.Vector3;
}

export class ItemManager {
  private scene: THREE.Scene;
  private items: PlacedItem[] = [];
  private nextId = 1;

  placeModeActive = false;
  selectedType: ItemType = ItemType.SLEEPING_HIDE;

  // Ghost preview
  private ghost: THREE.Group | null = null;
  private ghostValid = false;

  // Selected item for editing
  selectedItem: PlacedItem | null = null;

  // Floor reference for raycasting
  private floorMesh: THREE.Mesh;

  // Highlight outline
  private selectionRing: THREE.Mesh;

  onSelectionChange?: (item: PlacedItem | null) => void;

  constructor(scene: THREE.Scene, floorMesh: THREE.Mesh) {
    this.scene = scene;
    this.floorMesh = floorMesh;

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.005;
    this.selectionRing.visible = false;
    scene.add(this.selectionRing);
  }

  setFloor(mesh: THREE.Mesh) { this.floorMesh = mesh; }

  togglePlaceMode(active?: boolean) {
    this.placeModeActive = active !== undefined ? active : !this.placeModeActive;
    if (!this.placeModeActive) this.destroyGhost();
    this.selectedItem = null;
    this.selectionRing.visible = false;
    this.onSelectionChange?.(null);
  }

  setSelectedType(type: ItemType) {
    this.selectedType = type;
    this.destroyGhost();
  }

  updateGhost(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds) {
    if (!this.placeModeActive) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObject(this.floorMesh, false);

    if (hits.length === 0) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const pt = hits[0].point;
    this.ghostValid = (
      pt.x >= bounds.minX && pt.x <= bounds.maxX &&
      pt.z >= bounds.minZ && pt.z <= bounds.maxZ
    );

    if (!this.ghost) {
      this.ghost = createItemMesh(this.selectedType);
      this.ghost.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (Array.isArray(m.material)) {
            m.material = m.material.map(mat => {
              const c = (mat as THREE.MeshLambertMaterial).clone();
              c.transparent = true; c.opacity = 0.5; c.depthWrite = false;
              return c;
            });
          } else {
            const c = (m.material as THREE.MeshLambertMaterial).clone();
            c.transparent = true; c.opacity = 0.5; c.depthWrite = false;
            m.material = c;
          }
        }
      });
      this.scene.add(this.ghost);
    }

    this.ghost.visible = true;
    this.ghost.position.set(pt.x, 0, pt.z);

    // Tint based on valid/invalid
    this.ghost.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mats = Array.isArray((child as THREE.Mesh).material)
          ? (child as THREE.Mesh).material as THREE.MeshLambertMaterial[]
          : [(child as THREE.Mesh).material as THREE.MeshLambertMaterial];
        mats.forEach(mat => {
          mat.color.setHex(this.ghostValid ? 0xffffff : 0xff4444);
        });
      }
    });
  }

  tryPlace(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds): boolean {
    if (!this.placeModeActive) return false;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObject(this.floorMesh, false);
    if (hits.length === 0) return false;

    const pt = hits[0].point;
    if (!this.ghostValid) return false;

    const mesh = createItemMesh(this.selectedType);
    mesh.position.set(pt.x, 0, pt.z);
    mesh.castShadow = true;
    mesh.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
    this.scene.add(mesh);

    const item: PlacedItem = {
      id: this.nextId++,
      type: this.selectedType,
      mesh,
      position: new THREE.Vector3(pt.x, 0, pt.z),
    };
    this.items.push(item);
    return true;
  }

  trySelect(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera): boolean {
    if (this.placeModeActive) return false;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const meshes = this.items.map(i => i.mesh);
    const hits = raycaster.intersectObjects(meshes, true);

    if (hits.length === 0) {
      this.selectedItem = null;
      this.selectionRing.visible = false;
      this.onSelectionChange?.(null);
      return false;
    }

    // Walk up to find the root Group
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !meshes.includes(obj as THREE.Group)) obj = obj.parent;
    if (!obj) return false;

    const found = this.items.find(i => i.mesh === obj);
    if (!found) return false;

    this.selectedItem = found;
    this.selectionRing.position.set(found.position.x, 0.005, found.position.z);
    this.selectionRing.visible = true;
    this.onSelectionChange?.(found);
    return true;
  }

  moveSelected(dx: number, dz: number, bounds: EnclosureBounds) {
    if (!this.selectedItem) return;
    const item = this.selectedItem;
    item.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x + dx));
    item.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, item.position.z + dz));
    item.mesh.position.set(item.position.x, 0, item.position.z);
    this.selectionRing.position.set(item.position.x, 0.005, item.position.z);
  }

  rotateSelected(angle: number) {
    if (!this.selectedItem) return;
    this.selectedItem.mesh.rotation.y += angle;
  }

  deleteSelected() {
    if (!this.selectedItem) return;
    this.scene.remove(this.selectedItem.mesh);
    this.items = this.items.filter(i => i !== this.selectedItem);
    this.selectedItem = null;
    this.selectionRing.visible = false;
    this.onSelectionChange?.(null);
  }

  getItems(): PlacedItem[] { return this.items; }

  private destroyGhost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
  }

  update(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds) {
    if (this.placeModeActive) {
      this.updateGhost(mouseVec, camera, bounds);
    }
    // Keep selection ring aligned if item was moved externally
    if (this.selectedItem) {
      this.selectionRing.position.set(this.selectedItem.position.x, 0.005, this.selectedItem.position.z);
    }
  }

  // Called when enclosure resizes: clamp all items inside new bounds
  clampAllToBounds(bounds: EnclosureBounds) {
    for (const item of this.items) {
      item.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x));
      item.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, item.position.z));
      item.mesh.position.set(item.position.x, 0, item.position.z);
    }
  }
}
