import * as THREE from 'three';

export enum ItemType {
  SLEEPING_HIDE   = 'Sleeping Hide',
  WATER_DISH      = 'Water Dish',
  FOOD_BOWL       = 'Food Bowl',
  CLIMBING_BRANCH = 'Climbing Branch',
  CORK_BARK       = 'Cork Bark',
  RAMP            = 'Ramp',
  PLATFORM        = 'Plant House',
  STONE           = 'Stone',
  LEAF_DECOR      = 'Leaf Decor',
  BASKING_LAMP    = 'Basking Lamp',
}

export const ITEM_EMOJIS: Record<ItemType, string> = {
  [ItemType.SLEEPING_HIDE]:   '🏠',
  [ItemType.WATER_DISH]:      '💧',
  [ItemType.FOOD_BOWL]:       '🍽️',
  [ItemType.CLIMBING_BRANCH]: '🪵',
  [ItemType.CORK_BARK]:       '🪨',
  [ItemType.RAMP]:            '📐',
  [ItemType.PLATFORM]:        '🌱',
  [ItemType.STONE]:           '⚫',
  [ItemType.LEAF_DECOR]:      '🌿',
  [ItemType.BASKING_LAMP]:    '💡',
};

export interface ItemCollisionData {
  radius: number;    // horizontal collision radius
  height: number;    // elevation gecko reaches when on top
  climbable: boolean; // true = gecko walks on top; false = gecko is pushed around
}

export const ITEM_COLLISION: Record<ItemType, ItemCollisionData> = {
  [ItemType.SLEEPING_HIDE]:   { radius: 0.01, height: 0,    climbable: false },
  [ItemType.WATER_DISH]:      { radius: 0.70, height: 0,    climbable: false },
  [ItemType.FOOD_BOWL]:       { radius: 0.32, height: 0,    climbable: false },
  [ItemType.CLIMBING_BRANCH]: { radius: 0.35, height: 0.40, climbable: true  },
  [ItemType.CORK_BARK]:       { radius: 0.38, height: 0.12, climbable: true  },
  [ItemType.RAMP]:            { radius: 0.42, height: 0.30, climbable: true  },
  [ItemType.PLATFORM]:        { radius: 0.01, height: 0,    climbable: false },
  [ItemType.STONE]:           { radius: 0.26, height: 0,    climbable: false },
  [ItemType.LEAF_DECOR]:      { radius: 0.12, height: 0,    climbable: false },
  [ItemType.BASKING_LAMP]:    { radius: 0,    height: 0,    climbable: false },
};

// ── Branch spine: polyline segments in item-local XZ + height at each node ──
// Each node: [x, y, z, radius] — the gecko collides with capsules between nodes
export const BRANCH_SPINE: [number, number, number, number][] = [
  [ 0.50, 0.02,  0.00, 0.07],
  [ 0.30, 0.04,  0.02, 0.08],
  [ 0.05, 0.08,  0.00, 0.08],
  [-0.18, 0.16,  0.00, 0.07],
  [-0.34, 0.30, -0.02, 0.06],
  [-0.42, 0.44,  0.00, 0.05],  // fork point
  [-0.52, 0.60,  0.04, 0.04],  // upper fork
  [-0.56, 0.72,  0.06, 0.03],
];
export const BRANCH_SPINE_FORK: [number, number, number, number][] = [
  [-0.42, 0.44,  0.00, 0.05],  // fork point (shared)
  [-0.56, 0.42, -0.06, 0.04],  // lower fork
  [-0.68, 0.36, -0.08, 0.02],
];

// ── Cricket factory ──────────────────────────────────────────────────────────
export function createCricketMesh(): THREE.Group {
  const g = new THREE.Group();
  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x5a4a20 });
  const darkMat  = new THREE.MeshLambertMaterial({ color: 0x3a2e10 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.025, 7, 5), bodyMat);
  body.scale.set(1.8, 0.9, 1.0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), darkMat);
  head.position.set(0.036, 0.005, 0);

  // 6 legs (3 each side)
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3a2e10 });
  for (let side = -1; side <= 1; side += 2) {
    for (let li = 0; li < 3; li++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.05, 3), legMat);
      leg.rotation.z = (side > 0 ? -1 : 1) * (Math.PI / 2.5 + li * 0.15);
      leg.position.set((li - 1) * 0.022, -0.01, side * 0.022);
      g.add(leg);
    }
  }

  // Antennae
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.001, 0.06, 3), darkMat);
    ant.rotation.z = side * Math.PI / 5;
    ant.position.set(0.05, 0.01, side * 0.01);
    g.add(ant);
  }

  // Hind leg jump legs (longer)
  for (const side of [-1, 1]) {
    const hind = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.065, 3), legMat);
    hind.rotation.z = side * Math.PI / 3;
    hind.position.set(-0.028, -0.005, side * 0.025);
    g.add(hind);
  }

  g.add(body, head);
  return g;
}

// ── Plant styles for Plant House ──────────────────────────────────────────────
export const PLANT_STYLES = ['mixed', 'succulents', 'cacti', 'ferns', 'flowers', 'grass'] as const;
export type PlantStyle = typeof PLANT_STYLES[number];

export function buildPlants(group: THREE.Group, style: PlantStyle) {
  // Remove old plants
  const toRemove = group.children.filter(c => c.userData.isPlant);
  toRemove.forEach(c => group.remove(c));

  const W = group.userData.plantW as number;
  const D = group.userData.plantD as number;
  const baseY = group.userData.plantBaseY as number;
  group.userData.plantStyle = style;

  const leafMat      = new THREE.MeshLambertMaterial({ color: 0x4a8c2a, side: THREE.DoubleSide });
  const darkLeaf     = new THREE.MeshLambertMaterial({ color: 0x2d6618, side: THREE.DoubleSide });
  const stemMat      = new THREE.MeshLambertMaterial({ color: 0x3a7020 });
  const succulentMat = new THREE.MeshLambertMaterial({ color: 0x6aab5c, side: THREE.DoubleSide });
  const cactusMat    = new THREE.MeshLambertMaterial({ color: 0x3d7a2e });
  const fernMat      = new THREE.MeshLambertMaterial({ color: 0x2e8b3a, side: THREE.DoubleSide });
  const flowerMat    = new THREE.MeshLambertMaterial({ color: 0xe85480 });
  const yellowFlower = new THREE.MeshLambertMaterial({ color: 0xf0c830 });

  const add = (m: THREE.Object3D) => { m.userData.isPlant = true; group.add(m); };

  const addSucculent = (px: number, pz: number) => {
    const s = 1.4 + Math.random() * 0.6;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 8, 6), succulentMat);
    bulb.scale.set(1, 0.6, 1);
    bulb.position.set(px, baseY + 0.03 * s, pz);
    add(bulb);
    for (let li = 0; li < 6; li++) {
      const la = (li / 6) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 6, 5), succulentMat);
      petal.scale.set(1.6, 0.4, 1);
      petal.position.set(px + Math.cos(la) * 0.045 * s, baseY + 0.015 * s, pz + Math.sin(la) * 0.045 * s);
      petal.rotation.y = la;
      add(petal);
    }
  };

  const addCactus = (px: number, pz: number) => {
    const s = 1.4 + Math.random() * 0.6;
    const cH = (0.10 + Math.random() * 0.06) * s;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * s, 0.030 * s, cH, 6), cactusMat);
    body.position.set(px, baseY + cH / 2, pz);
    add(body);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015 * s, 0.018 * s, cH * 0.4, 5), cactusMat);
    arm.position.set(px + 0.035 * s, baseY + cH * 0.5, pz);
    arm.rotation.z = -0.5;
    add(arm);
  };

  const addFern = (px: number, pz: number, seed: number) => {
    const s = 1.4 + Math.random() * 0.6;
    const fStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.012 * s, 0.06 * s, 4), stemMat);
    fStem.position.set(px, baseY + 0.03 * s, pz);
    add(fStem);
    for (let fi = 0; fi < 5; fi++) {
      const fa = (fi / 5) * Math.PI * 2 + seed;
      const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.10 * s, 0.025 * s), fernMat);
      frond.position.set(px + Math.cos(fa) * 0.04 * s, baseY + 0.05 * s - fi * 0.005, pz + Math.sin(fa) * 0.04 * s);
      frond.rotation.set(-0.6 - fi * 0.1, fa, 0);
      add(frond);
    }
  };

  const addFlower = (px: number, pz: number, seed: number) => {
    const s = 1.4 + Math.random() * 0.6;
    const fH = (0.10 + Math.random() * 0.05) * s;
    const fStem = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.010 * s, fH, 4), stemMat);
    fStem.position.set(px, baseY + fH / 2, pz);
    add(fStem);
    for (let li = 0; li < 3; li++) {
      const la = (li / 3) * Math.PI * 2 + seed;
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.06 * s, 0.03 * s), leafMat);
      leaf.position.set(px + Math.cos(la) * 0.02 * s, baseY + fH * 0.4 + li * 0.015, pz + Math.sin(la) * 0.02 * s);
      leaf.rotation.set(-0.4, la, 0);
      add(leaf);
    }
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.022 * s, 6, 5), seed % 2 === 0 ? flowerMat : yellowFlower);
    bloom.position.set(px, baseY + fH + 0.01, pz);
    add(bloom);
  };

  const addGrass = (px: number, pz: number) => {
    const s = 1.4 + Math.random() * 0.6;
    for (let gi = 0; gi < 5; gi++) {
      const gH = (0.08 + Math.random() * 0.08) * s;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(0.015 * s, gH), darkLeaf);
      const gx = px + (Math.random() - 0.5) * 0.06;
      const gz = pz + (Math.random() - 0.5) * 0.06;
      blade.position.set(gx, baseY + gH / 2, gz);
      blade.rotation.set(0, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
      add(blade);
    }
  };

  const count = 25;
  for (let i = 0; i < count; i++) {
    const px = (Math.random() - 0.5) * (W - 0.10);
    const pz = (Math.random() - 0.5) * (D - 0.10);

    if (style === 'mixed') {
      [addSucculent, addCactus, addFern, addFlower, addGrass][i % 5](px, pz, i);
    } else if (style === 'succulents') {
      addSucculent(px, pz);
    } else if (style === 'cacti') {
      addCactus(px, pz);
    } else if (style === 'ferns') {
      addFern(px, pz, i);
    } else if (style === 'flowers') {
      addFlower(px, pz, i);
    } else {
      addGrass(px, pz);
    }
  }
}

// ── Item mesh factory ─────────────────────────────────────────────────────────
export function createItemMesh(type: ItemType): THREE.Group {
  const group = new THREE.Group();
  group.userData.itemType = type;

  switch (type) {

    // ── Sleeping Hide: half hollow cylinder laid on its side ────────────────
    case ItemType.SLEEPING_HIDE: {
      const R    = 0.38;
      const len  = 1.30;
      const wall = 0.045;
      const SEG  = 24;

      const mat  = new THREE.MeshLambertMaterial({ color: 0x8b5e3c, side: THREE.DoubleSide });
      const dark = new THREE.MeshLambertMaterial({ color: 0x5c3820, side: THREE.DoubleSide });

      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, len, SEG, 1, true, 0, Math.PI),
        mat
      );
      outer.rotation.z = Math.PI / 2;

      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(R - wall, R - wall, len, SEG, 1, true, 0, Math.PI),
        mat
      );
      inner.rotation.z = Math.PI / 2;

      const backDisc = new THREE.Mesh(
        new THREE.CircleGeometry(R, SEG, 0, Math.PI),
        dark
      );
      backDisc.rotation.y = -Math.PI / 2;
      backDisc.position.x = -len / 2;

      const frontRing = new THREE.Mesh(
        new THREE.RingGeometry(R - wall, R, SEG, 1, 0, Math.PI),
        dark
      );
      frontRing.rotation.y = Math.PI / 2;
      frontRing.position.x = len / 2;

      group.add(outer, inner, backDisc, frontRing);
      break;
    }

    // ── Water Dish: circular soaking basin ────────────────────────────────
    case ItemType.WATER_DISH: {
      const OUTER_R = 0.68;
      const INNER_R = 0.60;
      const WALL_H  = 0.07;

      const dishMat  = new THREE.MeshLambertMaterial({ color: 0x78909c, side: THREE.DoubleSide });
      const floorMat = new THREE.MeshLambertMaterial({ color: 0x607d8b });
      const waterMat = new THREE.MeshLambertMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.85 });

      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(OUTER_R, OUTER_R, WALL_H, 32, 1, true),
        dishMat
      );
      outerWall.position.y = WALL_H / 2;

      const innerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(INNER_R, INNER_R, WALL_H, 32, 1, true),
        dishMat
      );
      innerWall.position.y = WALL_H / 2;

      const rimRing = new THREE.Mesh(
        new THREE.RingGeometry(INNER_R, OUTER_R, 32),
        floorMat
      );
      rimRing.rotation.x = -Math.PI / 2;
      rimRing.position.y = WALL_H + 0.001;

      const floor = new THREE.Mesh(new THREE.CircleGeometry(OUTER_R, 32), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.002;

      const water = new THREE.Mesh(new THREE.CircleGeometry(INNER_R - 0.04, 32), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.038;

      group.add(outerWall, innerWall, rimRing, floor, water);
      break;
    }

    // ── Food Bowl: hollow red dish with visible interior ────────────────────
    case ItemType.FOOD_BOWL: {
      const SEG  = 20;
      const H    = 0.072;
      const RO_T = 0.30;
      const RO_B = 0.24;

      // DoubleSide outer wall: outside visible from outside, inside visible from above
      const wallMat = new THREE.MeshLambertMaterial({ color: 0xc0392b, side: THREE.DoubleSide });
      const rimMat  = new THREE.MeshLambertMaterial({ color: 0xa93226 });

      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(RO_T, RO_B, H, SEG, 1, true),
        wallMat
      );
      outer.position.y = H / 2;

      // Base disc (exterior bottom)
      const base = new THREE.Mesh(new THREE.CircleGeometry(RO_B, SEG), wallMat);
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.001;

      // Interior floor — slightly inside the wall so no z-fighting with base
      const floor = new THREE.Mesh(new THREE.CircleGeometry(RO_B - 0.01, SEG), wallMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.004;

      // Rim annulus on top
      const rim = new THREE.Mesh(new THREE.RingGeometry(RO_B, RO_T, SEG), rimMat);
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = H + 0.001;

      group.add(outer, base, floor, rim);
      // userData for cricket system
      group.userData.crickets = [] as THREE.Group[];
      group.userData.hasCrickets = false;
      break;
    }

    // ── Climbing Branch: horizontal driftwood with Y-fork ───────────────────
    case ItemType.CLIMBING_BRANCH: {
      const mat  = new THREE.MeshLambertMaterial({ color: 0xb8a088 });
      const dark = new THREE.MeshLambertMaterial({ color: 0x8a7560 });

      const addSeg3 = (
        x1: number, y1: number, z1: number,
        x2: number, y2: number, z2: number,
        r1: number, r2: number, m: THREE.Material = mat
      ) => {
        const dir = new THREE.Vector3(x2-x1, y2-y1, z2-z1);
        const len = dir.length();
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 8), m);
        seg.position.set((x1+x2)/2, (y1+y2)/2, (z1+z2)/2);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
        group.add(seg);
      };

      // Long base section lying mostly flat, slight upward angle
      addSeg3( 0.50, 0.02,  0.00,  0.30, 0.04,  0.02, 0.060, 0.068);
      addSeg3( 0.30, 0.04,  0.02,  0.05, 0.08,  0.00, 0.068, 0.072);
      addSeg3( 0.05, 0.08,  0.00, -0.18, 0.16,  0.00, 0.072, 0.065);
      // Rises up toward the fork
      addSeg3(-0.18, 0.16,  0.00, -0.34, 0.30, -0.02, 0.065, 0.055);
      addSeg3(-0.34, 0.30, -0.02, -0.42, 0.44,  0.00, 0.055, 0.048);
      // Fork: upper-left branch continues up
      addSeg3(-0.42, 0.44,  0.00, -0.52, 0.60,  0.04, 0.046, 0.032);
      addSeg3(-0.52, 0.60,  0.04, -0.56, 0.72,  0.06, 0.032, 0.020);
      // Fork: lower-right branch angles out
      addSeg3(-0.42, 0.44,  0.00, -0.56, 0.42, -0.06, 0.042, 0.030);
      addSeg3(-0.56, 0.42, -0.06, -0.68, 0.36, -0.08, 0.030, 0.018);
      // Thick support leg — props the trunk up like a kickstand
      addSeg3(-0.10, 0.12,  0.00, -0.06, 0.04,  0.14, 0.055, 0.060, dark);
      addSeg3(-0.06, 0.04,  0.14, -0.04, 0.00,  0.22, 0.060, 0.048, dark);
      // Second support leg on opposite side
      const leg2 = new THREE.MeshLambertMaterial({ color: 0x9a8468 });
      addSeg3(-0.26, 0.24,  0.00, -0.32, 0.10, -0.18, 0.050, 0.055, leg2);
      addSeg3(-0.32, 0.10, -0.18, -0.38, 0.00, -0.28, 0.055, 0.042, leg2);
      break;
    }

    // ── Cork Bark ───────────────────────────────────────────────────────────
    case ItemType.CORK_BARK: {
      const barkMat  = new THREE.MeshLambertMaterial({ color: 0x795548 });
      const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const bark = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 0.42), barkMat);
      bark.position.y = 0.045;
      for (let i = -2; i <= 2; i++) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.045), ridgeMat);
        ridge.position.set(0, 0.095, i * 0.075);
        group.add(ridge);
      }
      group.add(bark);
      break;
    }

    // ── Ramp: proper wedge shape with grip lines ─────────────────────────────
    case ItemType.RAMP: {
      const RW = 0.50, RL = 0.70, RH = 0.30;
      const slopeAngle = Math.atan2(RH, RL);
      const slopeLen   = Math.sqrt(RL * RL + RH * RH);

      const surfMat  = new THREE.MeshLambertMaterial({ color: 0xd2b48c, side: THREE.DoubleSide });
      const sideMat  = new THREE.MeshLambertMaterial({ color: 0xb8965a, side: THREE.DoubleSide });
      const gripMat  = new THREE.MeshLambertMaterial({ color: 0xa07840 });

      // Sloped top surface
      const surface = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.025, slopeLen), surfMat);
      surface.rotation.x = slopeAngle;
      surface.position.set(0, RH / 2, 0);
      group.add(surface);

      // Triangular side walls using ShapeGeometry
      const sideShape = new THREE.Shape();
      sideShape.moveTo(-RL / 2, 0);
      sideShape.lineTo( RL / 2, 0);
      sideShape.lineTo( RL / 2, RH);
      sideShape.closePath();
      const sideGeo = new THREE.ShapeGeometry(sideShape);

      for (const sign of [-1, 1] as const) {
        const side = new THREE.Mesh(sideGeo, sideMat);
        side.rotation.y = sign * Math.PI / 2;
        side.position.set(sign * RW / 2, 0, 0);
        group.add(side);
      }

      // Back wall at high end
      const back = new THREE.Mesh(new THREE.BoxGeometry(RW, RH, 0.025), sideMat);
      back.position.set(0, RH / 2, RL / 2);
      group.add(back);

      // Bottom plate
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.02, RL), sideMat);
      bottom.position.y = 0.01;
      group.add(bottom);

      // Grip strips across slope (evenly spaced)
      for (let i = 1; i <= 4; i++) {
        const t = i / 5;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(RW - 0.04, 0.018, 0.025), gripMat);
        grip.rotation.x = slopeAngle;
        const zPos = (t - 0.5) * RL;
        const yPos = t * RH;
        grip.position.set(0, yPos + 0.022, zPos);
        group.add(grip);
      }

      // Small arrows on surface indicating up-direction
      const arrowMat = new THREE.MeshLambertMaterial({ color: 0x8a6030 });
      for (let i = 1; i <= 2; i++) {
        const t = i / 3;
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 4), arrowMat);
        arrow.rotation.x = slopeAngle + Math.PI / 2;
        arrow.position.set(0, t * RH + 0.05, (t - 0.5) * RL);
        group.add(arrow);
      }
      break;
    }

    // ── Platform: elevated flat surface gecko walks on ───────────────────────
    case ItemType.PLATFORM: {
      const W = 1.25, D = 1.00, H = 0.60;
      const WALL = 0.04;
      const blackMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a, side: THREE.DoubleSide });
      const innerMat = new THREE.MeshLambertMaterial({ color: 0x111111, side: THREE.DoubleSide });
      const trayMat  = new THREE.MeshLambertMaterial({ color: 0xc05a28, side: THREE.DoubleSide });
      const rimMat   = new THREE.MeshLambertMaterial({ color: 0x151515 });
      const leafMat  = new THREE.MeshLambertMaterial({ color: 0x4a8c2a, side: THREE.DoubleSide });
      const darkLeaf = new THREE.MeshLambertMaterial({ color: 0x2d6618, side: THREE.DoubleSide });
      const stemMat  = new THREE.MeshLambertMaterial({ color: 0x3a7020 });

      // Back wall
      const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, WALL), blackMat);
      back.position.set(0, H / 2, -D / 2 + WALL / 2);
      group.add(back);
      // Left wall
      const left = new THREE.Mesh(new THREE.BoxGeometry(WALL, H, D), blackMat);
      left.position.set(-W / 2 + WALL / 2, H / 2, 0);
      group.add(left);
      // Right wall
      const right = new THREE.Mesh(new THREE.BoxGeometry(WALL, H, D), blackMat);
      right.position.set(W / 2 - WALL / 2, H / 2, 0);
      group.add(right);
      // Front wall with rectangular doorway
      const doorW = 0.44, doorH = H * 0.62;
      const lintelH = H - doorH;
      const pillarW = (W - doorW) / 2;
      const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(pillarW, H, WALL), blackMat);
      leftPillar.position.set(-W / 2 + pillarW / 2, H / 2, D / 2 - WALL / 2);
      group.add(leftPillar);
      const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(pillarW, H, WALL), blackMat);
      rightPillar.position.set(W / 2 - pillarW / 2, H / 2, D / 2 - WALL / 2);
      group.add(rightPillar);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW, lintelH, WALL), blackMat);
      lintel.position.set(0, H - lintelH / 2, D / 2 - WALL / 2);
      group.add(lintel);

      // Ceiling
      const top = new THREE.Mesh(new THREE.BoxGeometry(W, WALL, D), blackMat);
      top.position.y = H;
      group.add(top);

      // Rim
      const rimF = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.03, 0.03), rimMat);
      rimF.position.set(0, H + 0.015, D / 2 + 0.01);
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.03, 0.03), rimMat);
      rimB.position.set(0, H + 0.015, -D / 2 - 0.01);
      const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, D + 0.06), rimMat);
      rimL.position.set(-W / 2 - 0.01, H + 0.015, 0);
      const rimR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, D + 0.06), rimMat);
      rimR.position.set(W / 2 + 0.01, H + 0.015, 0);
      group.add(rimF, rimB, rimL, rimR);

      // Orange tray on top
      const trayH = 0.03;
      const tray = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, trayH, D - 0.06), trayMat);
      tray.position.y = H + 0.03 + trayH / 2;
      group.add(tray);

      group.userData.plantW = W;
      group.userData.plantD = D;
      group.userData.plantBaseY = H + 0.03 + trayH;
      group.userData.plantStyle = 'mixed';
      buildPlants(group, 'mixed');

      break;
    }

    // ── Stone ───────────────────────────────────────────────────────────────
    case ItemType.STONE: {
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0),
        new THREE.MeshLambertMaterial({ color: 0x78909c }));
      stone.scale.set(1, 0.55, 0.9);
      stone.position.y = 0.12;
      stone.rotation.y = Math.random() * Math.PI;
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0),
        new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
      pebble.scale.set(1, 0.5, 0.85);
      pebble.position.set(0.22, 0.05, 0.1);
      group.add(stone, pebble);
      break;
    }

    // ── Leaf Decor ──────────────────────────────────────────────────────────
    case ItemType.BASKING_LAMP: {
      const blackMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
      const bulbMat  = new THREE.MeshLambertMaterial({ color: 0xffdd44, emissive: 0xffaa00, emissiveIntensity: 0.8 });

      // Upside-down bowl
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.30, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        blackMat
      );
      bowl.rotation.x = 0;
      bowl.castShadow = false;
      bowl.position.y = 2.15;
      group.add(bowl);

      // Glowing bulb inside
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bulbMat);
      bulb.castShadow = false;
      bulb.position.y = 2.08;
      group.add(bulb);

      // Light beam cylinder
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffcc33, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 2.05, 16, 1, true), beamMat);
      beam.castShadow = false;
      beam.receiveShadow = false;
      beam.position.y = 1.03;
      group.add(beam);

      // Warm spot on the ground
      const spotMat = new THREE.MeshBasicMaterial({
        color: 0xffaa33, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
      });
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.50, 24), spotMat);
      spot.castShadow = false;
      spot.receiveShadow = false;
      spot.rotation.x = -Math.PI / 2;
      spot.position.y = 0.005;
      group.add(spot);

      // Spotlight
      const spotlight = new THREE.SpotLight(0xffaa44, 2.5, 4, Math.PI / 6, 0.5, 1);
      spotlight.castShadow = true;
      spotlight.shadow.mapSize.set(512, 512);
      spotlight.position.y = 2.1;
      spotlight.target.position.set(0, 0, 0);
      group.add(spotlight);
      group.add(spotlight.target);

      group.userData.lampRadius = 0.50;
      group.userData.lampBeam = beam;
      group.userData.lampSpot = spot;

      break;
    }

    case ItemType.LEAF_DECOR: {
      const leafMat = new THREE.MeshLambertMaterial({ color: 0x558b2f, side: THREE.DoubleSide });
      const darkLeaf= new THREE.MeshLambertMaterial({ color: 0x33691e, side: THREE.DoubleSide });
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
      for (let i = 0; i < 4; i++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.13), i % 2 === 0 ? leafMat : darkLeaf);
        const a = (i / 4) * Math.PI * 2;
        leaf.rotation.set(-Math.PI/2 + 0.3, a, 0);
        leaf.position.set(Math.cos(a) * 0.1, 0.05 + i * 0.02, Math.sin(a) * 0.1);
        group.add(leaf);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.14, 5), stemMat);
      stem.position.y = 0.07;
      group.add(stem);
      break;
    }
  }

  return group;
}
