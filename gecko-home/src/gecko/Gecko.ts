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

  private baseMat!: THREE.MeshLambertMaterial;
  private bodyMat!: THREE.MeshLambertMaterial;
  private spotMat!: THREE.MeshLambertMaterial;
  private darkMat!: THREE.MeshLambertMaterial;

  private eyeMeshes: THREE.Mesh[] = [];
  private blinkTimer = 3.5;
  private blinkTime  = -1;
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
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
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

    // Head — trapezoidal prism.
    // Side profile (right-angled trapezium):
    //   - flat bottom, vertical back (right angle), vertical snout (right angle)
    //   - top face is slanted from tall back down to short snout
    // Plan view: wider at neck, narrower at snout (true prism with two equal side faces).
    // Snout face is replaced by a smooth ellipsoid cap.
    {
      const bx      = 0.185;  // neck X
      const tx      = 0.370;  // snout X
      const hwB     = 0.070;  // half-width at neck
      const hwF     = 0.028;  // half-width at snout
      const yb      = 0.032;  // bottom Y (flat base)
      const ytB     = 0.158;  // top Y at neck  (tall)
      const ytF     = 0.072;  // top Y at snout (short)

      //  0  back-bottom-left     1  back-bottom-right
      //  2  back-top-left        3  back-top-right
      //  4  front-bottom-left    5  front-bottom-right
      //  6  front-top-left       7  front-top-right
      const verts = new Float32Array([
        bx, yb,   hwB,   // 0
        bx, yb,  -hwB,   // 1
        bx, ytB,  hwB,   // 2
        bx, ytB, -hwB,   // 3
        tx, yb,   hwF,   // 4
        tx, yb,  -hwF,   // 5
        tx, ytF,  hwF,   // 6
        tx, ytF, -hwF,   // 7
      ]);

      const idx = new Uint16Array([
        0, 3, 1,  0, 2, 3,   // back face  (vertical, tall)
        0, 1, 5,  0, 5, 4,   // bottom face (flat)
        2, 6, 7,  2, 7, 3,   // top face   (slanted)
        0, 4, 6,  0, 6, 2,   // left side  (+Z trapezoid)
        1, 3, 7,  1, 7, 5,   // right side (-Z trapezoid)
        // front face omitted — replaced by curved snout cap below
      ]);

      const headGeo = new THREE.BufferGeometry();
      headGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      headGeo.setIndex(new THREE.BufferAttribute(idx, 1));
      headGeo.computeVertexNormals();
      this.group.add(new THREE.Mesh(headGeo, this.baseMat));

      // Snout cap: ellipsoid scaled to match the front face (hwF wide, ytF-yb tall)
      // Placed so its back half merges with the snout face, front half curves outward
      const snoutH = ytF - yb;
      const snoutCap = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), this.baseMat);
      snoutCap.scale.set(snoutH * 0.55, snoutH * 0.5, hwF);
      snoutCap.position.set(tx, yb + snoutH / 2, 0);
      this.group.add(snoutCap);

      // Nostrils near the top of the snout cap
      const nostMat = new THREE.MeshLambertMaterial({ color: 0x3a5010 });
      for (const side of [-1, 1] as const) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), nostMat);
        n.position.set(tx + 0.014, yb + snoutH * 0.78, side * 0.014);
        this.group.add(n);
      }

      // Eyes on the outer side faces, in the upper portion
      this.eyeMeshes = [];
      for (const side of [-1, 1] as const) {
        const ex  = bx + (tx - bx) * 0.28;
        const t   = (ex - bx) / (tx - bx);
        const eyeHW = hwB - (hwB - hwF) * t;
        const eyeY  = yb + (ytB - (ytB - ytF) * t) * 0.68; // follow slope
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), eyeMat);
        eye.position.set(ex, eyeY, side * (eyeHW + 0.008));
        this.group.add(eye);
        this.eyeMeshes.push(eye);
      }
    }

    // Tongue (hidden by default, shown on arrive)
    const tongue = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.045, 5), tongueMat);
    tongue.rotation.z = Math.PI / 2;
    tongue.position.set(0.415, 0.048, 0);
    tongue.name = 'tongue';
    tongue.visible = false;
    this.group.add(tongue);

    // ── Legs: hemispheres, dome pointing up, flat bottom on ground ───────────
    const LEG_R = 0.046;
    const legDefs: [number, number, number][] = [
      [ 0.13, 0,  0.11],  // FL
      [ 0.13, 0, -0.11],  // FR
      [-0.08, 0,  0.11],  // RL
      [-0.08, 0, -0.11],  // RR
    ];

    for (let li = 0; li < 4; li++) {
      const [lx, ly, lz] = legDefs[li];
      const lgGroup = new THREE.Group();
      lgGroup.position.set(lx, ly, lz);

      // thetaStart=0, thetaLength=PI/2 → top hemisphere, dome up, flat at y=0
      const leg = new THREE.Mesh(
        new THREE.SphereGeometry(LEG_R, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        this.darkMat
      );
      lgGroup.add(leg);
      this.group.add(lgGroup);
      this.legGroups.push(lgGroup);
    }

    // ── Tail — wavy tapered segments ─────────────────────────────────────────
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0.075,  0.000),
      new THREE.Vector3(-0.30, 0.079,  0.030),
      new THREE.Vector3(-0.44, 0.073, -0.028),
      new THREE.Vector3(-0.58, 0.077,  0.022),
      new THREE.Vector3(-0.70, 0.074, -0.010),
      new THREE.Vector3(-0.80, 0.075,  0.000),
    ]);

    const N   = 18;
    const pts = tailCurve.getPoints(N);
    const up  = new THREE.Vector3(0, 1, 0);
    const R_BASE = 0.040, R_TIP = 0.005;

    for (let i = 0; i < N; i++) {
      const t  = i / N;
      const r1 = R_BASE + (R_TIP - R_BASE) * (i / N);
      const r2 = R_BASE + (R_TIP - R_BASE) * ((i + 1) / N);
      const p1 = pts[i], p2 = pts[i + 1];
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(r2, r1, p1.distanceTo(p2), 7),
        this.baseMat
      );
      seg.position.copy(p1.clone().add(p2).multiplyScalar(0.5));
      seg.quaternion.setFromUnitVectors(up, p2.clone().sub(p1).normalize());
      this.tailGroup.add(seg);
    }
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
        // Head is at local +X. Rotation matrix: local +X → world (cos θ, 0, -sin θ)
        // So for head to face (ndx, ndz): cos θ = ndx, -sin θ = ndz → θ = atan2(-ndz, ndx)
        const wantAngle = Math.atan2(-ndz, ndx);
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

        // Whole-body vertical bob only (no side sway)
        const bob = Math.abs(Math.sin(this.walkTime * BODY_BOB_SPEED)) * 0.018;
        pos.y = this.geckoY + bob;
        this.group.rotation.z += (0 - this.group.rotation.z) * 0.15;

        // Leg animation — trot gait, diagonal pairs lift together
        // Subtract bob so feet stay grounded as the body rises
        const phases = [0, Math.PI, Math.PI, 0];
        this.legGroups.forEach((lg, i) => {
          const lift = Math.max(0, Math.sin(this.walkTime * LEG_SWING_SPEED + phases[i])) * 0.04;
          lg.position.y = lift - bob;
        });

        this.setStatus('Walking…');
        break;
      }

      case 'ARRIVED':
        this.idleTimer -= delta;
        // Settle legs and rotation back to neutral
        this.legGroups.forEach(lg => { lg.position.y += (0 - lg.position.y) * 0.15; });
        this.group.rotation.z += (0 - this.group.rotation.z) * 0.12;
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

    // Blink: squish eye Y scale to ~0 then spring back
    this.blinkTimer -= delta;
    if (this.blinkTimer <= 0) {
      this.blinkTime  = 0;
      this.blinkTimer = 3 + Math.random() * 5;
    }
    if (this.blinkTime >= 0) {
      this.blinkTime += delta;
      const BLINK_DUR = 0.22;
      const t = Math.min(this.blinkTime / BLINK_DUR, 1);
      // t 0→0.5: squish down; t 0.5→1: open back up
      const squish = t < 0.5 ? 1 - t * 2 * 0.96 : 0.04 + (t - 0.5) * 2 * 0.96;
      this.eyeMeshes.forEach(e => { e.scale.y = Math.max(0.04, squish); });
      if (t >= 1) {
        this.blinkTime = -1;
        this.eyeMeshes.forEach(e => { e.scale.y = 1; });
      }
    }
  }

  private animateIdle(_delta: number) {
    // Gentle whole-body breathing bob — legs do NOT move
    const breathBob = Math.sin(Date.now() * 0.0015) * 0.005;
    this.group.position.y = this.geckoY + breathBob;
    this.group.rotation.z += (0 - this.group.rotation.z) * 0.1;
    // Keep legs pinned to ground (cancel breath bob in local Y)
    this.legGroups.forEach(lg => { lg.position.y = -breathBob; });
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
