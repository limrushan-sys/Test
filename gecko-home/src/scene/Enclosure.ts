import * as THREE from 'three';

export interface EnclosureBounds {
  minX: number; maxX: number;
  minZ: number; maxZ: number;
  maxY: number;
}

export class Enclosure {
  group = new THREE.Group();
  floorMesh!: THREE.Mesh;

  private width: number;
  private depth: number;
  private height: number;
  private wallThickness = 0.08;

  constructor(scene: THREE.Scene, width = 6, depth = 4, height = 2) {
    this.width = width;
    this.depth = depth;
    this.height = height;
    scene.add(this.group);
    this.build();
  }

  get bounds(): EnclosureBounds {
    const hw = this.width / 2 - this.wallThickness;
    const hd = this.depth / 2 - this.wallThickness;
    return { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd, maxY: this.height };
  }

  clampToBounds(pos: THREE.Vector3): THREE.Vector3 {
    const b = this.bounds;
    pos.x = Math.max(b.minX, Math.min(b.maxX, pos.x));
    pos.z = Math.max(b.minZ, Math.min(b.maxZ, pos.z));
    return pos;
  }

  isInBounds(x: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
  }

  resize(width: number, depth: number, height: number) {
    this.width = width;
    this.depth = depth;
    this.height = height;
    this.rebuild();
  }

  private rebuild() {
    while (this.group.children.length) this.group.remove(this.group.children[0]);
    this.build();
  }

  private build() {
    const w = this.width, d = this.depth, h = this.height, t = this.wallThickness;

    // Floor — sand-like material
    const floorGeo = new THREE.BoxGeometry(w, 0.06, d);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0xc8a96e });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.position.y = -0.03;
    this.floorMesh.receiveShadow = true;
    this.floorMesh.name = 'floor';
    this.group.add(this.floorMesh);

    // Grid lines on floor
    const gridHelper = new THREE.GridHelper(Math.max(w, d), Math.max(w, d) * 2, 0xb89a5e, 0xb89a5e);
    gridHelper.position.y = 0.001;
    (gridHelper.material as THREE.Material).opacity = 0.3;
    (gridHelper.material as THREE.Material).transparent = true;
    this.group.add(gridHelper);

    // Wall material — glass-like transparent
    const wallMat = new THREE.MeshLambertMaterial({
      color: 0x88ccee,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    });
    const wallFrameMat = new THREE.MeshLambertMaterial({ color: 0x4a6080 });

    const makeWall = (ww: number, wh: number, wd: number, x: number, y: number, z: number) => {
      // Glass panel
      const geo = new THREE.BoxGeometry(ww, wh, wd);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, y, z);
      this.group.add(mesh);

      // Frame border
      const frameGeo = new THREE.EdgesGeometry(geo);
      const frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0x6688aa, linewidth: 1 }));
      frame.position.set(x, y, z);
      this.group.add(frame);
    };

    // Corner posts
    const postMat = new THREE.MeshLambertMaterial({ color: 0x3a5068 });
    const corners = [[-w/2, w/2], [-d/2, d/2]].reduce<[number,number][]>((acc, _, i, arr) =>
      i === 0 ? arr[0].flatMap(x => arr[1].map(z => [x, z] as [number,number])) : acc, []);
    [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].forEach(([px,pz]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(t*1.5, h, t*1.5), postMat);
      post.position.set(px, h/2, pz);
      post.castShadow = true;
      this.group.add(post);
    });

    // Front & back walls
    makeWall(w - t*3, h, t, 0, h/2, -d/2);
    makeWall(w - t*3, h, t, 0, h/2, d/2);
    // Left & right walls
    makeWall(t, h, d - t*3, -w/2, h/2, 0);
    makeWall(t, h, d - t*3, w/2, h/2, 0);

    // Floor rim
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x3a5068 });
    [
      [w, 0, t, 0, t/2, -d/2],
      [w, 0, t, 0, t/2, d/2],
      [t, 0, d, -w/2, t/2, 0],
      [t, 0, d, w/2, t/2, 0],
    ].forEach(([rw,_,rd,rx,ry,rz]) => {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(rw as number, 0.08, rd as number), rimMat);
      rim.position.set(rx as number, ry as number, rz as number);
      this.group.add(rim);
    });

    // Top rim
    [
      [w, 0.08, t, 0, h, -d/2],
      [w, 0.08, t, 0, h, d/2],
      [t, 0.08, d, -w/2, h, 0],
      [t, 0.08, d, w/2, h, 0],
    ].forEach(([tw,_,td,tx,ty,tz]) => {
      const topRim = new THREE.Mesh(new THREE.BoxGeometry(tw as number, 0.08, td as number), wallFrameMat);
      topRim.position.set(tx as number, ty as number, tz as number);
      this.group.add(topRim);
    });
  }
}
