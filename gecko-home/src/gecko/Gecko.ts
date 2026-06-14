import * as THREE from 'three';
import type { PlacedItem } from '../items/ItemManager.js';
import type { EnclosureBounds } from '../scene/Enclosure.js';
import { ITEM_COLLISION, ItemType } from '../items/ItemTypes.js';

const WALK_SPEED      = 0.85;
const ARRIVE_DIST     = 0.15;
const IDLE_WAIT_MIN   = 1.5;
const IDLE_WAIT_MAX   = 4.5;
const ROTATE_SPEED    = 6.0;
const LEG_SWING_SPEED = 9.0;
const BODY_BOB_AMP    = 0.010;
const BODY_BOB_SPEED  = 5.0; // one gentle bob per stride

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
  private justLeftHide = false; // skip hide on next target pick after waking
  private sleepingInHide = false;
  private hideEntryPhase = 0; // 0=none, 1=approaching mouth, 2=walking inside
  private turnAroundAngle: number | null = null; // target Y rotation after arriving at hide
  private geckoY = 0;        // current Y (for climbing)
  private targetY = 0;

  private statusEl: HTMLElement | null = null;

  onArrivedAtFoodBowl?: (itemId: number) => void;

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);
    this.statusEl = document.getElementById('gecko-status');
    this.setStatus('🦎 Exploring…');
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

    // Spots along back — irregular positions, flattened to sit on body surface.
    // Body ellipsoid: centre (0, 0.075, 0), semi-axes ax=0.2015, ay=0.0676, az=0.1235.
    // surfY(x,z) = bodyCY + ay * sqrt(max(0, 1 - (x/ax)² - (z/az)²)) + tiny lift
    this.spotMeshes = [];
    const ax = 0.13 * 1.55, ay = 0.13 * 0.52, az = 0.13 * 0.95, bcy = 0.075;
    const surfY = (x: number, z: number) =>
      bcy + ay * Math.sqrt(Math.max(0, 1 - (x/ax)**2 - (z/az)**2)) + 0.003;
    const spotDefs: [number, number, number][] = [
      // x,      z,      radius
      [-0.17,  0.04,  0.030],
      [-0.08, -0.05,  0.038],
      [-0.13,  0.07,  0.026],
      [ 0.02, -0.06,  0.034],
      [ 0.09,  0.05,  0.030],
      [ 0.16, -0.04,  0.024],
      [ 0.17,  0.05,  0.032],
      [ 0.05,  0.08,  0.022],
      [-0.06, -0.07,  0.028],
    ];
    for (const [sx, sz, sr] of spotDefs) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(sr, 6, 5), this.spotMat);
      spot.position.set(sx, surfY(sx, sz), sz);
      spot.scale.set(1, 0.18, 1); // very flat — sits as a skin patch
      this.group.add(spot);
      this.spotMeshes.push(spot);
    }

    // Head — single BufferGeometry: trapezoidal prism + semicircular front cap.
    // No separate meshes, so zero z-fighting.
    {
      const bx  = 0.185;  // neck X
      const tx  = 0.370;  // snout X (cap arc pivots here)
      const hw  = 0.065;  // constant half-width (true prism)
      const yb  = 0.032;  // bottom Y
      const ytB = 0.148;  // top Y at neck
      const ytF = 0.108;  // top Y at snout (less slant)

      const snoutH = ytF - yb;
      const r  = snoutH / 2;    // arc radius
      const cy = yb + r;        // arc centre Y

      // Arc segments for the front cap (half-circle from bottom to top)
      const ARC = 10;
      const posArr: number[] = [];
      const idxArr: number[] = [];

      // Helper to push a vertex and return its index
      const v = (x: number, y: number, z: number) => {
        posArr.push(x, y, z);
        return posArr.length / 3 - 1;
      };

      // ── Prism vertices ───────────────────────────────────────────────────────
      const v0 = v(bx, yb,   hw);   // back-bottom-left
      const v1 = v(bx, yb,  -hw);   // back-bottom-right
      const v2 = v(bx, ytB,  hw);   // back-top-left
      const v3 = v(bx, ytB, -hw);   // back-top-right
      // front-bottom and front-top are also the arc endpoints
      const v4 = v(tx, yb,   hw);   // front-bottom-left  = arc start left
      const v5 = v(tx, yb,  -hw);   // front-bottom-right = arc start right
      const v6 = v(tx, ytF,  hw);   // front-top-left     = arc end left
      const v7 = v(tx, ytF, -hw);   // front-top-right    = arc end right

      // ── Prism faces ──────────────────────────────────────────────────────────
      idxArr.push(
        v0,v3,v1,  v0,v2,v3,   // back
        v0,v1,v5,  v0,v5,v4,   // bottom
        v2,v6,v7,  v2,v7,v3,   // top (slanted)
        v0,v4,v6,  v0,v6,v2,   // left side
        v1,v3,v7,  v1,v7,v5,   // right side
      );

      // ── Front arc cap ────────────────────────────────────────────────────────
      // Generate N-1 intermediate ring pairs; endpoints reuse v4/v5 and v6/v7
      const leftRing:  number[] = [v4];
      const rightRing: number[] = [v5];
      for (let i = 1; i < ARC; i++) {
        const a  = -Math.PI / 2 + (Math.PI / ARC) * i;
        const ax = tx + r * Math.cos(a);
        const ay = cy + r * Math.sin(a);
        leftRing.push(v(ax, ay,  hw));
        rightRing.push(v(ax, ay, -hw));
      }
      leftRing.push(v6);
      rightRing.push(v7);

      // Curved surface between the two rings
      for (let i = 0; i < ARC; i++) {
        const l0 = leftRing[i],  l1 = leftRing[i + 1];
        const r0 = rightRing[i], r1 = rightRing[i + 1];
        idxArr.push(l0, r0, r1,  l0, r1, l1);
      }

      // End-cap fans at z=±hw — winding for outward normals (+Z left, -Z right)
      const lcx = v(tx, cy,  hw);
      const rcx = v(tx, cy, -hw);
      for (let i = 0; i < ARC; i++) {
        idxArr.push(lcx, leftRing[i],  leftRing[i + 1]);   // +Z face, CCW from +Z
        idxArr.push(rcx, rightRing[i + 1], rightRing[i]);  // -Z face, CCW from -Z
      }

      // ── Build mesh ────────────────────────────────────────────────────────────
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posArr), 3));
      geo.setIndex(idxArr);
      geo.computeVertexNormals();
      this.group.add(new THREE.Mesh(geo, this.baseMat));

      // Nostrils
      const nostMat = new THREE.MeshLambertMaterial({ color: 0x3a5010 });
      for (const side of [-1, 1] as const) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), nostMat);
        n.position.set(tx + r * 0.65, cy + r * 0.55, side * 0.014);
        this.group.add(n);
      }

      // Eyes at midpoint along the sides, upper portion
      this.eyeMeshes = [];
      for (const side of [-1, 1] as const) {
        const ex   = bx + (tx - bx) * 0.50;
        const eyeY = yb + (ytB - (ytB - ytF) * 0.5) * 0.72;
        const eye  = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), eyeMat);
        eye.position.set(ex, eyeY, side * (hw + 0.008));
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
          // Check if we arrived at a hide
          const arrivedItem = this.targetItemId !== null
            ? items.find(i => i.id === this.targetItemId) : null;

          if (this.hideEntryPhase === 1 && arrivedItem?.type === ItemType.SLEEPING_HIDE) {
            // Phase 1 done: now walk straight into the centre of the hide
            this.target.set(arrivedItem.position.x, 0, arrivedItem.position.z);
            this.hideEntryPhase = 2;
            // stay in WALKING so the gecko continues forward through the mouth
            break;
          }

          this.state = 'ARRIVED';
          this.idleTimer = IDLE_WAIT_MIN + Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN);

          if (this.hideEntryPhase === 2 && arrivedItem?.type === ItemType.SLEEPING_HIDE) {
            this.hideEntryPhase = 0;
            // Turn around to face the opening (add PI to face back out through mouth)
            this.turnAroundAngle = this.group.rotation.y + Math.PI;
            this.sleepingInHide = true;
            this.idleTimer = 15 + Math.random() * 15; // rest longer in the hide
            this.setStatus('💤 Resting…');
          } else {
            this.hideEntryPhase = 0;
            this.turnAroundAngle = null;
            this.sleepingInHide = false;
            this.showTongue();
            if (arrivedItem?.type === 'Food Bowl') this.onArrivedAtFoodBowl?.(arrivedItem.id);
            this.setStatus('🦎 Exploring…');
          }
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
        // Check both the body centre AND the head tip (~0.37 units ahead along facing).
        // If either penetrates a solid item, push the whole gecko back out.
        const facingX = Math.cos(this.group.rotation.y);
        const facingZ = -Math.sin(this.group.rotation.y);
        const HEAD_REACH = 0.42;

        this.targetY = 0;
        for (const item of items) {
          const col  = ITEM_COLLISION[item.type];
          const r2   = col.radius * col.radius;

          // Test both probe points; use whichever is deeper inside the item
          let worstPush = 0;
          let pushDx = 0, pushDz = 0;

          for (const [px, pz] of [
            [nx,                    nz],
            [nx + facingX * HEAD_REACH, nz + facingZ * HEAD_REACH],
          ] as [number, number][]) {
            const cdx = px - item.position.x;
            const cdz = pz - item.position.z;
            const d2  = cdx * cdx + cdz * cdz;
            if (d2 < r2) {
              if (col.climbable) {
                const d = Math.sqrt(d2);
                const t = Math.min(1, 1 - d / col.radius);
                this.targetY = Math.max(this.targetY, col.height * Math.min(t * 2.5, 1));
              } else {
                const d = Math.sqrt(d2) || 0.001;
                const push = col.radius - d + 0.02;
                if (push > worstPush) {
                  worstPush = push;
                  pushDx = (cdx / d) * push;
                  pushDz = (cdz / d) * push;
                }
              }
            }
          }

          if (worstPush > 0) {
            nx += pushDx;
            nz += pushDz;
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

        this.setStatus('🦎 Exploring…');
        break;
      }

      case 'ARRIVED':
        this.idleTimer -= delta;
        // Settle legs and body
        this.legGroups.forEach(lg => { lg.position.y += (0 - lg.position.y) * 0.15; });
        this.group.rotation.z += (0 - this.group.rotation.z) * 0.12;
        this.targetY = 0;
        this.geckoY += (this.targetY - this.geckoY) * Math.min(3 * delta, 1);
        this.group.position.y = this.geckoY;

        // Smoothly rotate to face outward if in hide
        if (this.turnAroundAngle !== null) {
          let diff = this.turnAroundAngle - this.group.rotation.y;
          // Normalise to shortest arc (-PI to PI) to prevent spinning the wrong way
          while (diff >  Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          this.group.rotation.y += diff * Math.min(4 * delta, 1);
          if (Math.abs(diff) < 0.04) {
            this.group.rotation.y = this.turnAroundAngle;
            this.turnAroundAngle = null;
            this.eyeMeshes.forEach(e => { e.scale.y = 0.04; }); // eyes shut
          }
        }

        if (this.idleTimer <= 0) {
          this.hideEntryPhase = 0;
          if (this.sleepingInHide) {
            this.sleepingInHide = false;
            this.justLeftHide = true;          // don't go straight back in
            this.eyeMeshes.forEach(e => { e.scale.y = 1; }); // wake up
          } else {
            this.hideTongue();
          }
          this.state = 'IDLE';
          this.idleTimer = 1.5 + Math.random() * 2.0; // wander for a bit first
          this.setStatus('🦎 Exploring…');
        }
        break;
    }

    // Gentle tail sway (always)
    const sway = Math.sin(Date.now() * 0.0012) * 0.18;
    this.tailGroup.rotation.y = sway;

    // Blink: squish eye Y scale to ~0 then spring back (skip while sleeping)
    if (this.sleepingInHide) return;
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

    // Filter out the hide right after waking so the gecko explores first
    const pickable = this.justLeftHide
      ? items.filter(i => i.type !== ItemType.SLEEPING_HIDE)
      : items;
    this.justLeftHide = false; // consume the flag

    if (pickable.length > 0 && Math.random() < 0.88) {
      const item = pickable[Math.floor(Math.random() * pickable.length)];
      this.targetItemId = item.id;
      const col = ITEM_COLLISION[item.type];
      const HEAD_REACH = 0.42;
      if (item.type === ItemType.SLEEPING_HIDE) {
        // Phase 1: walk to a staging point just outside the mouth opening.
        // The hide's open front is at local +X (len/2 = 0.475 along X axis).
        // item.mesh.rotation.y gives the user-set rotation; local +X → world (cos θ, 0, -sin θ).
        const rotY = item.mesh.rotation.y;
        const mDX = Math.cos(rotY);
        const mDZ = -Math.sin(rotY);
        const HIDE_HALF_LEN = 0.475;
        const STAGE_OFFSET  = 0.35; // how far outside the mouth to stage
        this.target.set(
          item.position.x + mDX * (HIDE_HALF_LEN + STAGE_OFFSET),
          0,
          item.position.z + mDZ * (HIDE_HALF_LEN + STAGE_OFFSET)
        );
        this.hideEntryPhase = 1;
      } else {
        this.hideEntryPhase = 0;
        const approachR = col.climbable ? col.radius * 0.3 : col.radius + HEAD_REACH + 0.10;
        // Angle from current gecko pos toward item
        const adx = this.group.position.x - item.position.x;
        const adz = this.group.position.z - item.position.z;
        const alen = Math.sqrt(adx*adx + adz*adz) || 1;
        this.target.set(
          item.position.x + (adx / alen) * approachR,
          0,
          item.position.z + (adz / alen) * approachR
        );
      }
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
