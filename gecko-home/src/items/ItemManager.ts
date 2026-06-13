import * as THREE from 'three';
import { ItemType, createItemMesh, createCricketMesh } from './ItemTypes.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';

export interface PlacedItem {
  id: number;
  type: ItemType;
  mesh: THREE.Group;
  position: THREE.Vector3;
}

const MAX_CRICKETS = 6;

export class ItemManager {
  private scene: THREE.Scene;
  private items: PlacedItem[] = [];
  private nextId = 1;

  placeModeActive = false;
  selectedType: ItemType = ItemType.SLEEPING_HIDE;

  private ghost: THREE.Group | null = null;
  private ghostValid = false;

  selectedItem: PlacedItem | null = null;

  private floorMesh: THREE.Mesh;

  private selectionRing: THREE.Mesh;
  private cricketTime = 0;

  onSelectionChange?: (item: PlacedItem | null) => void;

  constructor(scene: THREE.Scene, floorMesh: THREE.Mesh) {
    this.scene = scene;
    this.floorMesh = floorMesh;

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.44, 28),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.006;
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

  // ── Ghost preview ─────────────────────────────────────────────────────────
  private updateGhost(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObject(this.floorMesh, false);

    if (hits.length === 0) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const pt = hits[0].point;
    this.ghostValid = pt.x >= bounds.minX && pt.x <= bounds.maxX &&
                      pt.z >= bounds.minZ && pt.z <= bounds.maxZ;

    if (!this.ghost) {
      this.ghost = createItemMesh(this.selectedType);
      this.ghost.traverse(child => {
        const m = child as THREE.Mesh;
        if (!m.isMesh) return;
        const applyGhost = (mat: THREE.MeshLambertMaterial) => {
          const c = mat.clone();
          c.transparent = true; c.opacity = 0.45; c.depthWrite = false;
          return c;
        };
        m.material = Array.isArray(m.material)
          ? (m.material as THREE.MeshLambertMaterial[]).map(applyGhost)
          : applyGhost(m.material as THREE.MeshLambertMaterial);
      });
      this.scene.add(this.ghost);
    }

    this.ghost.visible = true;
    this.ghost.position.set(pt.x, 0, pt.z);

    const tintHex = this.ghostValid ? 0xffffff : 0xff4444;
    this.ghost.traverse(child => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material)
        ? m.material as THREE.MeshLambertMaterial[]
        : [m.material as THREE.MeshLambertMaterial];
      mats.forEach(mat => mat.color.setHex(tintHex));
    });
  }

  // ── Place item ────────────────────────────────────────────────────────────
  tryPlace(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds): boolean {
    if (!this.placeModeActive || !this.ghostValid) return false;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObject(this.floorMesh, false);
    if (!hits.length) return false;

    const pt = hits[0].point;
    const mesh = createItemMesh(this.selectedType);
    mesh.position.set(pt.x, 0, pt.z);
    mesh.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
    this.scene.add(mesh);

    this.items.push({
      id: this.nextId++,
      type: this.selectedType,
      mesh,
      position: new THREE.Vector3(pt.x, 0, pt.z),
    });
    return true;
  }

  // ── Select item ───────────────────────────────────────────────────────────
  trySelect(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera): boolean {
    if (this.placeModeActive) return false;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);
    const meshes = this.items.map(i => i.mesh);
    const hits = raycaster.intersectObjects(meshes, true);

    if (!hits.length) {
      this.selectedItem = null;
      this.selectionRing.visible = false;
      this.onSelectionChange?.(null);
      return false;
    }

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !meshes.includes(obj as THREE.Group)) obj = obj.parent;
    const found = obj ? this.items.find(i => i.mesh === obj) : undefined;
    if (!found) return false;

    this.selectedItem = found;
    this.selectionRing.position.set(found.position.x, 0.006, found.position.z);
    this.selectionRing.visible = true;
    this.onSelectionChange?.(found);
    return true;
  }

  // ── Move / rotate / delete ────────────────────────────────────────────────
  moveSelected(dx: number, dz: number, bounds: EnclosureBounds) {
    if (!this.selectedItem) return;
    const item = this.selectedItem;
    item.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x + dx));
    item.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, item.position.z + dz));
    item.mesh.position.set(item.position.x, 0, item.position.z);
    this.selectionRing.position.set(item.position.x, 0.006, item.position.z);
  }

  rotateSelected(angle: number) {
    if (this.selectedItem) this.selectedItem.mesh.rotation.y += angle;
  }

  deleteSelected() {
    if (!this.selectedItem) return;
    this.removeCrickets(this.selectedItem);
    this.scene.remove(this.selectedItem.mesh);
    this.items = this.items.filter(i => i !== this.selectedItem);
    this.selectedItem = null;
    this.selectionRing.visible = false;
    this.onSelectionChange?.(null);
  }

  // ── Cricket system ────────────────────────────────────────────────────────
  addCrickets(item: PlacedItem): boolean {
    if (item.type !== ItemType.FOOD_BOWL) return false;
    const existing: THREE.Group[] = item.mesh.userData.crickets ?? [];
    if (existing.length >= MAX_CRICKETS) return false;

    const count = Math.min(MAX_CRICKETS - existing.length, 4);
    for (let i = 0; i < count; i++) {
      const cricket = createCricketMesh();
      const angle = (existing.length + i) / MAX_CRICKETS * Math.PI * 2;
      cricket.position.set(
        Math.cos(angle) * 0.14,
        0.08,
        Math.sin(angle) * 0.14
      );
      cricket.userData.bouncePhase = Math.random() * Math.PI * 2;
      cricket.userData.bounceSpeed = 4 + Math.random() * 3;
      item.mesh.add(cricket);
      existing.push(cricket);
    }
    item.mesh.userData.crickets = existing;
    item.mesh.userData.hasCrickets = existing.length > 0;
    return true;
  }

  eatCricket(itemId: number) {
    const item = this.items.find(i => i.id === itemId);
    if (!item || item.type !== ItemType.FOOD_BOWL) return;
    const crickets: THREE.Group[] = item.mesh.userData.crickets ?? [];
    if (!crickets.length) return;
    const eaten = crickets.pop()!;
    item.mesh.remove(eaten);
    item.mesh.userData.hasCrickets = crickets.length > 0;
  }

  hasCrickets(itemId: number): boolean {
    const item = this.items.find(i => i.id === itemId);
    return !!(item?.mesh.userData.hasCrickets);
  }

  private removeCrickets(item: PlacedItem) {
    const crickets: THREE.Group[] = item.mesh.userData.crickets ?? [];
    crickets.forEach(c => item.mesh.remove(c));
    item.mesh.userData.crickets = [];
    item.mesh.userData.hasCrickets = false;
  }

  getItems(): PlacedItem[] { return this.items; }

  clampAllToBounds(bounds: EnclosureBounds) {
    for (const item of this.items) {
      item.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x));
      item.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, item.position.z));
      item.mesh.position.set(item.position.x, 0, item.position.z);
    }
  }

  private destroyGhost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
  }

  // ── Frame update ──────────────────────────────────────────────────────────
  update(delta: number, mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds) {
    this.cricketTime += delta;

    if (this.placeModeActive) this.updateGhost(mouseVec, camera, bounds);

    // Animate crickets on all food bowls
    for (const item of this.items) {
      if (item.type !== ItemType.FOOD_BOWL) continue;
      const crickets: THREE.Group[] = item.mesh.userData.crickets ?? [];
      for (const c of crickets) {
        const phase: number = c.userData.bouncePhase ?? 0;
        const speed: number = c.userData.bounceSpeed ?? 5;
        const bounce = Math.max(0, Math.sin(this.cricketTime * speed + phase));
        c.position.y = 0.08 + bounce * 0.055;
        // Wiggle antennae slightly
        c.rotation.y = Math.sin(this.cricketTime * 2.5 + phase) * 0.3;
      }
    }

    // Keep selection ring on selected item
    if (this.selectedItem) {
      this.selectionRing.position.set(this.selectedItem.position.x, 0.006, this.selectedItem.position.z);
    }
  }
}
