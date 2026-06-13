import * as THREE from 'three';
import type { PlacedItem } from '../items/ItemManager.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';
import { ITEM_COLLISION } from '../items/ItemTypes.js';

const WALK_SPEED      = 0.85;
const ARRIVE_DIST     = 0.15;
const IDLE_WAIT_MIN   = 1.5;
const IDLE_WAIT_MAX   = 4.5;
const ROTATE_SPEED    = 6.0;
const LEG_SWING_SPEED = 9.0;
const BODY_BOB_AMP    = 0.012;
const BODY_BOB_SPEED  = 14.0;

type GeckoState = 'IDLE' | 'WALKING' | 'ARRIVED';

export class Gecko {
  group = new THREE.Group();

  private bodyMesh!: THREE.Mesh;
  private tailGroup = new THREE.Group();
  private legGroups: THREE.Group[] = [];

  private bodyGeo!: THREE.SphereGeometry;
  private bodyTopColor  = new THREE.Color(0xa8c060);
  private bodyBotColor  = new THREE.Color(0xd4c890);

  private baseMat!: THREE.MeshLambertMaterial; // head, tail, legs — solid base colour
  private bodyMat!: THREE.MeshLambertMaterial; // body only — vertex colours
  private spotMat!: THREE.MeshLambertMaterial;
  private darkMat!: THREE.MeshLambertMaterial;
  private spotMeshes: THREE.Mesh[] = [];

  private state: GeckoState = 'IDLE';
  private idleTimer = 1.0;
  private target = new THREE.Vector3();
  private targetItemId: number | null = null;
  private walkTime = 0;
  private geckoY = 0;        // current Y (for climbing)
  private targetY = 0;

  private statusEl: HTMLElement | null = null;

  onArrivedAtFoodBowl?: (itemId: number) => void;

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);
    this.statusEl = document.getElementById('gecko-status');
  }

  // ── Build gecko mesh ───────────────────────────────────────────────────────
  private buildMesh() {
    this.baseMat = new THREE.MeshLambertMaterial({ color: 0xa8c060 });
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.spotMat = new THREE.MeshLambertMaterial({ color: 0xf0d070 });
    this.darkMat = new THREE.MeshLambertMaterial({ color: 0x7a9040 });
    const eyeMat   = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const pupilMat = new THREE.MeshLambertMaterial({ color: 0x050505 });
    const tongueMat = new THREE.MeshLambertMaterial({ color: 0xe05070 });

    // Body — vertex-coloured sphere: top half = body colour, bottom half = belly colour
    this.bodyGeo = new THREE.SphereGeometry(0.13, 16, 12);
    const colAttr = new THREE.BufferAttribute(
      new Float32Array(this.bodyGeo.attributes.position.count * 3), 3
    );
    this.bodyGeo.setAttribute('color', colAttr);
    this.refreshBodyColors();

    this.bodyMesh = new THREE.Mesh(this.bodyGeo, this.bodyMat);
    this.bodyMesh.scale.set(1.55, 0.52, 0.95);
    this.bodyMesh.position.y = 0.075;
    this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh);

    // Spots along back
    this.spotMeshes = [];
    for (let i = 0; i < 7; i++) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), this.spotMat);
      const t = (i / 6) - 0.5;
      spot.position.set(t * 0.32, 0.14, (i % 2 === 0 ? 1 : -1) * 0.04);
      this.group.add(spot);
      this.spotMeshes.push(spot);
    }

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.075, 0.13), this.baseMat);
    head.position.set(0.255, 0.08, 0);
    head.castShadow = true;
    this.group.add(head);

    // Snout (tapered)
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.095), this.darkMat);
    snout.position.set(0.335, 0.078, 0);
    this.group.add(snout);

    // Eyes
    for (const side of [-1, 1] as const) {
      const eye   = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeMat);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 6), pupilMat);
      eye.position.set(0.245, 0.118, side * 0.065);
      pupil.position.set(0.272, 0.118, side * 0.066);
      // Eyelid crease
      const lid = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 4, 10, Math.PI),
        this.darkMat);
      lid.rotation.z = Math.PI / 2;
      lid.position.set(0.245, 0.124, side * 0.065);
      this.group.add(eye, pupil, lid);
    }

    // Nostrils
    const nostMat = new THREE.MeshLambertMaterial({ color: 0x3a5010 });
    for (const side of [-1, 1] as const) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), nostMat);
      n.position.set(0.37, 0.088, side * 0.022);
      this.group.add(n);
    }

    // Tongue (hidden by default, shown on arrive)
    const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.045, 5), tongueMat);
    tongue.rotation.z = Math.PI / 2;
    tongue.position.set(0.40, 0.072, 0);
    tongue.name = 'tongue';
    tongue.visible = false;
    this.group.add(tongue);

    // ── Legs ────────────────────────────────────────────────────────────────
    // Order: [0]=FrontLeft [1]=FrontRight [2]=RearLeft [3]=RearRight
    const legDefs: [number, number, number][] = [
      [ 0.13,  0,  0.13],  // FL
      [ 0.13,  0, -0.13],  // FR
      [-0.10,  0,  0.13],  // RL
      [-0.10,  0, -0.13],  // RR
    ];

    for (let li = 0; li < 4; li++) {
      const [lx, ly, lz] = legDefs[li];
      const lgGroup = new THREE.Group();
      lgGroup.position.set(lx, ly, lz);

      const outSide = lz > 0 ? 1 : -1;
      // Upper leg
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.095, 5), this.darkMat);
      upper.position.set(0, -0.025, outSide * 0.022);
      upper.rotation.z = outSide * 0.35;
      lgGroup.add(upper);

      // Lower leg
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.01, 0.085, 5), this.darkMat);
      lower.position.set(0, -0.085, outSide * 0.032);
      lgGroup.add(lower);

      // Foot
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), this.darkMat);
      foot.scale.set(1.5, 0.38, 1.0);
      foot.position.set(outSide * 0.01, -0.125, outSide * 0.034);
      lgGroup.add(foot);

      this.group.add(lgGroup);
      this.legGroups.push(lgGroup);
    }

    // ── Tail — tapered cone ───────────────────────────────────────────────────
    const tail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.06, 0.72, 10),
      this.baseMat
    );
    tail.rotation.z = Math.PI / 2;   // point it along -X
    tail.position.set(-0.565, 0.075, 0); // base sits flush with body rear
    this.tailGroup.add(tail);
    this.group.add(this.tailGroup);
  }

  // ── Vertex colour gradient: top = body, bottom = belly ────────────────────
  private refreshBodyColors() {
    const pos = this.bodyGeo.attributes.position;
    const col = this.bodyGeo.attributes.color as THREE.BufferAttribute;
    const R   = 0.13; // sphere radius

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);            // -R … +R
      const t = (R - y) / (2 * R);     // 0 = top, 1 = bottom
      // smooth transition starting at 40% down, reaching belly at 100%
      const raw    = Math.max(0, (t - 0.35) / 0.65);
      const smooth = raw * raw * (3 - 2 * raw); // smoothstep
      const c = this.bodyTopColor.clone().lerp(this.bodyBotColor, smooth);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // ── Gecko colour setters ──────────────────────────────────────────────────
  setBodyColor(hex: number) {
    this.bodyTopColor.setHex(hex);
    this.baseMat.color.setHex(hex);   // head, tail, legs stay in sync
    const c = new THREE.Color(hex);
    this.darkMat.color.setRGB(c.r * 0.72, c.g * 0.78, c.b * 0.65);
    this.refreshBodyColors();
  }

  setSpotColor(hex: number | null) {
    if (hex === null) {
      this.spotMeshes.forEach(s => { s.visible = false; });
    } else {
      this.spotMeshes.forEach(s => { s.visible = true; });
      this.spotMat.color.setHex(hex);
    }
  }

  setBellyColor(hex: number) {
    this.bodyBotColor.setHex(hex);
    this.refreshBodyColors();
  }

  // ── AI update ─────────────────────────────────────────────────────────────
  update(delta: number, items: PlacedItem[], bounds: EnclosureBounds) {
    switch (this.state) {

      case 'IDLE':
        this.idleTimer -= delta;
        this.animateIdle(delta);
        if (this.idleTimer <= 0) {
          this.pickTarget(items, bounds);
          this.state = 'WALKING';
          this.walkTime = 0;
        }
        break;

      case 'WALKING': {
        this.walkTime += delta;
        const pos = this.group.position;
        const dx  = this.target.x - pos.x;
        const dz  = this.target.z - pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < ARRIVE_DIST) {
          this.state = 'ARRIVED';
          this.idleTimer = IDLE_WAIT_MIN + Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN);
          this.showTongue();
          // Notify if arrived at food bowl
          if (this.targetItemId !== null) {
            const item = items.find(i => i.id === this.targetItemId);
            if (item?.type === 'Food Bowl') this.onArrivedAtFoodBowl?.(item.id);
          }
          this.setStatus(`At ${this.nearestName(items)}`);
          break;
        }

        // Direction unit vector
        const inv = 1 / dist;
        const ndx = dx * inv, ndz = dz * inv;

        // Rotate to face movement direction
        const wantAngle = Math.atan2(ndx, ndz);
        let angleDiff   = wantAngle - this.group.rotation.y;
        while (angleDiff >  Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        this.group.rotation.y += angleDiff * Math.min(ROTATE_SPEED * delta, 1);

        // Compute new XZ position
        const step = Math.min(WALK_SPEED * delta, dist);
        let nx = pos.x + ndx * step;
        let nz = pos.z + ndz * step;

        // ── Collision with items ────────────────────────────────────────────
        this.targetY = 0;
        for (const item of items) {
          const col  = ITEM_COLLISION[item.type];
          const cdx  = nx - item.position.x;
          const cdz  = nz - item.position.z;
          const d2   = cdx * cdx + cdz * cdz;
          const r2   = col.radius * col.radius;

          if (d2 < r2) {
            if (col.climbable) {
              // Smoothly raise gecko Y
              const d = Math.sqrt(d2);
              const t = Math.min(1, 1 - d / col.radius);
              this.targetY = Math.max(this.targetY, col.height * Math.min(t * 2.5, 1));
            } else {
              // Push gecko out
              const d = Math.sqrt(d2);
              if (d < 0.001) { nx += col.radius; }
              else {
                const pushAmt = col.radius - d + 0.02;
                nx += (cdx / d) * pushAmt;
                nz += (cdz / d) * pushAmt;
              }
            }
          }
        }

        // Clamp to enclosure
        nx = Math.max(bounds.minX + 0.15, Math.min(bounds.maxX - 0.15, nx));
        nz = Math.max(bounds.minZ + 0.15, Math.min(bounds.maxZ - 0.15, nz));
        pos.x = nx;
        pos.z = nz;

        // Smooth Y for climbing
        this.geckoY += (this.targetY - this.geckoY) * Math.min(9 * delta, 1);
        pos.y = this.geckoY;

        // Leg animation — diagonal pairs (trot gait)
        // FL+RR swing together; FR+RL opposite phase
        const phases = [0, Math.PI, Math.PI, 0]; // FL, FR, RL, RR
        this.legGroups.forEach((lg, i) => {
          lg.rotation.x = Math.sin(this.walkTime * LEG_SWING_SPEED + phases[i]) * 0.42;
        });

        // Body bob
        this.bodyMesh.position.y = 0.075 + Math.abs(Math.sin(this.walkTime * BODY_BOB_SPEED)) * BODY_BOB_AMP;

        this.setStatus('Walking…');
        break;
      }

      case 'ARRIVED':
        this.idleTimer -= delta;
        // Settle legs back to neutral
        this.legGroups.forEach(lg => { lg.rotation.x *= 0.85; });
        this.bodyMesh.position.y += (0.075 - this.bodyMesh.position.y) * 0.1;
        // Descend off climbable items over time
        this.targetY = 0;
        this.geckoY += (this.targetY - this.geckoY) * Math.min(3 * delta, 1);
        this.group.position.y = this.geckoY;

        if (this.idleTimer <= 0) {
          this.hideTongue();
          this.state = 'IDLE';
          this.idleTimer = 0.5 + Math.random() * 1.2;
          this.setStatus('Resting…');
        }
        break;
    }

    // Gentle tail sway (always)
    const sway = Math.sin(Date.now() * 0.0012) * 0.18;
    this.tailGroup.rotation.y = sway;

    // Slow blink-like eyelid shift (subtle)
    const blink = Math.sin(Date.now() * 0.0008);
    this.group.children.forEach(c => {
      if (c.name === 'tongue') return;
    });
  }

  private animateIdle(delta: number) {
    // Slow breathing bob
    const breath = Math.sin(Date.now() * 0.0015) * 0.006;
    this.bodyMesh.position.y = 0.075 + breath;
    // Head look around (slight Y rotation)
    // Legs relax
    this.legGroups.forEach(lg => { lg.rotation.x *= 0.92; });
  }

  private pickTarget(items: PlacedItem[], bounds: EnclosureBounds) {
    this.targetItemId = null;

    if (items.length > 0 && Math.random() < 0.88) {
      const item = items[Math.floor(Math.random() * items.length)];
      this.targetItemId = item.id;
      const col = ITEM_COLLISION[item.type];
      // Approach to just outside collision radius
      const approachR = col.climbable ? col.radius * 0.3 : col.radius + 0.08;
      // Angle from current gecko pos toward item
      const adx = this.group.position.x - item.position.x;
      const adz = this.group.position.z - item.position.z;
      const alen = Math.sqrt(adx*adx + adz*adz) || 1;
      this.target.set(
        item.position.x + (adx / alen) * approachR,
        0,
        item.position.z + (adz / alen) * approachR
      );
    } else {
      this.target.set(
        bounds.minX + Math.random() * (bounds.maxX - bounds.minX),
        0,
        bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
      );
    }
    // Clamp
    this.target.x = Math.max(bounds.minX + 0.18, Math.min(bounds.maxX - 0.18, this.target.x));
    this.target.z = Math.max(bounds.minZ + 0.18, Math.min(bounds.maxZ - 0.18, this.target.z));
  }

  private nearestName(items: PlacedItem[]): string {
    if (!items.length) return 'a spot';
    let best = Infinity, name = 'a spot';
    for (const it of items) {
      const d = this.group.position.distanceTo(it.position);
      if (d < best) { best = d; name = it.type; }
    }
    return name;
  }

  private showTongue() {
    const t = this.group.getObjectByName('tongue');
    if (t) {
      t.visible = true;
      setTimeout(() => { if (t) t.visible = false; }, 600);
    }
  }

  private hideTongue() {
    const t = this.group.getObjectByName('tongue');
    if (t) t.visible = false;
  }

  private setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = `🦎 Gecko: ${text}`;
  }
}
