import * as THREE from 'three';

export enum ItemType {
  SLEEPING_HIDE   = 'Sleeping Hide',
  WATER_DISH      = 'Water Dish',
  FOOD_BOWL       = 'Food Bowl',
  CLIMBING_BRANCH = 'Climbing Branch',
  CORK_BARK       = 'Cork Bark',
  RAMP            = 'Ramp',
  PLATFORM        = 'Platform',
  STONE           = 'Stone',
  LEAF_DECOR      = 'Leaf Decor',
}

export const ITEM_EMOJIS: Record<ItemType, string> = {
  [ItemType.SLEEPING_HIDE]:   '🏠',
  [ItemType.WATER_DISH]:      '💧',
  [ItemType.FOOD_BOWL]:       '🍽️',
  [ItemType.CLIMBING_BRANCH]: '🪵',
  [ItemType.CORK_BARK]:       '🪨',
  [ItemType.RAMP]:            '📐',
  [ItemType.PLATFORM]:        '⬜',
  [ItemType.STONE]:           '⚫',
  [ItemType.LEAF_DECOR]:      '🌿',
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
  [ItemType.CLIMBING_BRANCH]: { radius: 0.20, height: 0.18, climbable: true  },
  [ItemType.CORK_BARK]:       { radius: 0.38, height: 0.12, climbable: true  },
  [ItemType.RAMP]:            { radius: 0.42, height: 0.30, climbable: true  },
  [ItemType.PLATFORM]:        { radius: 0.58, height: 0.30, climbable: true  },
  [ItemType.STONE]:           { radius: 0.26, height: 0,    climbable: false },
  [ItemType.LEAF_DECOR]:      { radius: 0.12, height: 0,    climbable: false },
};

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

// ── Item mesh factory ─────────────────────────────────────────────────────────
export function createItemMesh(type: ItemType): THREE.Group {
  const group = new THREE.Group();
  group.userData.itemType = type;

  switch (type) {

    // ── Sleeping Hide: half hollow cylinder laid on its side ────────────────
    case ItemType.SLEEPING_HIDE: {
      const R    = 0.38;
      const len  = 0.95;
      const wall = 0.045;
      const SEG  = 24;

      const mat  = new THREE.MeshLambertMaterial({ color: 0x8b5e3c, side: THREE.DoubleSide });
      const dark = new THREE.MeshLambertMaterial({ color: 0x5c3820, side: THREE.DoubleSide });

      // Outer curved shell — openEnded to avoid any overlapping faces
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, len, SEG, 1, true, 0, Math.PI),
        mat
      );
      outer.rotation.z = Math.PI / 2;

      // Inner curved shell — hollow cavity
      const inner = new THREE.Mesh(
        new THREE.CylinderGeometry(R - wall, R - wall, len, SEG, 1, true, 0, Math.PI),
        mat
      );
      inner.rotation.z = Math.PI / 2;

      // Back: solid half-disc sealing the closed end (CircleGeometry = flat, no overlap)
      const backDisc = new THREE.Mesh(
        new THREE.CircleGeometry(R, SEG, 0, Math.PI),
        dark
      );
      backDisc.rotation.y = -Math.PI / 2;   // face outward (-X)
      backDisc.position.x = -len / 2;

      // Front: half-ring annulus shows the wall edge but leaves the opening clear
      const frontRing = new THREE.Mesh(
        new THREE.RingGeometry(R - wall, R, SEG, 1, 0, Math.PI),
        dark
      );
      frontRing.rotation.y = Math.PI / 2;   // face outward (+X)
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

    // ── Climbing Branch ─────────────────────────────────────────────────────
    case ItemType.CLIMBING_BRANCH: {
      const logMat  = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.85, 8), logMat);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.12;
      for (const [bx, bz] of [[-0.2, 0.04],[0.1,-0.03],[0.3,0.05]] as [number,number][]) {
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), darkMat);
        knot.position.set(bx, 0.19, bz);
        group.add(knot);
      }
      for (const sx of [-0.32, 0.32]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6), darkMat);
        s.position.set(sx, 0.05, 0);
        group.add(s);
      }
      group.add(log);
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
      const PW = 1.0, PD = 0.8, PH = 0.30;
      const platMat   = new THREE.MeshLambertMaterial({ color: 0x8d6e4a });
      const sideMat   = new THREE.MeshLambertMaterial({ color: 0x6d4e2a });
      const surfaceMat= new THREE.MeshLambertMaterial({ color: 0xa08050 });

      // Main platform body
      const body = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, PD), sideMat);
      body.position.y = PH / 2;

      // Surface top
      const surface = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.025, PD), surfaceMat);
      surface.position.y = PH + 0.012;

      // Surface edge trim
      const trimMat = new THREE.MeshLambertMaterial({ color: 0x7d5e3a });
      for (const [tw, td, tx, tz] of [
        [PW + 0.02, 0.03, 0, -PD/2] as const,
        [PW + 0.02, 0.03, 0,  PD/2] as const,
        [0.03, PD + 0.02, -PW/2, 0] as const,
        [0.03, PD + 0.02,  PW/2, 0] as const,
      ]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.04, td), trimMat);
        trim.position.set(tx, PH + 0.02, tz);
        group.add(trim);
      }

      // Support legs under platform
      const legMat = new THREE.MeshLambertMaterial({ color: 0x5d3e20 });
      for (const [lx, lz] of [[-0.38, -0.3],[-0.38,0.3],[0.38,-0.3],[0.38,0.3]] as [number,number][]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, PH - 0.02, 6), legMat);
        leg.position.set(lx, (PH - 0.02) / 2, lz);
        group.add(leg);
      }

      group.add(body, surface);
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
