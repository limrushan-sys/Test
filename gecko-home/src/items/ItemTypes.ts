import * as THREE from 'three';

export enum ItemType {
  SLEEPING_HIDE   = 'Sleeping Hide',
  WATER_DISH      = 'Water Dish',
  FOOD_BOWL       = 'Food Bowl',
  CLIMBING_BRANCH = 'Climbing Branch',
  CORK_BARK       = 'Cork Bark',
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
  [ItemType.PLATFORM]:        '🌱',
  [ItemType.STONE]:           '⚫',
  [ItemType.LEAF_DECOR]:      '🌿',
  [ItemType.BASKING_LAMP]:    '💡',
};

export interface ItemCollisionData {
  radius: number;    // horizontal collision radius (gecko push)
  height: number;    // elevation gecko reaches when on top
  climbable: boolean; // true = gecko walks on top; false = gecko is pushed around
  wallMounted?: boolean; // true = can only be placed on enclosure walls
  footprint?: number;    // placement overlap radius (defaults to radius if omitted)
  // Multi-circle collision: array of [localX, localZ, radius] for precise shapes
  circles?: [number, number, number][];
}

export const ITEM_COLLISION: Record<ItemType, ItemCollisionData> = {
  [ItemType.SLEEPING_HIDE]:   { radius: 0.45, height: 0,    climbable: false, footprint: 0.65,
    circles: [[-0.45, 0, 0.20], [-0.15, 0, 0.20], [0.15, 0, 0.20], [0.45, 0, 0.20],
              [-0.45, 0.18, 0.20], [-0.15, 0.18, 0.20], [0.15, 0.18, 0.20], [0.45, 0.18, 0.20],
              [-0.45,-0.18, 0.20], [-0.15,-0.18, 0.20], [0.15,-0.18, 0.20], [0.45,-0.18, 0.20]] },
  [ItemType.WATER_DISH]:      { radius: 0.70, height: 0,    climbable: false, footprint: 0.70 },
  [ItemType.FOOD_BOWL]:       { radius: 0.32, height: 0,    climbable: false, footprint: 0.32 },
  [ItemType.CLIMBING_BRANCH]: { radius: 0.35, height: 0.40, climbable: true,  footprint: 0.45,
    circles: [[0.45, 0, 0.18], [0.15, 0.02, 0.18], [-0.15, 0, 0.18], [-0.40, -0.02, 0.16]] },
  [ItemType.CORK_BARK]:       { radius: 0.35, height: 0.14, climbable: true, wallMounted: true, footprint: 0.40,
    circles: [[-0.35, 0.28, 0.25], [0, 0.28, 0.25], [0.35, 0.28, 0.25]] },
  [ItemType.PLATFORM]:        { radius: 0.55, height: 0,    climbable: false, footprint: 0.625,
    circles: [[-0.35, -0.22, 0.28], [0, -0.22, 0.28], [0.35, -0.22, 0.28],
              [-0.35,  0.22, 0.28], [0,  0.22, 0.28], [0.35,  0.22, 0.28],
              [-0.35,  0,    0.28], [0,  0,    0.28], [0.35,  0,    0.28]] },
  [ItemType.STONE]:           { radius: 0.30, height: 0,    climbable: false, footprint: 0.30,
    circles: [[0, 0, 0.30], [0.28, 0.12, 0.15]] },
  [ItemType.LEAF_DECOR]:      { radius: 0,    height: 0,    climbable: false, footprint: 0.22 },
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
  g.userData.noRecolor = true;
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
export const PLANT_STYLES = ['mixed', 'succulents', 'ferns', 'grass'] as const;
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
  const fernMat      = new THREE.MeshLambertMaterial({ color: 0x2e8b3a, side: THREE.DoubleSide });

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

  const snakeDark = new THREE.MeshLambertMaterial({ color: 0x2e7a22, side: THREE.DoubleSide });
  const snakeLight = new THREE.MeshLambertMaterial({ color: 0x6ec44a, side: THREE.DoubleSide });
  const snakeEdge = new THREE.MeshLambertMaterial({ color: 0xd4c850, side: THREE.DoubleSide });

  const addGrass = (px: number, pz: number) => {
    const s = 1.0 + Math.random() * 0.4;
    const leafCount = 4 + Math.floor(Math.random() * 3);
    for (let gi = 0; gi < leafCount; gi++) {
      const lH = (0.14 + Math.random() * 0.12) * s;
      const lW = 0.055 * s;  // wide sword shape
      const lD = 0.012 * s;  // slight thickness / curve
      const angle = (gi / leafCount) * Math.PI * 2 + Math.random() * 0.4;
      const spread = 0.012 * s;
      const lx = px + Math.cos(angle) * spread;
      const lz = pz + Math.sin(angle) * spread;
      const tilt = 0.08 + Math.random() * 0.18;

      // Main leaf body — wide, sword-shaped
      const leafGeo = new THREE.BoxGeometry(lW, lH, lD);
      // Taper the top: scale top vertices inward
      const pos = leafGeo.attributes.position;
      for (let vi = 0; vi < pos.count; vi++) {
        const y = pos.getY(vi);
        if (y > 0) {
          const taper = 0.3 + 0.7 * (1 - y / (lH / 2));
          pos.setX(vi, pos.getX(vi) * taper);
        }
      }
      pos.needsUpdate = true;
      leafGeo.computeVertexNormals();

      const leaf = new THREE.Mesh(leafGeo, gi % 2 === 0 ? snakeDark : snakeLight);
      leaf.position.set(lx, baseY + lH / 2, lz);
      leaf.rotation.set(0, angle, Math.sin(angle) * tilt);
      add(leaf);

      // Yellow edge stripes on both sides
      for (const side of [-1, 1]) {
        const edgeH = lH * 0.92;
        const edgeGeo = new THREE.BoxGeometry(0.006 * s, edgeH, lD + 0.002);
        // Taper edge to match leaf
        const ePos = edgeGeo.attributes.position;
        for (let vi = 0; vi < ePos.count; vi++) {
          const y = ePos.getY(vi);
          if (y > 0) {
            const taper = 0.3 + 0.7 * (1 - y / (edgeH / 2));
            ePos.setX(vi, ePos.getX(vi) * taper);
          }
        }
        ePos.needsUpdate = true;
        const edge = new THREE.Mesh(edgeGeo, snakeEdge);
        edge.position.set(
          lx + Math.cos(angle + Math.PI / 2) * side * lW * 0.45,
          baseY + edgeH / 2,
          lz + Math.sin(angle + Math.PI / 2) * side * lW * 0.45
        );
        edge.rotation.set(0, angle, Math.sin(angle) * tilt);
        add(edge);
      }

      // Horizontal banding — lighter green wavy stripes across the leaf
      const bands = 2 + Math.floor(Math.random() * 2);
      for (let bi = 0; bi < bands; bi++) {
        const bandY = lH * (0.25 + (bi / bands) * 0.5);
        const bandW = lW * (0.6 - bi * 0.05);
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(bandW, 0.008 * s, lD + 0.003),
          snakeLight
        );
        band.position.set(lx, baseY + bandY, lz);
        band.rotation.set(0, angle, Math.sin(angle) * tilt);
        add(band);
      }

      // Pointed tip
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(lW * 0.2, 0.035 * s, 4),
        snakeDark
      );
      tip.position.set(lx, baseY + lH + 0.014 * s, lz);
      tip.rotation.set(0, angle, Math.sin(angle) * tilt);
      add(tip);
    }
  };

  const mixedFns = [addSucculent, addFern, addGrass];
  const cols = 8, rows = 6;
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellW = (W - 0.08) / cols;
      const cellD = (D - 0.08) / rows;
      const px = (col + 0.5) * cellW - (W - 0.08) / 2 + (Math.random() - 0.5) * cellW * 0.7;
      const pz = (row + 0.5) * cellD - (D - 0.08) / 2 + (Math.random() - 0.5) * cellD * 0.7;

      if (style === 'mixed') {
        mixedFns[idx % 3](px, pz, idx);
      } else if (style === 'succulents') {
        addSucculent(px, pz);
      } else if (style === 'ferns') {
        addFern(px, pz, idx);
      } else {
        addGrass(px, pz);
      }
      idx++;
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

    // ── Cork Bark: horizontal wall-mounted piece, side flush against wall ──
    case ItemType.CORK_BARK: {
      const barkMat  = new THREE.MeshLambertMaterial({ color: 0x795548 });
      const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const bW = 1.0, bH = 0.12, bD = 0.55;
      const bark = new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), barkMat);
      bark.position.set(0, bH / 2, bD / 2);
      group.add(bark);
      for (let i = -4; i <= 4; i++) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.03, 0.055), ridgeMat);
        ridge.position.set(0, bH + 0.005, bD / 2 + i * 0.06);
        group.add(ridge);
      }
      group.userData.wallMounted = true;
      group.userData.barkWidth = bW;
      group.userData.barkDepth = bD;
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
      tray.userData.noRecolor = true;
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
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.30, 0),
        new THREE.MeshLambertMaterial({ color: 0x78909c }));
      stone.scale.set(1, 0.7, 0.9);
      stone.position.y = 0.05;
      stone.rotation.y = Math.random() * Math.PI;
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0),
        new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
      pebble.scale.set(1, 0.6, 0.85);
      pebble.position.set(0.28, 0.02, 0.12);
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
      const grassMats = [
        new THREE.MeshLambertMaterial({ color: 0x3d8b2f, side: THREE.DoubleSide }),
        new THREE.MeshLambertMaterial({ color: 0x2e7a22, side: THREE.DoubleSide }),
        new THREE.MeshLambertMaterial({ color: 0x4a9e35, side: THREE.DoubleSide }),
        new THREE.MeshLambertMaterial({ color: 0x357a28, side: THREE.DoubleSide }),
      ];
      const clumpR = 0.22;
      const bladeCount = 45;
      for (let i = 0; i < bladeCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * clumpR;
        const bx = Math.cos(angle) * dist;
        const bz = Math.sin(angle) * dist;
        const h = 0.12 + Math.random() * 0.16;
        const w = 0.012 + Math.random() * 0.008;

        const geo = new THREE.PlaneGeometry(w, h);
        // Taper top vertices inward
        const pos = geo.attributes.position;
        for (let vi = 0; vi < pos.count; vi++) {
          if (pos.getY(vi) > 0) {
            pos.setX(vi, pos.getX(vi) * 0.15);
          }
        }
        pos.needsUpdate = true;

        const blade = new THREE.Mesh(geo, grassMats[i % grassMats.length]);
        blade.position.set(bx, h / 2, bz);
        // Face random direction, lean outward slightly
        const faceAngle = Math.random() * Math.PI * 2;
        const lean = 0.1 + (dist / clumpR) * 0.35;
        blade.rotation.set(0, faceAngle, Math.sin(faceAngle + angle) * lean);
        group.add(blade);
      }
      break;
    }
  }

  return group;
}
