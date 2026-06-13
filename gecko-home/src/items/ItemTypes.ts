import * as THREE from 'three';

export enum ItemType {
  SLEEPING_HIDE = 'Sleeping Hide',
  WATER_DISH    = 'Water Dish',
  FOOD_BOWL     = 'Food Bowl',
  CLIMBING_BRANCH = 'Climbing Branch',
  CORK_BARK     = 'Cork Bark',
  RAMP          = 'Ramp',
  STONE         = 'Stone',
  LEAF_DECOR    = 'Leaf Decor',
}

export const ITEM_EMOJIS: Record<ItemType, string> = {
  [ItemType.SLEEPING_HIDE]:   '🏠',
  [ItemType.WATER_DISH]:      '💧',
  [ItemType.FOOD_BOWL]:       '🍽️',
  [ItemType.CLIMBING_BRANCH]: '🪵',
  [ItemType.CORK_BARK]:       '🪨',
  [ItemType.RAMP]:            '📐',
  [ItemType.STONE]:           '⚫',
  [ItemType.LEAF_DECOR]:      '🌿',
};

export function createItemMesh(type: ItemType): THREE.Group {
  const group = new THREE.Group();
  group.userData.itemType = type;

  switch (type) {
    case ItemType.SLEEPING_HIDE: {
      // Hollow arch hide
      const mat = new THREE.MeshLambertMaterial({ color: 0x8B4513, side: THREE.DoubleSide });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x6b3003 });
      // Body arch
      const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.55, 10, 1, true, 0, Math.PI), mat);
      arch.rotation.z = Math.PI / 2;
      arch.position.y = 0.15;
      // Back plate
      const back = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10, 0, Math.PI), darkMat);
      back.rotation.set(0, Math.PI/2, Math.PI/2);
      back.position.set(0.275, 0.15, 0);
      // Floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.03, 0.62), darkMat);
      floor.position.y = 0.015;
      group.add(arch, back, floor);
      break;
    }

    case ItemType.WATER_DISH: {
      const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.22, 0.09, 16),
        new THREE.MeshLambertMaterial({ color: 0x78909c })
      );
      dish.position.y = 0.045;
      const water = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.01, 16),
        new THREE.MeshLambertMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.85 })
      );
      water.position.y = 0.085;
      group.add(dish, water);
      break;
    }

    case ItemType.FOOD_BOWL: {
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.16, 0.11, 12),
        new THREE.MeshLambertMaterial({ color: 0xbf360c })
      );
      bowl.position.y = 0.055;
      // Food morsels
      const foodMat = new THREE.MeshLambertMaterial({ color: 0xffe082 });
      for (let i = 0; i < 5; i++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), foodMat);
        const a = (i / 5) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.09, 0.12, Math.sin(a) * 0.09);
        group.add(f);
      }
      group.add(bowl);
      break;
    }

    case ItemType.CLIMBING_BRANCH: {
      const logMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.85, 8), logMat);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.12;
      // Knot bumps
      for (const [bx, bz] of [[-0.2, 0.04],[0.1,-0.03],[0.3,0.05]]) {
        const knot = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), darkMat);
        knot.position.set(bx, 0.12 + 0.065, bz);
        group.add(knot);
      }
      // Supports
      for (const sx of [-0.32, 0.32]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 6), darkMat);
        s.position.set(sx, 0.05, 0);
        group.add(s);
      }
      group.add(log);
      break;
    }

    case ItemType.CORK_BARK: {
      const barkMat = new THREE.MeshLambertMaterial({ color: 0x795548 });
      const ridgeMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
      const bark = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.09, 0.42), barkMat);
      bark.position.y = 0.045;
      // Ridges for texture
      for (let i = -2; i <= 2; i++) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.025, 0.045), ridgeMat);
        ridge.position.set(0, 0.095, i * 0.075);
        group.add(ridge);
      }
      group.add(bark);
      break;
    }

    case ItemType.RAMP: {
      const rampMat = new THREE.MeshLambertMaterial({ color: 0xd2b48c });
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.65), rampMat);
      ramp.rotation.x = -Math.PI / 7;
      ramp.position.y = 0.11;
      // Grip lines
      const lineMat = new THREE.MeshLambertMaterial({ color: 0xbca07c });
      for (let i = -2; i <= 2; i++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.01, 0.025), lineMat);
        line.rotation.x = ramp.rotation.x;
        line.position.set(0, ramp.position.y + 0.04, i * 0.1);
        group.add(line);
      }
      group.add(ramp);
      break;
    }

    case ItemType.STONE: {
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0x78909c });
      const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
      stone.scale.set(1, 0.55, 0.9);
      stone.position.y = 0.12;
      stone.rotation.y = Math.random() * Math.PI;
      // Small pebble next to it
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0),
        new THREE.MeshLambertMaterial({ color: 0x90a4ae }));
      pebble.scale.set(1, 0.5, 0.85);
      pebble.position.set(0.22, 0.05, 0.1);
      group.add(stone, pebble);
      break;
    }

    case ItemType.LEAF_DECOR: {
      const leafMat = new THREE.MeshLambertMaterial({ color: 0x558b2f, side: THREE.DoubleSide });
      const darkLeaf = new THREE.MeshLambertMaterial({ color: 0x33691e, side: THREE.DoubleSide });
      const stemMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
      // Main leaves
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
