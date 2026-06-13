import * as THREE from 'three';
import type { PlacedItem } from '../items/ItemManager.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';

const WALK_SPEED = 0.8;
const ARRIVE_DISTANCE = 0.22;
const IDLE_WAIT_MIN = 2.0;
const IDLE_WAIT_MAX = 5.0;
const WANDER_RADIUS = 0.5;
const ROTATE_SPEED = 5.0;
const LEG_SWING_SPEED = 8.0;
const BODY_BOB_SPEED = 12.0;

type GeckoState = 'IDLE' | 'WALKING' | 'ARRIVED';

export class Gecko {
  group = new THREE.Group();

  private body!: THREE.Mesh;
  private head!: THREE.Mesh;
  private tail!: THREE.Group;
  private legs: THREE.Mesh[] = [];

  private state: GeckoState = 'IDLE';
  private idleTimer = 0;
  private target = new THREE.Vector3();
  private walkTime = 0;

  private statusEl: HTMLElement | null = null;

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);
    this.statusEl = document.getElementById('gecko-status');
  }

  private buildMesh() {
    const baseMat = new THREE.MeshLambertMaterial({ color: 0xa8c060 }); // olive green
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x7a9040 });
    const spotMat = new THREE.MeshLambertMaterial({ color: 0xf0c060 }); // yellow spots
    const eyeMat  = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x000000 });

    // Body
    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), baseMat);
    this.body.scale.set(1.5, 0.55, 1.0);
    this.body.position.y = 0.082;
    this.body.castShadow = true;

    // Spots on body
    for (let i = 0; i < 6; i++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), spotMat);
      const a = (i / 6) * Math.PI * 2;
      spot.position.set(
        Math.cos(a) * 0.11,
        0.082 + 0.07,
        Math.sin(a) * 0.07
      );
      this.group.add(spot);
    }

    // Head
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.14), baseMat);
    this.head.position.set(0.25, 0.085, 0);
    this.head.castShadow = true;

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), darkMat);
    snout.position.set(0.33, 0.082, 0);
    this.group.add(snout);

    // Eyes
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
      eye.position.set(0.24, 0.115, side * 0.07);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 6), pupilMat);
      pupil.position.set(0.26, 0.115, side * 0.07);
      this.group.add(eye, pupil);
    }

    // Nostril dots
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.008, 4, 4),
        new THREE.MeshLambertMaterial({ color: 0x3a5010 }));
      nostril.position.set(0.365, 0.09, side * 0.025);
      this.group.add(nostril);
    }

    // Tail (segmented)
    this.tail = new THREE.Group();
    const tailSegments = 5;
    for (let i = 0; i < tailSegments; i++) {
      const r = 0.055 - i * 0.008;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(r, 0.01), 6, 5),
        i % 2 === 0 ? baseMat : spotMat
      );
      seg.scale.set(0.8, 0.45, 0.8);
      seg.position.x = -0.16 - i * 0.1;
      seg.position.y = 0.082;
      this.tail.add(seg);
    }

    // Legs (4)
    const legPositions: [number, number, number, string][] = [
      [ 0.12,  0,  0.14, 'fl'],
      [ 0.12,  0, -0.14, 'fr'],
      [-0.10,  0,  0.14, 'rl'],
      [-0.10,  0, -0.14, 'rr'],
    ];

    for (const [lx, ly, lz, name] of legPositions) {
      const legGroup = new THREE.Group();
      legGroup.position.set(lx as number, ly as number, lz as number);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.1, 5), darkMat);
      upper.position.y = -0.02;
      upper.rotation.z = (lz as number) > 0 ? Math.PI / 5 : -Math.PI / 5;

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.09, 5), darkMat);
      lower.position.y = -0.075;

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), darkMat);
      foot.position.y = -0.12;
      foot.scale.set(1.4, 0.4, 1.0);

      legGroup.add(upper, lower, foot);
      legGroup.userData.side = (lz as number) > 0 ? 1 : -1;
      legGroup.userData.isFront = (lx as number) > 0;
      this.legs.push(legGroup as unknown as THREE.Mesh);
      this.group.add(legGroup);
    }

    this.group.add(this.body, this.head, this.tail);
    this.group.rotation.y = Math.PI / 2; // face +X
  }

  private pickNewTarget(items: PlacedItem[], bounds: EnclosureBounds) {
    if (items.length > 0 && Math.random() < 0.85) {
      // Bias toward random placed item
      const item = items[Math.floor(Math.random() * items.length)];
      // Offset slightly so gecko stands beside item, not on top
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * WANDER_RADIUS,
        0,
        (Math.random() - 0.5) * WANDER_RADIUS
      );
      this.target.copy(item.position).add(offset);
    } else {
      // Random wander
      this.target.set(
        bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        0,
        bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
      );
    }
    // Clamp target inside bounds
    this.target.x = Math.max(bounds.minX + 0.15, Math.min(bounds.maxX - 0.15, this.target.x));
    this.target.z = Math.max(bounds.minZ + 0.15, Math.min(bounds.maxZ - 0.15, this.target.z));
  }

  update(delta: number, items: PlacedItem[], bounds: EnclosureBounds) {
    switch (this.state) {
      case 'IDLE':
        this.idleTimer -= delta;
        if (this.idleTimer <= 0) {
          this.pickNewTarget(items, bounds);
          this.state = 'WALKING';
          this.walkTime = 0;
        }
        break;

      case 'WALKING': {
        this.walkTime += delta;
        const diff = new THREE.Vector3(
          this.target.x - this.group.position.x,
          0,
          this.target.z - this.group.position.z
        );
        const dist = diff.length();

        if (dist < ARRIVE_DISTANCE) {
          this.state = 'ARRIVED';
          this.idleTimer = IDLE_WAIT_MIN + Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN);
          this.setStatus(`Arrived at ${this.nearestItemName(items)}`);
          break;
        }

        // Move
        const step = Math.min(WALK_SPEED * delta, dist);
        diff.normalize();

        const newX = this.group.position.x + diff.x * step;
        const newZ = this.group.position.z + diff.z * step;
        this.group.position.x = Math.max(bounds.minX + 0.15, Math.min(bounds.maxX - 0.15, newX));
        this.group.position.z = Math.max(bounds.minZ + 0.15, Math.min(bounds.maxZ - 0.15, newZ));

        // Rotate toward direction
        const targetAngle = Math.atan2(diff.x, diff.z);
        const curAngle = this.group.rotation.y;
        let angleDiff = targetAngle - curAngle;
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        this.group.rotation.y += angleDiff * Math.min(ROTATE_SPEED * delta, 1);

        // Leg animation
        this.legs.forEach((leg, i) => {
          const phase = i % 2 === 0 ? 0 : Math.PI;
          (leg as unknown as THREE.Group).rotation.x = Math.sin(this.walkTime * LEG_SWING_SPEED + phase) * 0.4;
        });

        // Body bob
        this.body.position.y = 0.082 + Math.abs(Math.sin(this.walkTime * BODY_BOB_SPEED)) * 0.015;

        this.setStatus('Walking…');
        break;
      }

      case 'ARRIVED':
        this.idleTimer -= delta;
        // Reset legs
        this.legs.forEach(leg => { (leg as unknown as THREE.Group).rotation.x *= 0.85; });
        this.body.position.y += (0.082 - this.body.position.y) * 0.1;
        if (this.idleTimer <= 0) {
          this.state = 'IDLE';
          this.idleTimer = 0.5 + Math.random() * 1.5;
          this.setStatus('Resting…');
        }
        break;
    }

    // Gentle tail sway
    const tailSway = Math.sin(Date.now() * 0.001) * 0.15;
    this.tail.rotation.y = tailSway;
  }

  private nearestItemName(items: PlacedItem[]): string {
    if (items.length === 0) return 'a spot';
    let nearest = items[0];
    let best = Infinity;
    for (const item of items) {
      const d = this.group.position.distanceTo(item.position);
      if (d < best) { best = d; nearest = item; }
    }
    return nearest.type;
  }

  private setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = `🦎 Gecko: ${text}`;
  }
}
