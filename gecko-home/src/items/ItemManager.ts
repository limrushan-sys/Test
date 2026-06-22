import * as THREE from 'three';
import { ItemType, ITEM_COLLISION, createItemMesh, createCricketMesh } from './ItemTypes.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';

type WallSide = 'front' | 'back' | 'left' | 'right';

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
  private wallMeshes: THREE.Mesh[] = [];

  // Gecko collision barrier — set from main so placement can avoid the gecko
  private geckoPositionGetter: (() => THREE.Vector3) | null = null;
  private static readonly GECKO_BARRIER_R = 0.13; // just prevents placing directly on the gecko

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
  setWalls(meshes: THREE.Mesh[]) { this.wallMeshes = meshes; }

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

  private wallPlacement(hit: THREE.Vector3, bounds: EnclosureBounds): { pos: THREE.Vector3; rotY: number; wall: WallSide } | null {
    const hw = (bounds.maxX - bounds.minX) / 2;
    const hd = (bounds.maxZ - bounds.minZ) / 2;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const rx = hit.x - cx, rz = hit.z - cz;

    const dists: [WallSide, number][] = [
      ['back',  Math.abs(rz - (-hd))],
      ['front', Math.abs(rz - hd)],
      ['left',  Math.abs(rx - (-hw))],
      ['right', Math.abs(rx - hw)],
    ];
    dists.sort((a, b) => a[1] - b[1]);
    const wall = dists[0][0];

    let x = hit.x, z = hit.z, rotY = 0;
    const barkHalfW = 0.50;
    if (wall === 'back') {
      z = bounds.minZ; rotY = 0;
    } else if (wall === 'front') {
      z = bounds.maxZ; rotY = Math.PI;
    } else if (wall === 'left') {
      x = bounds.minX; rotY = Math.PI / 2;
    } else {
      x = bounds.maxX; rotY = -Math.PI / 2;
    }
    if (wall === 'back' || wall === 'front') {
      x = Math.max(bounds.minX + barkHalfW, Math.min(bounds.maxX - barkHalfW, x));
    } else {
      z = Math.max(bounds.minZ + barkHalfW, Math.min(bounds.maxZ - barkHalfW, z));
    }
    const barkH = 0.08;
    const maxY = bounds.maxY * 0.30;
    const y = Math.max(0, Math.min(maxY, hit.y - barkH / 2));
    return { pos: new THREE.Vector3(x, y, z), rotY, wall };
  }

  // ── Ghost preview ─────────────────────────────────────────────────────────
  private updateGhost(mouseVec: THREE.Vector2, camera: THREE.PerspectiveCamera, bounds: EnclosureBounds) {
    const isWall = ITEM_COLLISION[this.selectedType].wallMounted;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);

    let pt: THREE.Vector3 | null = null;
    let wallRotY = 0;
    let wallSide: WallSide | null = null;

    if (isWall) {
      const hits = raycaster.intersectObjects(this.wallMeshes, false);
      if (hits.length > 0) {
        const wp = this.wallPlacement(hits[0].point, bounds);
        if (wp) { pt = wp.pos; wallRotY = wp.rotY; wallSide = wp.wall; }
      }
    } else {
      const hits = raycaster.intersectObject(this.floorMesh, false);
      if (hits.length > 0) pt = hits[0].point;
    }

    if (!pt) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }

    const ghostPos = isWall ? pt : new THREE.Vector3(pt.x, 0, pt.z);
    const ghostRot = this.ghost?.rotation.y ?? wallRotY ?? 0;
    this.ghostValid = !this.overlapsAny(ghostPos, this.selectedType, undefined, ghostRot) &&
      (isWall || this.fitsInBounds(ghostPos, this.selectedType, bounds, ghostRot));

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
    if (isWall) {
      this.ghost.position.copy(pt);
      this.ghost.rotation.y = wallRotY;
    } else {
      this.ghost.position.set(pt.x, 0, pt.z);
    }

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

    const isWall = ITEM_COLLISION[this.selectedType].wallMounted;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouseVec, camera);

    let pos: THREE.Vector3;
    let rotY = 0;
    let wallSide: WallSide | null = null;

    if (isWall) {
      const hits = raycaster.intersectObjects(this.wallMeshes, false);
      if (!hits.length) return false;
      const wp = this.wallPlacement(hits[0].point, bounds);
      if (!wp) return false;
      pos = wp.pos; rotY = wp.rotY; wallSide = wp.wall;
    } else {
      const hits = raycaster.intersectObject(this.floorMesh, false);
      if (!hits.length) return false;
      pos = new THREE.Vector3(hits[0].point.x, 0, hits[0].point.z);
    }

    const mesh = createItemMesh(this.selectedType);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    if (wallSide) {
      mesh.userData.wallSide = wallSide;
      mesh.userData.wallNormal = this.wallNormal(wallSide);
    }
    if (this.selectedType !== ItemType.BASKING_LAMP) {
      mesh.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
    }
    this.scene.add(mesh);

    this.items.push({
      id: this.nextId++,
      type: this.selectedType,
      mesh,
      position: pos.clone(),
    });
    return true;
  }

  placeItemDirect(type: ItemType, x: number, y: number, z: number, rotY: number, wallSide?: string, userData?: Record<string, unknown>) {
    const mesh = createItemMesh(type);
    const pos = new THREE.Vector3(x, y, z);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    if (wallSide) {
      mesh.userData.wallSide = wallSide;
      mesh.userData.wallNormal = this.wallNormal(wallSide as WallSide);
    }
    if (userData) Object.assign(mesh.userData, userData);
    if (type !== ItemType.BASKING_LAMP) {
      mesh.traverse(c => { if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).castShadow = true; });
    }
    this.scene.add(mesh);
    this.items.push({ id: this.nextId++, type, mesh, position: pos.clone() });
  }

  clearAll() {
    for (const item of this.items) this.scene.remove(item.mesh);
    this.items = [];
    this.selectedItem = null;
  }

  private wallNormal(side: WallSide): THREE.Vector3 {
    if (side === 'back')  return new THREE.Vector3( 0, 0,  1);
    if (side === 'front') return new THREE.Vector3( 0, 0, -1);
    if (side === 'left')  return new THREE.Vector3( 1, 0,  0);
    return new THREE.Vector3(-1, 0,  0);
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
    const newPos = new THREE.Vector3(item.position.x + dx, item.position.y, item.position.z + dz);

    const rotY = item.mesh.rotation.y;
    const blocked = this.overlapsAny(newPos, item.type, item.id, rotY) ||
      !this.fitsInBounds(newPos, item.type, bounds, rotY);
    const ringMat = this.selectionRing.material as THREE.MeshBasicMaterial;
    if (blocked) {
      ringMat.color.setHex(0xff3333);
    } else {
      ringMat.color.setHex(0xffcc00);
      item.position.x = newPos.x;
      item.position.z = newPos.z;
      item.mesh.position.x = newPos.x;
      item.mesh.position.z = newPos.z;
      this.selectionRing.position.set(newPos.x, 0.006, newPos.z);
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
      if (ITEM_COLLISION[item.type].wallMounted) continue;
      const r = this.footprintR(item.type);
      item.position.x = Math.max(bounds.minX + r, Math.min(bounds.maxX - r, item.position.x));
      item.position.z = Math.max(bounds.minZ + r, Math.min(bounds.maxZ - r, item.position.z));
      item.mesh.position.set(item.position.x, item.position.y, item.position.z);
    }
  }

  // ── Overlap detection ─────────────────────────────────────────────────────
  private static LEAF_BLOCKED: Set<ItemType> = new Set([
    ItemType.FOOD_BOWL, ItemType.WATER_DISH, ItemType.SLEEPING_HIDE, ItemType.PLATFORM,
  ]);

  private footprintR(type: ItemType): number {
    const col = ITEM_COLLISION[type];
    if (col.circles) {
      let maxR = 0;
      for (const [lx, lz, cr] of col.circles) {
        maxR = Math.max(maxR, Math.sqrt(lx * lx + lz * lz) + cr);
      }
      return maxR;
    }
    return col.footprint ?? col.radius;
  }

  private getWorldCircles(type: ItemType, pos: THREE.Vector3, rotY: number): [number, number, number][] {
    const col = ITEM_COLLISION[type];
    if (col.circles) {
      const c = Math.cos(rotY), s = Math.sin(rotY);
      return col.circles.map(([lx, lz, r]) => [
        pos.x + lx * c - lz * s,
        pos.z + lx * s + lz * c,
        r,
      ] as [number, number, number]);
    }
    const r = col.footprint ?? col.radius;
    return [[pos.x, pos.z, r]];
  }

  private overlapsAny(pos: THREE.Vector3, type: ItemType, excludeId?: number, rotY = 0): boolean {
    if (type === ItemType.BASKING_LAMP) return false;
    const isLeaf = type === ItemType.LEAF_DECOR;
    const myCircles = this.getWorldCircles(type, pos, rotY);
    for (const item of this.items) {
      if (item.id === excludeId) continue;
      if (item.type === ItemType.BASKING_LAMP) continue;
      if (isLeaf && !ItemManager.LEAF_BLOCKED.has(item.type)) continue;
      if (!isLeaf && item.type === ItemType.LEAF_DECOR) continue;
      const otherCircles = this.getWorldCircles(item.type, item.position, item.mesh.rotation.y);
      for (const [ax, az, ar] of myCircles) {
        for (const [bx, bz, br] of otherCircles) {
          const dx = ax - bx, dz = az - bz;
          const sr = ar + br;
          if (dx * dx + dz * dz < sr * sr) return true;
        }
      }
    }
    if (this.geckoPositionGetter) {
      const gp = this.geckoPositionGetter();
      const gr = ItemManager.GECKO_BARRIER_R;
      const dx = pos.x - gp.x;
      const dz = pos.z - gp.z;
      if (dx * dx + dz * dz < gr * gr) return true;
    }
    return false;
  }

  private fitsInBounds(pos: THREE.Vector3, type: ItemType, bounds: EnclosureBounds, rotY = 0): boolean {
    const col = ITEM_COLLISION[type];
    if (!col.circles) {
      const r = col.footprint ?? col.radius;
      if (pos.x - r < bounds.minX || pos.x + r > bounds.maxX) return false;
      if (pos.z - r < bounds.minZ || pos.z + r > bounds.maxZ) return false;
      return true;
    }
    const c = Math.cos(rotY), s = Math.sin(rotY);
    for (const [lx, lz, r] of col.circles) {
      const wx = pos.x + lx * c - lz * s;
      const wz = pos.z + lx * s + lz * c;
      if (wx - r < bounds.minX || wx + r > bounds.maxX) return false;
      if (wz - r < bounds.minZ || wz + r > bounds.maxZ) return false;
    }
    return true;
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
