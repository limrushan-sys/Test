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

  // Inner group that pitches when eating/drinking (nose down, tail up)
  private poseGroup = new THREE.Group();
  private posePitch = 0;
  private posePitchTarget = 0;

  private bodyMesh!: THREE.Mesh;
  private tailGroup = new THREE.Group();
  private legGroups: THREE.Group[] = [];

  private bodyGeo!: THREE.SphereGeometry;
  private bodyTopColor  = new THREE.Color(0xf07030); // leopard orange
  private bodyBotColor  = new THREE.Color(0xffe8d0); // cream belly

  private baseMat!: THREE.MeshLambertMaterial;
  private bodyMat!: THREE.MeshLambertMaterial;
  private spotMat!: THREE.MeshLambertMaterial;
  private darkMat!: THREE.MeshLambertMaterial;

  private eyeMeshes: THREE.Mesh[] = [];
  private pupilMeshes: THREE.Mesh[] = [];
  private sleepEyeMeshes: THREE.Mesh[] = [];
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
  private hideEntryPhase = 0; // 0=none 1=side waypoint 2=staging point 3=walking inside
  private turnAroundAngle: number | null = null; // target Y rotation after arriving at hide
  // Water dish: 0=normal, 1=walking inside, 2=drinking (ARRIVED), 3=walking back out
  private waterDishPhase  = 0;
  private waterDishItemId: number | null = null;
  private geckoY = 0;        // current Y (for climbing)
  private targetY = 0;
  // Stuck detection
  private stuckTimer = 0;
  private lastStuckCheckPos = new THREE.Vector3();

  private tongueMesh: THREE.Mesh | null = null;
  private tongueAnim  = 0;   // 0=off 1=extending 2=stuck 3=retracting
  private tongueTimer = 0;
  private tongueMaxLen = 0.1; // world-units to extend
  private eatCricketMesh: THREE.Group | null = null;
  private eatBowlPos = new THREE.Vector3();
  private eatBowlId: number | null = null;
  private onEatDone: (() => void) | null = null;

  private drinkPhase = 0;  // 0=off 1=extending 2=retracting
  private drinkTimer = 0;
  private drinkCount = 0;

  private statusEl: HTMLElement | null = null;

  onArrivedAtFoodBowl?: (itemId: number) => void;
  startEatAnimation(itemId: number, cricket: THREE.Group, bowlPos: THREE.Vector3, onDone: () => void) {
    this.eatCricketMesh = cricket;
    this.eatBowlPos.copy(bowlPos);
    this.eatBowlId = itemId;
    this.onEatDone = onDone;

    // Tongue target length = distance from snout to cricket along gecko facing direction
    const rotY = this.group.rotation.y;
    const fx = Math.cos(rotY), fz = -Math.sin(rotY);
    const cx = bowlPos.x + cricket.position.x - this.group.position.x;
    const cz = bowlPos.z + cricket.position.z - this.group.position.z;
    this.tongueMaxLen = Math.max(0.05, cx * fx + cz * fz) - 0.415; // subtract snout offset

    this.tongueAnim  = 1;
    this.tongueTimer = 0;
    if (this.tongueMesh) this.tongueMesh.visible = true;
  }

  constructor(scene: THREE.Scene) {
    this.buildMesh();
    this.group.position.set(0, 0, 0);
    scene.add(this.group);
    this.statusEl = document.getElementById('gecko-status');
    this.setStatus('🦎 Exploring…');
  }

  // ── Build gecko mesh ───────────────────────────────────────────────────────
  private buildMesh() {
    this.baseMat = new THREE.MeshLambertMaterial({ color: 0xe86820 }); // orange — head/tail
    this.bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.spotMat = new THREE.MeshLambertMaterial({ color: 0x1a0800 }); // near-black spots
    this.darkMat = new THREE.MeshLambertMaterial({ color: 0xc04010 }); // darker orange legs
    const eyeMat    = new THREE.MeshLambertMaterial({ color: 0xd4a820 }); // gold iris
    const pupilMat  = new THREE.MeshLambertMaterial({ color: 0x080400 }); // vertical slit
    const tongueMat = new THREE.MeshLambertMaterial({ color: 0xe05070 });
    const bandLightMat = new THREE.MeshLambertMaterial({ color: 0xf5e8c0 }); // cream tail band
    const bandDarkMat  = new THREE.MeshLambertMaterial({ color: 0x3a1a00 }); // dark tail band

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
    this.poseGroup.add(this.bodyMesh);

    // Spots along back — irregular positions, flattened to sit on body surface.
    // Body ellipsoid: centre (0, 0.075, 0), semi-axes ax=0.2015, ay=0.0676, az=0.1235.
    // surfY(x,z) = bodyCY + ay * sqrt(max(0, 1 - (x/ax)² - (z/az)²)) + tiny lift
    this.spotMeshes = [];
    const ax = 0.13 * 1.55, ay = 0.13 * 0.52, az = 0.13 * 0.95, bcy = 0.075;
    const surfY = (x: number, z: number) =>
      bcy + ay * Math.sqrt(Math.max(0, 1 - (x/ax)**2 - (z/az)**2)) + 0.003;
    const spotDefs: [number, number, number][] = [
      // x,      z,      radius  — leopard gecko blotch pattern
      [-0.17,  0.00,  0.038],
      [-0.17,  0.08,  0.022],
      [-0.17, -0.08,  0.020],
      [-0.10,  0.05,  0.032],
      [-0.10, -0.05,  0.030],
      [-0.03,  0.09,  0.024],
      [-0.03, -0.08,  0.026],
      [ 0.04,  0.04,  0.034],
      [ 0.04, -0.06,  0.028],
      [ 0.11,  0.07,  0.022],
      [ 0.11, -0.04,  0.030],
      [ 0.17,  0.03,  0.026],
      [ 0.17, -0.07,  0.020],
      [ 0.00,  0.00,  0.018],
    ];
    for (const [sx, sz, sr] of spotDefs) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(sr, 6, 5), this.spotMat);
      spot.position.set(sx, surfY(sx, sz), sz);
      spot.scale.set(1, 0.18, 1); // very flat — sits as a skin patch
      this.poseGroup.add(spot);
      this.spotMeshes.push(spot);
    }

    // Head — single BufferGeometry: trapezoidal prism + semicircular front cap.
    // No separate meshes, so zero z-fighting.
    {
      const bx  = 0.185;  // neck X
      const tx  = 0.390;  // snout X (cap arc pivots here)
      const hw  = 0.090;  // wider — leopard gecko has broad triangular head
      const yb  = 0.032;  // bottom Y
      const ytB = 0.155;  // top Y at neck
      const ytF = 0.105;  // top Y at snout

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
      this.poseGroup.add(new THREE.Mesh(geo, this.baseMat));

      // Nostrils
      const nostMat = new THREE.MeshLambertMaterial({ color: 0x3a5010 });
      for (const side of [-1, 1] as const) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(0.007, 5, 4), nostMat);
        n.position.set(tx + r * 0.65, cy + r * 0.55, side * 0.014);
        this.poseGroup.add(n);
      }

      // Eyes — gold iris with vertical slit pupil
      this.eyeMeshes = [];
      for (const side of [-1, 1] as const) {
        const ex   = bx + (tx - bx) * 0.45;
        const eyeY = yb + (ytB - (ytB - ytF) * 0.5) * 0.70;
        const eye  = new THREE.Mesh(new THREE.SphereGeometry(0.050, 10, 8), eyeMat);
        eye.position.set(ex, eyeY, side * (hw + 0.008));
        this.poseGroup.add(eye);
        this.eyeMeshes.push(eye);
        // Big cute pupil — nearly fills the whole eye, wider
        const pupil = new THREE.Mesh(
          new THREE.SphereGeometry(0.048, 8, 8),
          pupilMat
        );
        pupil.scale.set(1.1, 0.95, 0.5);
        pupil.position.set(ex, eyeY, side * (hw + 0.046));
        this.poseGroup.add(pupil);
        this.pupilMeshes.push(pupil);

        // U-shaped sleep eye — shown only when sleeping
        const uCurve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(-0.072, 0.030, 0),
          new THREE.Vector3(0,      -0.055, 0),
          new THREE.Vector3( 0.072, 0.030, 0),
        );
        const sleepGeo = new THREE.TubeGeometry(uCurve, 16, 0.012, 6, false);
        const sleepEye = new THREE.Mesh(sleepGeo, pupilMat);
        sleepEye.position.set(ex, eyeY, side * (hw - 0.010));
        sleepEye.visible = false;
        this.poseGroup.add(sleepEye);
        this.sleepEyeMeshes.push(sleepEye);
      }
    }

    // Tongue — BoxGeometry translated so base is at x=0, tip at x=1; scale.x = length
    const tongueGeo = new THREE.BoxGeometry(1, 0.009, 0.010);
    tongueGeo.translate(0.5, 0, 0);  // shift base to x=0 (not centered)
    this.tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
    this.tongueMesh.position.set(0.408, 0.048, 0); // base at snout tip
    this.tongueMesh.scale.set(0, 1, 1);
    this.tongueMesh.visible = false;
    this.poseGroup.add(this.tongueMesh);

    // ── Legs: hemispheres, dome pointing up, flat bottom on ground ───────────
    const LEG_R = 0.058; // chunkier leopard gecko legs
    const legDefs: [number, number, number][] = [
      [ 0.13, 0,  0.12],  // FL
      [ 0.13, 0, -0.12],  // FR
      [-0.08, 0,  0.12],  // RL
      [-0.08, 0, -0.12],  // RR
    ];

    for (let li = 0; li < 4; li++) {
      const [lx, ly, lz] = legDefs[li];
      const lgGroup = new THREE.Group();
      lgGroup.position.set(lx, ly, lz);

      const leg = new THREE.Mesh(
        new THREE.SphereGeometry(LEG_R, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        this.darkMat
      );
      lgGroup.add(leg);

      // Toe bumps — 5 small spheres fanning outward
      const toeSign = lz > 0 ? 1 : -1;
      for (let ti = 0; ti < 5; ti++) {
        const toeAngle = (ti / 4 - 0.5) * Math.PI * 0.7 + (toeSign > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
        const toe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), this.darkMat);
        toe.position.set(Math.cos(toeAngle) * 0.065, -0.005, Math.sin(toeAngle) * 0.065);
        lgGroup.add(toe);
      }

      this.poseGroup.add(lgGroup);
      this.legGroups.push(lgGroup);
    }

    // ── Tail — fat leopard gecko tail with cream/dark banding ─────────────────
    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.18, 0.075,  0.000),
      new THREE.Vector3(-0.28, 0.079,  0.020),
      new THREE.Vector3(-0.40, 0.073, -0.020),
      new THREE.Vector3(-0.52, 0.077,  0.015),
      new THREE.Vector3(-0.62, 0.074, -0.008),
      new THREE.Vector3(-0.70, 0.075,  0.000),
    ]);

    const N   = 18;
    const pts = tailCurve.getPoints(N);
    const up  = new THREE.Vector3(0, 1, 0);
    // Leopard gecko fat tail: wide at base, tapers to tip
    const R_BASE = 0.072, R_MID = 0.068, R_TIP = 0.006;

    for (let i = 0; i < N; i++) {
      const t  = i / (N - 1);
      // Fat bulge in first half, then taper
      const bulge = t < 0.4 ? 1.0 : 1.0 - ((t - 0.4) / 0.6);
      const r1 = (R_MID + (R_BASE - R_MID) * Math.max(0, 1 - t * 3)) * bulge + R_TIP * (1 - bulge);
      const r2 = (R_MID + (R_BASE - R_MID) * Math.max(0, 1 - (t + 1/N) * 3)) * Math.max(0, bulge - 1/N) + R_TIP * (1 - Math.max(0, bulge - 1/N));
      const p1 = pts[i], p2 = pts[i + 1];
      // Alternate bands: every 2 segments switch between cream and dark
      const bandMat = Math.floor(i / 2) % 2 === 0 ? bandLightMat : bandDarkMat;
      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(r2, r1, p1.distanceTo(p2), 8),
        bandMat
      );
      seg.position.copy(p1.clone().add(p2).multiplyScalar(0.5));
      seg.quaternion.setFromUnitVectors(up, p2.clone().sub(p1).normalize());
      this.tailGroup.add(seg);
    }
    this.poseGroup.add(this.tailGroup);
    this.group.add(this.poseGroup);
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
    this.baseMat.color.setHex(hex);
    const c = new THREE.Color(hex);
    this.darkMat.color.setRGB(c.r * 0.78, c.g * 0.62, c.b * 0.40);
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
    this.updateTongueAnim(delta);
    this.updateDrinkAnim(delta);

    // Smooth bowl/water-dish pose pitch (nose down, tail up)
    this.posePitch += (this.posePitchTarget - this.posePitch) * Math.min(2.5 * delta, 1);
    this.poseGroup.rotation.z = this.posePitch;
    // Compensate group Y so rear legs stay near ground when pitched
    // Rear leg pivot at local x ≈ -0.08: rises by 0.08*sin(-pitch) with negative pitch
    const poseY = 0.08 * Math.sin(-this.posePitch);
    // Only apply during ARRIVED (don't fight the geckoY/bob system while walking)
    if (this.state === 'ARRIVED') {
      this.group.position.y = this.geckoY + poseY;
    }
    switch (this.state) {

      case 'IDLE':
        this.idleTimer -= delta;
        this.animateIdle(delta);
        if (this.idleTimer <= 0) {
          this.posePitchTarget = 0;
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

          // ── Water dish: walk in, drink, walk back out ──────────────────────
          if (arrivedItem?.type === ItemType.WATER_DISH && this.waterDishPhase === 1) {
            // Arrived at bowl centre — transition to drinking
            this.waterDishPhase = 2;
            this.state = 'ARRIVED';
            this.idleTimer = IDLE_WAIT_MIN + Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN);
            this.posePitchTarget = -0.14;
            this.startDrinkAnimation();
            this.setStatus('🦎 Exploring…');
            break;
          }
          if (this.waterDishPhase === 3) {
            // Arrived at exit waypoint — fully done
            this.waterDishPhase  = 0;
            this.waterDishItemId = null;
            this.targetItemId    = null;
          }

          if (arrivedItem?.type === ItemType.SLEEPING_HIDE) {
            if (this.hideEntryPhase === 1) {
              // Arrived at side waypoint → now head to staging point in front of mouth
              const rotY = arrivedItem.mesh.rotation.y;
              const mDX  = Math.cos(rotY);
              const mDZ  = -Math.sin(rotY);
              this.target.set(
                arrivedItem.position.x + mDX * (0.475 + 0.35),
                0,
                arrivedItem.position.z + mDZ * (0.475 + 0.35)
              );
              this.hideEntryPhase = 2;
              break; // keep WALKING
            }
            if (this.hideEntryPhase === 2) {
              // Arrived at staging point → walk inside (collision off)
              this.target.set(arrivedItem.position.x, 0, arrivedItem.position.z);
              this.hideEntryPhase = 3;
              break; // keep WALKING
            }
          }

          this.state = 'ARRIVED';
          this.idleTimer = IDLE_WAIT_MIN + Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN);

          if (this.hideEntryPhase === 3 && arrivedItem?.type === ItemType.SLEEPING_HIDE) {
            this.hideEntryPhase = 0;
            // Turn around to face the opening (add PI to face back out through mouth)
            this.turnAroundAngle = this.group.rotation.y + Math.PI;
            this.sleepingInHide = true;
            this.idleTimer = 15 + Math.random() * 15; // rest longer in the hide
            // Status set to Sleeping only once eyes actually close (in turn-around handler)
          } else {
            this.hideEntryPhase = 0;
            this.turnAroundAngle = null;
            this.sleepingInHide = false;
            // re-read arrivedItem in case targetItemId was cleared above
            const finalItem = this.targetItemId !== null
              ? items.find(i => i.id === this.targetItemId) : null;
            if (finalItem?.type === ItemType.FOOD_BOWL) {
              this.posePitchTarget = -0.14;
              this.onArrivedAtFoodBowl?.(finalItem.id);
            } else if (finalItem?.type === ItemType.WATER_DISH) {
              this.posePitchTarget = -0.14;
              this.startDrinkAnimation();
            } else {
              this.showTongue();
            }
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
          const col = ITEM_COLLISION[item.type];

          // ── Generic collision ───────────────────────────────────────────────
          let colR: number;
          if (item.type === ItemType.WATER_DISH) {
            // Disable collision while gecko is entering, inside, or exiting this dish
            colR = (this.waterDishItemId === item.id) ? 0 : col.radius;
          } else if (item.type === ItemType.SLEEPING_HIDE) {
            if (this.hideEntryPhase === 3 && this.targetItemId === item.id) {
              colR = 0;
            } else if (this.hideEntryPhase >= 1 && this.targetItemId === item.id) {
              colR = 0.68;
            } else {
              colR = 0.45;
            }
          } else {
            colR = col.radius;
          }
          if (colR <= 0) continue;
          const r2 = colR * colR;

          // Test body centre, head-tip, and rear probe; accumulate the deepest penetration
          let worstPush = 0, pushDx = 0, pushDz = 0;
          for (const [px, pz] of [
            [nx,                        nz                       ],
            [nx + facingX * HEAD_REACH, nz + facingZ * HEAD_REACH],
            [nx - facingX * 0.38,       nz - facingZ * 0.38      ],
          ] as [number, number][]) {
            const cdx = px - item.position.x;
            const cdz = pz - item.position.z;
            const d2  = cdx * cdx + cdz * cdz;
            if (d2 < r2) {
              if (col.climbable) {
                const d = Math.sqrt(d2);
                const t = Math.min(1, 1 - d / colR);
                this.targetY = Math.max(this.targetY, col.height * Math.min(t * 2.5, 1));
              } else {
                const d = Math.sqrt(d2) || 0.001;
                const push = colR - d + 0.02;
                if (push > worstPush) {
                  worstPush = push; pushDx = (cdx / d) * push; pushDz = (cdz / d) * push;
                }
              }
            }
          }

          if (worstPush > 0) {
            // Push gecko out of the obstacle
            nx += pushDx; nz += pushDz;

            // Steering: add a tangential component pointing around the obstacle
            // toward the target, so gecko naturally navigates around rather than bouncing
            const normPx = pushDx / worstPush, normPz = pushDz / worstPush;
            // Two perpendicular candidates: left and right of the push normal
            const tanLx = -normPz, tanLz =  normPx;
            const tanRx =  normPz, tanRz = -normPx;
            // Pick the one that has a positive dot product with the goal direction
            const goalDx = this.target.x - nx, goalDz = this.target.z - nz;
            const dotL = goalDx * tanLx + goalDz * tanLz;
            const dotR = goalDx * tanRx + goalDz * tanRz;
            const steerX = dotL >= dotR ? tanLx : tanRx;
            const steerZ = dotL >= dotR ? tanLz : tanRz;
            // Apply steering as a fraction of the step so it blends with normal movement
            const steerStr = Math.min(worstPush * 1.5, step * 0.8);
            nx += steerX * steerStr; nz += steerZ * steerStr;
          }
        }

        // Clamp to enclosure
        nx = Math.max(bounds.minX + 0.15, Math.min(bounds.maxX - 0.15, nx));
        nz = Math.max(bounds.minZ + 0.15, Math.min(bounds.maxZ - 0.15, nz));
        pos.x = nx;
        pos.z = nz;

        // Stuck detection — if gecko barely moves for 2s, abandon target and pick a new one
        this.stuckTimer += delta;
        if (this.stuckTimer > 2.0) {
          const moved = pos.distanceTo(this.lastStuckCheckPos);
          if (moved < 0.08) {
            // Reset water dish state too in case it got stuck trying to enter
            this.waterDishPhase  = 0;
            this.waterDishItemId = null;
            this.hideEntryPhase  = 0;
            this.pickTarget(items, bounds);
          }
          this.stuckTimer = 0;
          this.lastStuckCheckPos.copy(pos);
        }

        // Smooth Y for climbing
        this.geckoY += (this.targetY - this.geckoY) * Math.min(9 * delta, 1);

        // Whole-body vertical bob only (no side sway)
        const bob = Math.abs(Math.sin(this.walkTime * BODY_BOB_SPEED)) * 0.018;
        pos.y = this.geckoY + bob;
        this.group.rotation.z += (0 - this.group.rotation.z) * 0.15;

        // Leg animation — trot gait, diagonal pairs lift together
        // Subtract bob so feet stay grounded as the body rises
        const phases = [0, Math.PI, Math.PI, 0];
        const defaultLegZ = [0.11, -0.11, 0.11, -0.11];
        this.legGroups.forEach((lg, i) => {
          const lift = Math.max(0, Math.sin(this.walkTime * LEG_SWING_SPEED + phases[i])) * 0.04;
          lg.position.y = lift - bob;
          lg.position.z += (defaultLegZ[i] - lg.position.z) * 0.10; // return to default Z
        });

        this.setStatus('🦎 Exploring…');
        break;
      }

      case 'ARRIVED':
        this.idleTimer -= delta;
        // Settle legs; when pitched, place front legs on the bowl rim sides,
        // keep rear legs on the ground.
        // legDefs: i=0,1 front (localX=0.13, localZ=±0.11), i=2,3 rear (localX=-0.08)
        this.legGroups.forEach((lg, i) => {
          const pitch  = this.posePitch;
          const localX = i < 2 ? 0.13 : -0.08;
          // Keep all legs at ground level despite pitch
          const groupY = this.geckoY + 0.08 * Math.sin(-pitch);
          const localY = (0 - groupY - localX * Math.sin(pitch)) / (Math.cos(pitch) || 1);
          lg.position.y += (localY - lg.position.y) * 0.15;
          // Return legs to default Z
          const defaultZ = [0.11, -0.11, 0.11, -0.11][i];
          lg.position.z += (defaultZ - lg.position.z) * 0.10;
        });
        this.group.rotation.z += (0 - this.group.rotation.z) * 0.12;
        this.targetY = 0;
        this.geckoY += (this.targetY - this.geckoY) * Math.min(3 * delta, 1);
        // group.position.y is already set above (geckoY + poseY) — don't overwrite here

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
            this.eyeMeshes.forEach(e => { e.visible = false; });
            this.pupilMeshes.forEach(p => { p.visible = false; });
            this.sleepEyeMeshes.forEach(s => { s.visible = true; });
            if (this.sleepingInHide) this.setStatus('💤 Sleeping…');
          }
        }

        if (this.idleTimer <= 0) {
          this.hideEntryPhase = 0;
          this.posePitchTarget = 0; // reset bowl/water pose

          // Water dish exit: walk gecko back out before idling
          if (this.waterDishPhase === 2) {
            const dish = items.find(i => i.id === this.waterDishItemId);
            if (dish) {
              // Pick an exit point in the direction the gecko is currently facing
              const exitAngle = this.group.rotation.y;
              this.target.set(
                dish.position.x + Math.cos(exitAngle) * 1.10,
                0,
                dish.position.z - Math.sin(exitAngle) * 1.10,
              );
              this.waterDishPhase = 3;
              this.state = 'WALKING';
              this.walkTime = 0;
              this.setStatus('🦎 Exploring…');
              break;
            }
            this.waterDishPhase  = 0;
            this.waterDishItemId = null;
          }

          if (this.sleepingInHide) {
            this.sleepingInHide = false;
            this.justLeftHide = true;          // don't go straight back in
            this.eyeMeshes.forEach(e => { e.visible = true; e.scale.y = 1; });
            this.pupilMeshes.forEach(p => { p.visible = true; p.scale.y = 0.95; });
            this.sleepEyeMeshes.forEach(s => { s.visible = false; }); // wake up
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
      const s = Math.max(0.04, squish);
      this.eyeMeshes.forEach(e => { e.scale.y = s; });
      this.pupilMeshes.forEach(p => { p.scale.y = 0.95 * s; });
      if (t >= 1) {
        this.blinkTime = -1;
        this.eyeMeshes.forEach(e => { e.scale.y = 1; });
        this.pupilMeshes.forEach(p => { p.scale.y = 0.95; });
      }
    }
  }

  private updateTongueAnim(delta: number) {
    if (this.tongueAnim === 0 || !this.tongueMesh || !this.eatCricketMesh) return;

    const EXTEND_T  = 0.28;
    const STUCK_T   = 0.12;
    const RETRACT_T = 0.30;

    this.tongueTimer += delta;

    // Compute tongue tip world position from current scale
    const currentLen = this.tongueMesh.scale.x;
    const rotY = this.group.rotation.y;
    const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
    const tipLocalX = 0.408 + currentLen;
    const tipLocalY = 0.048;
    // Apply group transform (Y-rotation matrix)
    const tipWX = this.group.position.x + cosR * tipLocalX;
    const tipWY = this.group.position.y + tipLocalY;
    const tipWZ = this.group.position.z - sinR * tipLocalX;

    if (this.tongueAnim === 1) {
      // Extending
      const t = Math.min(this.tongueTimer / EXTEND_T, 1);
      this.tongueMesh.scale.x = t * this.tongueMaxLen;
      if (this.tongueTimer >= EXTEND_T) {
        this.tongueTimer = 0;
        this.tongueAnim  = 2;
      }
    } else if (this.tongueAnim === 2) {
      // Stuck — cricket teleports to tongue tip
      this.eatCricketMesh.position.set(
        tipWX - this.eatBowlPos.x,
        tipWY,
        tipWZ - this.eatBowlPos.z
      );
      if (this.tongueTimer >= STUCK_T) {
        this.tongueTimer = 0;
        this.tongueAnim  = 3;
      }
    } else if (this.tongueAnim === 3) {
      // Retracting — cricket follows tongue tip
      const t = Math.max(0, 1 - this.tongueTimer / RETRACT_T);
      this.tongueMesh.scale.x = t * this.tongueMaxLen;
      this.eatCricketMesh.position.set(
        tipWX - this.eatBowlPos.x,
        tipWY,
        tipWZ - this.eatBowlPos.z
      );
      if (this.tongueTimer >= RETRACT_T) {
        // Done — delete cricket
        this.tongueMesh.scale.x = 0;
        this.tongueMesh.visible  = false;
        this.tongueAnim = 0;
        this.onEatDone?.();
        this.eatCricketMesh = null;
        this.onEatDone = null;
      }
    }
  }

  private startDrinkAnimation() {
    if (!this.tongueMesh) return;
    this.drinkPhase = 1;
    this.drinkTimer = 0;
    this.drinkCount = 0;
    this.tongueMesh.visible = true;
  }

  private updateDrinkAnim(delta: number) {
    if (this.drinkPhase === 0 || !this.tongueMesh) return;
    const TOTAL_LAPS  = 5;
    const DRINK_LEN   = 0.10; // short lick distance
    const EXTEND_T    = 0.09;
    const RETRACT_T   = 0.09;

    this.drinkTimer += delta;

    if (this.drinkPhase === 1) {
      // Extending
      this.tongueMesh.scale.x = Math.min(this.drinkTimer / EXTEND_T, 1) * DRINK_LEN;
      if (this.drinkTimer >= EXTEND_T) {
        this.drinkTimer = 0;
        this.drinkPhase = 2;
      }
    } else if (this.drinkPhase === 2) {
      // Retracting
      this.tongueMesh.scale.x = Math.max(0, 1 - this.drinkTimer / RETRACT_T) * DRINK_LEN;
      if (this.drinkTimer >= RETRACT_T) {
        this.drinkCount++;
        if (this.drinkCount >= TOTAL_LAPS) {
          this.drinkPhase = 0;
          this.tongueMesh.scale.x = 0;
          this.tongueMesh.visible = false;
        } else {
          this.drinkTimer = 0;
          this.drinkPhase = 1;
        }
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
        // Three-phase entry so the gecko walks AROUND the hide to the mouth:
        //   Phase 1 → side waypoint (clear of hide walls)
        //   Phase 2 → staging point in front of mouth
        //   Phase 3 → centre of hide (gecko enters freely, no wall collision)
        // The hide's open front is at local +X (len/2 = 0.475).
        // item.mesh.rotation.y gives the user rotation; local +X → world (cos θ, 0, −sin θ).
        const rotY  = item.mesh.rotation.y;
        const mDX   = Math.cos(rotY);       // mouth direction
        const mDZ   = -Math.sin(rotY);
        const pDX   = -mDZ;                 // perpendicular (left side)
        const pDZ   =  mDX;
        // Which side is the gecko on?
        const relX  = this.group.position.x - item.position.x;
        const relZ  = this.group.position.z - item.position.z;
        const side  = (relX * pDX + relZ * pDZ) >= 0 ? 1 : -1;
        // Side waypoint: beside the MOUTH end of the hide so the gecko only
        // needs to step forward to reach the entrance (not slide around a corner).
        // Perpendicular clear distance 0.80 > colR 0.68; forward offset puts it
        // level with the mouth opening.
        this.target.set(
          item.position.x + pDX * side * 0.80 + mDX * 0.40,
          0,
          item.position.z + pDZ * side * 0.80 + mDZ * 0.40,
        );
        this.hideEntryPhase = 1;
      } else if (item.type === ItemType.WATER_DISH) {
        this.hideEntryPhase = 0;
        // Walk straight to the bowl centre — collision is disabled while waterDishItemId is set
        this.target.set(item.position.x, 0, item.position.z);
        this.waterDishPhase  = 1;
        this.waterDishItemId = item.id;
      } else {
        this.hideEntryPhase = 0;
        const approachR = col.climbable
          ? col.radius * 0.3
          : col.radius + HEAD_REACH + 0.05;
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
