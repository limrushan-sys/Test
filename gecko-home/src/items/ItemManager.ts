import * as THREE from 'three';
import { ItemType, ITEM_COLLISION, createItemMesh, createCricketMesh } from './ItemTypes.js';
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

  // Gecko collision barrier — set from main so placement can avoid the gecko
  private geckoPositionGetter: (() => THREE.Vector3) | null = null;
  private static readonly GECKO_BARRIER_R = 0.22; // gecko body half-width

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

  setGeckoPositionGetter(fn: () => THREE.Vector3) { this.geckoPositionGetter = fn; }

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
    // Clamp to bounds so the ghost snaps flush to the wall instead of going red
    const cx = Math.max(bounds.minX, Math.min(bounds.maxX, pt.x));
    const cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, pt.z));
    const ghostPos = new THREE.Vector3(cx, 0, cz);
    this.ghostValid = !this.overlapsAny(ghostPos, this.selectedType);

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
    this.ghost.position.set(cx, 0, cz);

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
    const cx = Math.max(bounds.minX, Math.min(bounds.maxX, pt.x));
    const cz = Math.max(bounds.minZ, Math.min(bounds.maxZ, pt.z));
    const mesh = createItemMesh(this.selectedType);
    mesh.position.set(cx, 0, cz);
    mesh.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
    this.scene.add(mesh);

    this.items.push({
      id: this.nextId++,
      type: this.selectedType,
      mesh,
      position: new THREE.Vector3(cx, 0, cz),
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
    (this.selectionRing.material as THREE.MeshBasicMaterial).color.setHex(0xffcc00);
    this.onSelectionChange?.(found);
    return true;
  }

  // ── Move / rotate / delete ────────────────────────────────────────────────
  moveSelected(dx: number, dz: number, bounds: EnclosureBounds) {
    if (!this.selectedItem) return;
    const item = this.selectedItem;
    const r = this.footprintR(item.type);
    const reqX = item.position.x + dx;
    const reqZ = item.position.z + dz;
    const nx = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, reqX));
    const nz = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, reqZ));
    const newPos = new THREE.Vector3(nx, 0, nz);

    // Block if the requested move was clipped by a wall, or if new position overlaps another item
    const hitWall = Math.abs(nx - reqX) > 0.001 || Math.abs(nz - reqZ) > 0.001;
    const blocked = hitWall || this.overlapsAny(newPos, item.type, item.id);
    const ringMat = this.selectionRing.material as THREE.MeshBasicMaterial;
    if (blocked) {
      ringMat.color.setHex(0xff3333); // flash ring red — don't move
    } else {
      ringMat.color.setHex(0xffcc00); // restore yellow
      item.position.x = nx;
      item.position.z = nz;
      item.mesh.position.set(nx, 0, nz);
      this.selectionRing.position.set(nx, 0.006, nz);
    }
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
      // Random position inside the bowl
      const angle = Math.random() * Math.PI * 2;
      const r = 0.04 + Math.random() * 0.10;
      cricket.position.set(Math.cos(angle) * r, 0.028, Math.sin(angle) * r);
      // Random wandering velocity
      const vAngle = Math.random() * Math.PI * 2;
      const speed  = 0.06 + Math.random() * 0.08;
      cricket.userData.velX        = Math.cos(vAngle) * speed;
      cricket.userData.velZ        = Math.sin(vAngle) * speed;
      cricket.userData.bouncePhase = Math.random() * Math.PI * 2;
      cricket.userData.bounceSpeed = 6 + Math.random() * 5;
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

  getItem(itemId: number): PlacedItem | undefined {
    return this.items.find(i => i.id === itemId);
  }

  peekTopCricket(itemId: number): THREE.Group | null {
    const item = this.items.find(i => i.id === itemId);
    if (!item) return null;
    const crickets: THREE.Group[] = item.mesh.userData.crickets ?? [];
    return crickets.length > 0 ? crickets[crickets.length - 1] : null;
  }

  clampAllToBounds(bounds: EnclosureBounds) {
    for (const item of this.items) {
      item.position.x = Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x));
      item.position.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, item.position.z));
      item.mesh.position.set(item.position.x, 0, item.position.z);
    }
  }

  // ── Overlap detection ─────────────────────────────────────────────────────
  // Radius used for item-to-item overlap (adds a small gap between items).
  private footprintR(type: ItemType): number {
    if (type === ItemType.SLEEPING_HIDE) return 0.40;
    if (type === ItemType.WATER_DISH)    return 0.70;
    const r = ITEM_COLLISION[type].radius;
    return r > 0.05 ? r + 0.04 : 0.18;
  }

  private overlapsAny(pos: THREE.Vector3, type: ItemType, excludeId?: number): boolean {
    const r1 = this.footprintR(type);
    for (const item of this.items) {
      if (item.id === excludeId) continue;
      const r2 = this.footprintR(item.type);
      const dx = pos.x - item.position.x;
      const dz = pos.z - item.position.z;
      if (dx * dx + dz * dz < (r1 + r2) * (r1 + r2)) return true;
    }
    // Check against gecko barrier — fixed radius around gecko centre, independent of item size
    if (this.geckoPositionGetter) {
      const gp = this.geckoPositionGetter();
      const gr = ItemManager.GECKO_BARRIER_R;
      const dx = pos.x - gp.x;
      const dz = pos.z - gp.z;
      if (dx * dx + dz * dz < gr * gr) return true;
    }
    return false;
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
        const phase: number  = c.userData.bouncePhase ?? 0;
        const bSpeed: number = c.userData.bounceSpeed ?? 7;
        let velX: number     = c.userData.velX ?? 0.05;
        let velZ: number     = c.userData.velZ ?? 0.05;

        // Move cricket in XZ plane
        const BOWL_R = 0.14; // max wander radius (stays inside bowl bottom)
        let cx = c.position.x + velX * delta;
        let cz = c.position.z + velZ * delta;
        const dr = Math.sqrt(cx * cx + cz * cz);
        if (dr > BOWL_R) {
          // Reflect off the circular bowl wall
          const nx = cx / dr, nz = cz / dr;
          const dot = velX * nx + velZ * nz;
          velX -= 2 * dot * nx;
          velZ -= 2 * dot * nz;
          cx = nx * BOWL_R;
          cz = nz * BOWL_R;
          c.userData.velX = velX;
          c.userData.velZ = velZ;
        }
        c.position.x = cx;
        c.position.z = cz;

        // Bounce in Y and face movement direction
        const bounce = Math.max(0, Math.sin(this.cricketTime * bSpeed + phase));
        c.position.y = 0.028 + bounce * 0.03;
        c.rotation.y = Math.atan2(velZ, velX);
      }
    }

    // Keep selection ring on selected item
    if (this.selectedItem) {
      this.selectionRing.position.set(this.selectedItem.position.x, 0.006, this.selectedItem.position.z);
    }
  }
}
