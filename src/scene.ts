import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, SPONSOR_SLOTS, SPONSOR_TIERS, type ShapeType } from './config';
import { FLOOR_HEIGHT, GROUND_Y, ROOMS, ROOM_D, ROOM_W, type RoomDef } from './rooms';
import { store } from './store';
import {
  makeAvatarLabel, makeGridTexture, makeLogoTexture, makeMatchingTexture, makeSkyTexture, makeTextSprite,
} from './art';

export type ToolMode = 'build' | 'challenge';

export interface SceneHandlers {
  onPlace: (roomId: number, cellX: number, cellZ: number) => void;
  onSelectShape: (shapeId: string) => void;
  onSponsorSlot: (slotId: string, isFree: boolean) => void;
  onToast: (key: string, vars?: Record<string, string | number>) => void;
  onFps: (fps: number, low: boolean) => void;
  onFallback: (reason: string) => void;
  onEnterChange: (inside: boolean) => void;
  onRoomChange: (roomId: number) => void;
  onHint: (hint: 'enter' | 'outside' | 'challenge' | 'build') => void;
}

const SHAPE_SIZE: Record<ShapeType, number> = {
  cube: 0.86, prism: 0.86, pyramid: 0.9, cylinder: 0.8,
  sphere: 0.82, stairs: 0.9, cone: 0.86, arch: 0.9,
};

function makeShapeGeometry(type: ShapeType): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (type) {
    case 'cube': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'prism': g = new THREE.CylinderGeometry(0.58, 0.58, 1, 6); break;
    case 'pyramid': g = new THREE.ConeGeometry(0.72, 1, 4); break;
    case 'cylinder': g = new THREE.CylinderGeometry(0.46, 0.46, 1, 14); break;
    case 'sphere': g = new THREE.SphereGeometry(0.5, 12, 10); break;
    case 'stairs': {
      const a = new THREE.BoxGeometry(1, 0.34, 0.34); a.translate(0, 0.17, -0.33);
      const b = new THREE.BoxGeometry(1, 0.34, 0.34); b.translate(0, 0.51, 0);
      const c = new THREE.BoxGeometry(1, 0.34, 0.34); c.translate(0, 0.84, 0.33);
      g = mergeGeometries([a, b, c]) ?? a;
      break;
    }
    case 'cone': g = new THREE.ConeGeometry(0.54, 1, 14); break;
    case 'arch': {
      const t = new THREE.TorusGeometry(0.4, 0.15, 6, 18, Math.PI);
      t.rotateZ(Math.PI);
      g = t;
      break;
    }
  }
  g.computeBoundingBox();
  const bb = g.boundingBox;
  if (bb) g.translate(0, -bb.min.y, 0);
  g.computeVertexNormals();
  return g;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
    const sprite = obj as THREE.Sprite;
    if (sprite.material?.map) sprite.material.map.dispose();
  });
}

export class World {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private handlers: SceneHandlers;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private raf = 0;
  private disposed = false;
  private paused = false;
  inside = false;
  tool: ToolMode = 'build';
  selectedType: ShapeType = 'cube';
  selectedColor: string = PALETTE[2];
  private activeFloor = 0;

  private avatars = new THREE.Group();
  private avatarLabel!: THREE.Sprite;
  private floorGroups: THREE.Group[] = [];
  private frontGlass: THREE.Mesh[] = [];
  private roof = new THREE.Group();
  private doorParts: THREE.Object3D[] = [];
  private facadePanels = new THREE.Group();
  private borderPanels = new THREE.Group();
  private interiorPanels: THREE.Group[] = [];
  private roomFloors: THREE.Mesh[] = [];
  private roomById = new Map<number, RoomDef>();
  private shapeMeshes = new Map<ShapeType, THREE.InstancedMesh>();
  private shapeIds = new Map<ShapeType, string[]>();
  private glowMesh: THREE.InstancedMesh | null = null;
  private ghost!: THREE.Mesh;
  private ghostValid = false;
  private shapesDirty = true;
  private sponsorsDirty = true;
  private matchingGroup = new THREE.Group();
  private matchingArc: THREE.Mesh | null = null;
  private matchingSprite: THREE.Sprite | null = null;
  private matchingProgress = -1;
  private sponsorTextures: THREE.CanvasTexture[] = [];
  private sponsorClickables: THREE.Object3D[] = [];

  private cameraTarget = new THREE.Vector3(0, 3.2, 23);
  private desiredTarget = new THREE.Vector3(0, 3.2, 23);
  private azimuth = -0.52;
  private polar = 1.03;
  private distance = 54;
  private desiredAzimuth = -0.52;
  private desiredPolar = 1.03;
  private desiredDistance = 54;
  private avatarPos = new THREE.Vector3(0, 0, 23);
  private keys = new Set<string>();
  private joyX = 0;
  private joyY = 0;
  private dragging = false;
  private dragMoved = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private downAt = 0;

  private fpsAccum = 0;
  private fpsFrames = 0;
  private lowSamples = 0;
  private dprCap = 2;
  private confetti: THREE.InstancedMesh | null = null;
  private confettiData: Float32Array | null = null;
  private confettiTime = 0;
  private tmpMatrix = new THREE.Matrix4();
  private tmpColor = new THREE.Color();
  private tmpVec = new THREE.Vector3();
  private tmpQuat = new THREE.Quaternion();
  private tmpScale = new THREE.Vector3();
  private matchingTick = 0;
  private resizeHandler: () => void = () => this.resize();
  private unsub: () => void;

  constructor(canvas: HTMLCanvasElement, handlers: SceneHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: (window.devicePixelRatio || 1) < 2.4,
      powerPreference: 'high-performance', preserveDrawingBuffer: true, alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = false;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.2, 260);
    this.camera.position.set(-18, 23, 46);

    for (const r of ROOMS) this.roomById.set(r.id, r);
    this.buildSky();
    this.buildPlot();
    this.buildBuilding();
    this.buildSponsorPanels();
    this.buildMatchingRing();
    this.buildAvatar();
    this.buildShapeMeshes();
    this.buildGhost();
    this.buildConfetti();
    this.scene.add(this.avatars);
    this.applyVisibility();
    this.bind();
    this.resize();
    this.unsub = store.subscribe((event) => {
      if (['world', 'shape', 'challenge', 'defend', 'reclaim', 'init', 'reset', 'contribution', 'boost'].includes(event)) {
        this.shapesDirty = true;
      }
      if (['sponsor', 'init', 'reset'].includes(event)) this.sponsorsDirty = true;
      if (event === 'matching') this.celebrate();
      if (event === 'reset') {
        this.inside = false;
        this.handlers.onEnterChange(false);
        this.applyVisibility();
      }
    });
    this.clock.start();
    this.animate();
  }

  private buildSky(): void {
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0xc8b8a4, 55, 130);
    const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x6f5a46, 2.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
    sun.position.set(-24, 38, 26);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fd0ff, 0.55);
    fill.position.set(22, 18, -20);
    this.scene.add(fill);
    // low-poly cloud banks
    const cloudGeom = new THREE.IcosahedronGeometry(2.4, 0);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff3df, transparent: true, opacity: 0.42 });
    const clouds = new THREE.InstancedMesh(cloudGeom, cloudMat, 16);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.tmpVec.set(Math.cos(a) * (55 + (i % 4) * 12), 34 + (i % 3) * 5, Math.sin(a) * (55 + (i % 5) * 9));
      this.tmpScale.set(1.5 + (i % 4) * 0.55, 0.42, 1);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      clouds.setMatrixAt(i, this.tmpMatrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
    clouds.frustumCulled = true;
    this.scene.add(clouds);
  }

  private buildPlot(): void {
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(60, 0.5, 60),
      new THREE.MeshStandardMaterial({ color: 0x5f7f52, roughness: 0.96, metalness: 0 }),
    );
    ground.position.y = -0.25;
    this.scene.add(ground);
    const landscape = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320),
      new THREE.MeshStandardMaterial({ color: 0x536f49, roughness: 1 }),
    );
    landscape.rotation.x = -Math.PI / 2;
    landscape.position.y = -0.52;
    this.scene.add(landscape);

    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(10.5, 56),
      new THREE.MeshStandardMaterial({ color: 0xb59b78, roughness: 0.92 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.015, 17.6);
    this.scene.add(plaza);

    const path = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.04, 18),
      new THREE.MeshStandardMaterial({ color: 0xc7b291, roughness: 0.9 }),
    );
    path.position.set(0, 0.02, 21);
    this.scene.add(path);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 8.1, 48),
      new THREE.MeshBasicMaterial({ color: 0x3d5b4a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.03, 17.6);
    this.scene.add(ring);

    // border walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d4a45, roughness: 0.8 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8ad7c0, emissive: 0x1f6b58, emissiveIntensity: 0.25 });
    const walls = new THREE.Group();
    const defs: Array<[number, number, number, number]> = [
      [0, -29.7, 60, 0.6], [0, 29.7, 60, 0.6], [-29.7, 0, 0.6, 60], [29.7, 0, 0.6, 60],
    ];
    for (const [x, z, w, d] of defs) {
      const wm = new THREE.Mesh(new THREE.BoxGeometry(w, 0.85, d), wallMat);
      wm.position.set(x, 0.42, z); walls.add(wm);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.08, d + 0.08), capMat);
      cap.position.set(x, 0.88, z); walls.add(cap);
    }
    this.scene.add(walls);

    // trees
    const rng = (() => { let a = 1234567; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const treeCount = 42;
    const trunkGeom = new THREE.CylinderGeometry(0.12, 0.2, 1, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4d33, roughness: 0.95 });
    const pineGeom = new THREE.ConeGeometry(1, 2.6, 7);
    const leafGeom = new THREE.IcosahedronGeometry(1, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeom, trunkMat, treeCount);
    const pineMesh = new THREE.InstancedMesh(pineGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, vertexColors: false }), treeCount);
    const leafMesh = new THREE.InstancedMesh(leafGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }), treeCount);
    const shadowGeom = new THREE.CircleGeometry(1.05, 12);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1d2d22, transparent: true, opacity: 0.18, depthWrite: false });
    const shadowMesh = new THREE.InstancedMesh(shadowGeom, shadowMat, treeCount);
    let n = 0;
    for (let i = 0; i < 120 && n < treeCount; i++) {
      const x = (rng() - 0.5) * 56;
      const z = (rng() - 0.5) * 56;
      if (Math.abs(x) < 15.5 && z > -11 && z < 11) continue;
      if (x * x + (z - 17.6) * (z - 17.6) < 12 * 12) continue;
      if (Math.abs(x) > 28 || Math.abs(z) > 28) continue;
      const s = 0.75 + rng() * 0.85;
      const isPine = rng() > 0.55;
      this.tmpVec.set(x, 0.6 * s, z);
      this.tmpScale.set(s, s, s);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      trunkMesh.setMatrixAt(n, this.tmpMatrix);
      this.tmpVec.set(x, (isPine ? 2.0 : 1.55) * s, z);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      if (isPine) {
        pineMesh.setMatrixAt(n, this.tmpMatrix);
        this.tmpScale.set(0, 0, 0);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        leafMesh.setMatrixAt(n, this.tmpMatrix);
      } else {
        leafMesh.setMatrixAt(n, this.tmpMatrix);
        this.tmpScale.set(0, 0, 0);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        pineMesh.setMatrixAt(n, this.tmpMatrix);
      }
      this.tmpVec.set(x, 0.025, z);
      this.tmpScale.set(s, 1, s);
      this.tmpQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      shadowMesh.setMatrixAt(n, this.tmpMatrix);
      this.tmpQuat.identity();
      this.tmpColor.set(isPine ? 0x2f6f4e : (rng() > 0.5 ? 0x6aa84f : 0x8fbf5f));
      leafMesh.setColorAt(n, this.tmpColor);
      pineMesh.setColorAt(n, this.tmpColor.clone().multiplyScalar(0.86));
      n++;
    }
    for (const m of [trunkMesh, pineMesh, leafMesh, shadowMesh]) {
      m.count = n; m.instanceMatrix.needsUpdate = true; m.frustumCulled = true;
      this.scene.add(m);
    }
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    if (pineMesh.instanceColor) pineMesh.instanceColor.needsUpdate = true;

    // lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x243632, roughness: 0.7 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const x = Math.cos(angle) * 26;
      const z = Math.sin(angle) * 26;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.5, 5), lampMat);
      pole.position.set(x, 1.25, z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), bulbMat);
      bulb.position.set(x, 2.62, z);
      this.scene.add(pole, bulb);
    }

    // benches
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 0.6), benchMat);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.position.set(Math.cos(a) * 13.5, 0.5, 17.6 + Math.sin(a) * 13.5);
      b.rotation.y = -a;
      this.scene.add(b);
    }


  }

  private buildBuilding(): void {
    const facadeMat = new THREE.MeshStandardMaterial({ color: 0xeadbc4, roughness: 0.82, metalness: 0.02 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x1f7f72, roughness: 0.55, metalness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x243a3b, roughness: 0.78 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9ad8df, transparent: true, opacity: 0.20, roughness: 0.12,
      metalness: 0.35, side: THREE.DoubleSide, depthWrite: false,
    });
    const gridTex = makeGridTexture();

    const topY = GROUND_Y + 4 * FLOOR_HEIGHT;
    for (let f = 0; f < 4; f++) {
      const y = GROUND_Y + f * FLOOR_HEIGHT;
      const group = new THREE.Group();
      group.userData.floor = f;
      const geoms: THREE.BufferGeometry[] = [];

      const slab = new THREE.BoxGeometry(25, 0.34, 17);
      slab.translate(0, y - 0.17, 0);
      geoms.push(slab);

      // rear and side walls
      const back = new THREE.BoxGeometry(25, FLOOR_HEIGHT - 0.1, 0.32);
      back.translate(0, y + FLOOR_HEIGHT / 2 - 0.05, -8.15);
      geoms.push(back);
      for (const sx of [-1, 1]) {
        const side = new THREE.BoxGeometry(0.32, FLOOR_HEIGHT - 0.1, 16.2);
        side.translate(sx * 12.15, y + FLOOR_HEIGHT / 2 - 0.05, 0);
        geoms.push(side);
      }
      // front columns
      for (const x of [-12, -6, 0, 6, 12]) {
        const col = new THREE.BoxGeometry(0.38, FLOOR_HEIGHT - 0.1, 0.38);
        col.translate(x, y + FLOOR_HEIGHT / 2 - 0.05, 8.1);
        geoms.push(col);
      }
      // room partitions
      for (const zSign of [-1, 1]) {
        const zLine = zSign * 2.3;
        const corr = new THREE.BoxGeometry(23.2, 0.9, 0.14);
        corr.translate(0, y + 0.45, zLine);
        geoms.push(corr);
      }
      for (const xLine of [-12, -6, 0, 6, 12]) {
        for (const zSign of [-1, 1]) {
          const seg = new THREE.BoxGeometry(0.14, 0.9, 5.2);
          seg.translate(xLine, y + 0.45, zSign * 4.85);
          geoms.push(seg);
        }
      }
      // accent band at slab edge
      const band = new THREE.BoxGeometry(25.3, 0.15, 0.16);
      band.translate(0, y + 0.12, 8.22);
      geoms.push(band);

      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      if (merged) {
        const mesh = new THREE.Mesh(merged, facadeMat);
        mesh.frustumCulled = true;
        group.add(mesh);
      }

      // room floors
      for (const room of ROOMS.filter((r) => r.floor === f)) {
        const mat = new THREE.MeshStandardMaterial({
          map: gridTex, color: f === 0 ? 0x9fc8b8 : (f === 1 ? 0xb6cfc0 : (f === 2 ? 0xd2c7a8 : 0xc8b6c9)),
          roughness: 0.82, metalness: 0.03,
        });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W - 0.5, ROOM_D - 0.5), mat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(room.cx, y + 0.025, room.cz);
        floor.userData.roomId = room.id;
        floor.userData.floor = f;
        floor.receiveShadow = false;
        floor.frustumCulled = true;
        group.add(floor);
        this.roomFloors.push(floor);
      }
      // corridor strip
      const corridorMat = new THREE.MeshStandardMaterial({ color: 0x4c6a68, roughness: 0.7, metalness: 0.1 });
      const corridor = new THREE.Mesh(new THREE.PlaneGeometry(23.2, 3.8), corridorMat);
      corridor.rotation.x = -Math.PI / 2;
      corridor.position.set(0, y + 0.03, 0);
      group.add(corridor);

      // front glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(23.25, FLOOR_HEIGHT - 0.18), glassMat);
      glass.position.set(0, y + FLOOR_HEIGHT / 2 - 0.02, 8.27);
      glass.userData.floor = f;
      glass.frustumCulled = true;
      this.frontGlass.push(glass);
      group.add(glass);

      this.floorGroups.push(group);
      this.scene.add(group);
    }

    // roof
    const roofGeoms: THREE.BufferGeometry[] = [];
    const roofSlab = new THREE.BoxGeometry(25.6, 0.5, 17.6); roofSlab.translate(0, topY + 0.15, 0);
    roofGeoms.push(roofSlab);
    const roofDeck = new THREE.BoxGeometry(21, 0.4, 13); roofDeck.translate(0, topY + 0.55, -0.5);
    roofGeoms.push(roofDeck);
    for (const x of [-9, 9]) {
      const col = new THREE.BoxGeometry(0.5, 2.1, 0.5); col.translate(x, topY + 1.65, -0.6);
      roofGeoms.push(col);
    }
    const canopy = new THREE.BoxGeometry(20, 0.22, 10); canopy.translate(0, topY + 2.75, -0.6);
    roofGeoms.push(canopy);
    const roofMerged = mergeGeometries(roofGeoms, false);
    roofGeoms.forEach((g) => g.dispose());
    if (roofMerged) {
      const rm = new THREE.Mesh(roofMerged, darkMat);
      this.roof.add(rm);
    }
    const solar = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 5), accentMat);
    solar.position.set(-6, topY + 0.84, -2.3);
    solar.rotation.z = -0.1;
    this.roof.add(solar);
    const roofLabel = makeTextSprite('BLOC-CU-BLOC', '#eafff9', 'rgba(10,30,32,0.8)', 56, 640, 140);
    roofLabel.position.set(0, topY + 4.2, 3);
    roofLabel.scale.multiplyScalar(1.45);
    this.roof.add(roofLabel);
    this.scene.add(this.roof);

    // entrance
    const doorFrameMat = new THREE.MeshStandardMaterial({ color: 0x183f3a, roughness: 0.5, metalness: 0.3 });
    for (const x of [-1.55, 1.55]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3, 0.5), doorFrameMat);
      post.position.set(x, 1.5, 8.35);
      this.doorParts.push(post);
      this.scene.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.55), doorFrameMat);
    lintel.position.set(0, 3.0, 8.35);
    this.doorParts.push(lintel);
    this.scene.add(lintel);
    const doorGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.7),
      new THREE.MeshStandardMaterial({ color: 0x5fe0ce, transparent: true, opacity: 0.36, emissive: 0x1c8a7a, emissiveIntensity: 0.8, side: THREE.DoubleSide }),
    );
    doorGlass.position.set(0, 1.42, 8.4);
    doorGlass.userData.enterDoor = true;
    this.doorParts.push(doorGlass);
    this.scene.add(doorGlass);
    const enterLabel = makeTextSprite('INTRĂ', '#052521', '#68f0d2', 60, 320, 120);
    enterLabel.position.set(0, 3.75, 8.55);
    enterLabel.scale.multiplyScalar(1.1);
    this.doorParts.push(enterLabel);
    this.scene.add(enterLabel);

    // exterior signage
    const artLabel = makeTextSprite('ILUSTRAȚIE ARTISTICĂ', '#ffe9c9', 'rgba(30,25,20,0.62)', 38, 520, 100);
    artLabel.position.set(0, 4.7, 8.75);
    artLabel.scale.multiplyScalar(0.72);
    this.scene.add(artLabel);

    // sponsor facade panels are added by buildSponsorPanels
  }

  private buildSponsorPanels(): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x101f24, roughness: 0.6, metalness: 0.3 });
    for (const slot of SPONSOR_SLOTS) {
      const geo = new THREE.PlaneGeometry(slot.kind === 'facade' ? 3.15 : 2.6, slot.kind === 'facade' ? 1.16 : 0.98);
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const panel = new THREE.Mesh(geo, mat);
      panel.userData.slotId = slot.id;
      let parent: THREE.Group;
      if (slot.kind === 'facade') {
        parent = this.facadePanels;
        panel.position.set(slot.x, slot.y, 8.36);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.35, 1.34, 0.07), frameMat);
        frame.position.set(slot.x, slot.y, 8.3);
        parent.add(frame);
      } else if (slot.kind === 'corridor') {
        const f = slot.floor >= 0 ? slot.floor : 0;
        parent = this.interiorPanels[f] ?? (this.interiorPanels[f] = new THREE.Group());
        const y = GROUND_Y + f * FLOOR_HEIGHT + 1.65;
        panel.position.set(slot.x, y, -2.22);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 0.07), frameMat);
        frame.position.set(slot.x, y, -2.27);
        parent.add(frame);
      } else {
        parent = this.borderPanels;
        const rot = slot.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        panel.rotation.y = rot;
        panel.position.set(slot.x, 1.75, slot.z);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.15, 0.07), frameMat);
        frame.rotation.y = rot;
        frame.position.set(slot.x + (slot.x > 0 ? -0.04 : 0.04), 1.75, slot.z);
        parent.add(frame);
      }
      parent.add(panel);
      this.sponsorClickables.push(panel);
    }
    this.scene.add(this.facadePanels, this.borderPanels);
    for (const g of this.interiorPanels) if (g) this.scene.add(g);
    this.refreshSponsors();
  }

  refreshSponsors(): void {
    this.sponsorsDirty = false;
    for (const tex of this.sponsorTextures) tex.dispose();
    this.sponsorTextures = [];
    for (const obj of this.sponsorClickables) {
      const panel = obj as THREE.Mesh;
      const slotId = panel.userData.slotId as string;
      const slot = store.state.sponsorSlots.find((s) => s.slotId === slotId);
      const def = SPONSOR_SLOTS.find((s) => s.id === slotId);
      if (!slot || !def) continue;
      const tierLabel = SPONSOR_TIERS[slot.tier].label;
      const tex = makeLogoTexture(
        slot.sponsor ?? 'SPONSOR', slot.sponsor ? '#5fe0ce' : '#e9c98d',
        tierLabel, slot.sponsor ? null : def.price, !!slot.sponsor,
      );
      this.sponsorTextures.push(tex);
      const mat = panel.material as THREE.MeshBasicMaterial;
      mat.map = tex;
      mat.needsUpdate = true;
      panel.userData.free = !slot.sponsor;
    }
  }

  private buildMatchingRing(): void {
    const base = new THREE.Mesh(
      new THREE.TorusGeometry(3.7, 0.26, 8, 64),
      new THREE.MeshStandardMaterial({ color: 0x2c4c4a, roughness: 0.6, metalness: 0.35 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.32;
    this.matchingGroup.add(base);
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(3.45, 48),
      new THREE.MeshBasicMaterial({ color: 0x0b2626, transparent: true, opacity: 0.55 }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.31;
    this.matchingGroup.add(inner);
    // small holographic pillar
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.8, 2.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x2fe2c0, transparent: true, opacity: 0.32, emissive: 0x1e8d79, emissiveIntensity: 1.2, roughness: 0.2 }),
    );
    pillar.position.y = 1.55;
    this.matchingGroup.add(pillar);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeMatchingTexture(0.65), transparent: true, depthWrite: false }));
    sprite.scale.set(3.0, 3.0, 1);
    sprite.position.set(0, 4.3, 0);
    this.matchingSprite = sprite;
    this.matchingGroup.add(sprite);
    this.matchingGroup.position.set(0, 0, 17.6);
    this.scene.add(this.matchingGroup);
    this.updateMatching(true);
  }

  private buildAvatar(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a7fdb, roughness: 0.5, metalness: 0.1 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.8 });
    const packMat = new THREE.MeshStandardMaterial({ color: 0xffb84d, roughness: 0.65 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 1.05, 8), bodyMat);
    body.position.y = 0.85;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 12, 10), headMat);
    head.position.y = 1.62;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.28), packMat);
    pack.position.set(0, 1.0, 0.34);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.28, 8), new THREE.MeshStandardMaterial({ color: 0x1e3a5f }));
    cap.position.y = 1.9;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      new THREE.MeshBasicMaterial({ color: 0x1d2d22, transparent: true, opacity: 0.24, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.avatarLabel = makeAvatarLabel(store.state.player?.nickname ?? 'Tu');
    this.avatarLabel.position.y = 2.55;
    this.avatarLabel.scale.set(2.4, 0.48, 1);
    this.avatars.add(body, head, pack, cap, shadow, this.avatarLabel);
    this.avatars.position.copy(this.avatarPos);
    this.avatarLabel.visible = true;
  }

  private buildShapeMeshes(): void {
    for (const type of Object.keys(SHAPE_SIZE) as ShapeType[]) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.52, metalness: 0.06, vertexColors: false,
      });
      const mesh = new THREE.InstancedMesh(makeShapeGeometry(type), material, 380);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.name = 'shapes_' + type;
      mesh.userData.shapeType = type;
      mesh.frustumCulled = true;
      this.scene.add(mesh);
      this.shapeMeshes.set(type, mesh);
      this.shapeIds.set(type, []);
    }
    const glowGeom = new THREE.SphereGeometry(0.12, 8, 6);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0.9, depthWrite: false });
    this.glowMesh = new THREE.InstancedMesh(glowGeom, glowMat, 120);
    this.glowMesh.count = 0;
    this.glowMesh.frustumCulled = false;
    this.scene.add(this.glowMesh);
  }

  private buildGhost(): void {
    const geom = makeShapeGeometry(this.selectedType);
    const mat = new THREE.MeshBasicMaterial({ color: 0x52ffa8, transparent: true, opacity: 0.42, depthWrite: false });
    this.ghost = new THREE.Mesh(geom, mat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 10;
    this.scene.add(this.ghost);
  }

  private buildConfetti(): void {
    const count = 96;
    const geom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(geom, mat, count);
    this.confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.confettiData = new Float32Array(count * 7);
    this.scene.add(this.confetti);
  }

  celebrate(): void {
    if (!this.confetti || !this.confettiData) return;
    const count = 96;
    const colors = [0x5fe0ce, 0xffd166, 0xfb7185, 0xa78bfa, 0x7dffc4];
    for (let i = 0; i < count; i++) {
      const o = i * 7;
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 8;
      this.confettiData[o] = (Math.random() - 0.5) * 5;
      this.confettiData[o + 1] = 3 + Math.random() * 5;
      this.confettiData[o + 2] = 0;
      this.confettiData[o + 3] = Math.cos(a) * sp;
      this.confettiData[o + 4] = 5 + Math.random() * 8;
      this.confettiData[o + 5] = Math.sin(a) * sp;
      this.confettiData[o + 6] = Math.random();
      this.tmpColor.setHex(colors[i % colors.length]);
      this.confetti.setColorAt(i, this.tmpColor);
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
    this.confetti.count = count;
    this.confettiTime = 6;
    this.confetti.position.set(0, 0, 17.6);
  }

  private refreshShapes(): void {
    this.shapesDirty = false;
    const counts = new Map<ShapeType, number>();
    const ids = new Map<ShapeType, string[]>();
    for (const type of this.shapeMeshes.keys()) { counts.set(type, 0); ids.set(type, []); }
    let glowCount = 0;
    for (const shape of store.state.shapes) {
      const room = this.roomById.get(shape.roomId);
      const mesh = this.shapeMeshes.get(shape.type);
      if (!room || !mesh) continue;
      const count = counts.get(shape.type) ?? 0;
      if (count >= 380) continue;
      const size = SHAPE_SIZE[shape.type];
      this.tmpVec.set(room.cx + shape.cellX, room.y + 0.045, room.cz + shape.cellZ);
      this.tmpScale.set(size, size, size);
      this.tmpQuat.identity();
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      mesh.setMatrixAt(count, this.tmpMatrix);
      this.tmpColor.set(shape.color);
      mesh.setColorAt(count, this.tmpColor);
      ids.get(shape.type)?.push(shape.id);
      counts.set(shape.type, count + 1);
      if (shape.ownerId === 'me' && this.glowMesh && glowCount < 120) {
        this.tmpVec.y = room.y + size + 0.28;
        this.tmpScale.set(1, 1, 1);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        this.glowMesh.setMatrixAt(glowCount, this.tmpMatrix);
        glowCount++;
      }
    }
    for (const [type, mesh] of this.shapeMeshes) {
      const count = counts.get(type) ?? 0;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.shapeIds.set(type, ids.get(type) ?? []);
    }
    if (this.glowMesh) {
      this.glowMesh.count = glowCount;
      this.glowMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.avatarLabel && store.state.player) {
      const labelName = store.state.player.nickname;
      // only rebuild the texture when the name actually changed
      if (this.avatarLabel.userData.name !== labelName) {
        this.avatarLabel.userData.name = labelName;
        const old = this.avatarLabel.material.map;
        const next = makeAvatarLabel(labelName);
        this.avatarLabel.material.map = next.material.map ?? null;
        this.avatarLabel.material.needsUpdate = true;
        old?.dispose();
      }
    }
  }

  private updateMatching(force = false): void {
    const m = store.matching();
    if (!force && Math.abs(m.progress - this.matchingProgress) < 0.0015) return;
    this.matchingProgress = m.progress;
    if (this.matchingArc) {
      this.matchingGroup.remove(this.matchingArc);
      this.matchingArc.geometry.dispose();
      (this.matchingArc.material as THREE.Material).dispose();
      this.matchingArc = null;
    }
    if (m.progress > 0.002) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(3.7, 0.3, 8, 64, Math.PI * 2 * m.progress),
        new THREE.MeshBasicMaterial({ color: m.unlocked ? 0x7dffc4 : 0x53e0c1, toneMapped: false }),
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.y = 0.34;
      this.matchingArc = arc;
      this.matchingGroup.add(arc);
    }
    if (this.matchingSprite) {
      const old = this.matchingSprite.material.map;
      this.matchingSprite.material.map = makeMatchingTexture(m.progress);
      this.matchingSprite.material.needsUpdate = true;
      old?.dispose();
    }
  }

  private applyVisibility(): void {
    for (let f = 0; f < 4; f++) {
      const show = !this.inside || f === this.activeFloor;
      this.floorGroups[f].visible = show;
      if (this.frontGlass[f]) this.frontGlass[f].visible = !this.inside;
      if (this.interiorPanels[f]) this.interiorPanels[f].visible = this.inside && f === this.activeFloor;
    }
    this.roof.visible = !this.inside;
    this.facadePanels.visible = !this.inside;
    this.borderPanels.visible = !this.inside;
    this.avatars.visible = !this.inside;
    this.matchingGroup.visible = !this.inside;
    for (const part of this.doorParts) part.visible = !this.inside;
    this.ghost.visible = false;
    if (this.matchingSprite) this.matchingSprite.visible = true;
  }

  setTool(tool: ToolMode): void {
    this.tool = tool;
    if (tool === 'challenge') this.ghost.visible = false;
  }

  setSelectedType(type: ShapeType): void {
    this.selectedType = type;
    const old = this.ghost.geometry;
    this.ghost.geometry = makeShapeGeometry(type);
    old.dispose();
    this.ghost.visible = false;
  }

  setSelectedColor(color: string): void {
    this.selectedColor = color;
  }

  private outsideDistance(): number {
    return this.camera.aspect < 0.8 ? 64 : 46;
  }

  enter(): void {
    if (this.inside) return;
    this.inside = true;
    this.activeFloor = store.state.activeFloor;
    this.desiredAzimuth = 0;
    this.desiredPolar = 0.88;
    this.desiredDistance = this.camera.aspect < 0.8 ? 47 : 32;
    this.applyVisibility();
    this.handlers.onEnterChange(true);
  }

  exit(): void {
    if (!this.inside) return;
    this.inside = false;
    this.desiredAzimuth = -0.52;
    this.desiredPolar = 1.03;
    this.desiredDistance = this.outsideDistance();
    this.applyVisibility();
    this.handlers.onEnterChange(false);
  }

  setFloor(floor: number): void {
    this.activeFloor = Math.max(0, Math.min(3, floor));
    this.desiredDistance = this.camera.aspect < 0.8 ? 47 : 32;
    this.desiredTarget.set(0, GROUND_Y + this.activeFloor * FLOOR_HEIGHT + 1.35, 0);
    this.applyVisibility();
  }

  setJoystick(x: number, y: number): void {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
  }

  setQuality(q: 'auto' | 'high' | 'low'): void {
    if (q === 'high') { this.dprCap = 2; }
    else if (q === 'low') { this.dprCap = 1; }
    else { this.dprCap = Math.min(window.devicePixelRatio || 1, 2); }
    this.lowSamples = 0;
    this.applyPixelRatio();
  }

  private applyPixelRatio(): void {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap, 2));
    this.resize();
  }

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.resizeHandler);
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      if (!document.hidden) { this.clock.getDelta(); }
    });
    this.qualityHandler = () => this.setQuality(store.state.settings.quality);
    store.subscribe((e) => { if (e === 'quality') this.qualityHandler?.(); });
  }

  private qualityHandler: (() => void) | null = null;

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragging = true;
      this.dragMoved = 0;
      this.downAt = performance.now();
      if (this.tool === 'build' && this.inside) this.updateGhost(e.clientX, e.clientY);
    } else if (this.pointers.size === 2) {
      this.dragging = false;
      this.dragMoved = 100;
      const pts = [...this.pointers.values()];
      this.pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (prev) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1 && this.dragging) {
        this.dragMoved += Math.abs(dx) + Math.abs(dy);
        this.desiredAzimuth -= dx * 0.0062;
        this.desiredPolar = THREE.MathUtils.clamp(this.desiredPolar - dy * 0.0048, 0.3, 1.32);
      } else if (this.pointers.size === 2) {
        const pts = [...this.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (this.pinchDist > 0) {
          const delta = dist - this.pinchDist;
          this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance - delta * 0.09, 12, 72);
        }
        this.pinchDist = dist;
        this.dragMoved = 100;
      }
    }
    if (e.pointerType === 'mouse' && this.tool === 'build' && this.inside) {
      this.updateGhost(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const wasLast = this.pointers.size <= 1;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchDist = 0;
    if (wasLast && this.dragging && this.dragMoved < 10 && performance.now() - this.downAt < 700) {
      this.handleTap(e.clientX, e.clientY);
    }
    if (this.pointers.size === 0) this.dragging = false;
  };

  private onPointerLeave = (): void => {
    if (this.tool === 'build') this.ghost.visible = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance + e.deltaY * 0.035, 12, 72);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
      this.keys.add(e.key.toLowerCase());
      if (e.key.startsWith('Arrow')) e.preventDefault();
    }
    if (e.key === 'Escape' && this.inside) this.exit();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private updateGhost(clientX: number, clientY: number): void {
    if (!this.inside || this.tool !== 'build') { this.ghost.visible = false; return; }
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.roomFloors, false);
    const hit = hits.find((h) => (h.object.userData.floor as number) === this.activeFloor);
    if (!hit) { this.ghost.visible = false; return; }
    const room = this.roomById.get(hit.object.userData.roomId as number);
    if (!room) { this.ghost.visible = false; return; }
    const cellX = THREE.MathUtils.clamp(Math.round(hit.point.x - room.cx), -2, 2);
    const cellZ = THREE.MathUtils.clamp(Math.round(hit.point.z - room.cz), -2, 2);
    const occupied = store.state.shapes.some(
      (s) => s.roomId === room.id && s.cellX === cellX && s.cellZ === cellZ,
    );
    const allowed = !!store.state.player && store.shapesRemaining() > 0;
    this.ghostValid = !occupied && allowed;
    this.ghost.position.set(room.cx + cellX, room.y + 0.045, room.cz + cellZ);
    this.ghost.visible = true;
    const mat = this.ghost.material as THREE.MeshBasicMaterial;
    mat.color.setHex(this.ghostValid ? 0x52ffa8 : 0xff5c68);
    mat.opacity = this.ghostValid ? 0.42 : 0.34;
    if (store.state.activeRoom !== room.id) {
      store.setActiveRoom(room.id);
      this.handlers.onRoomChange(room.id);
    }
  }

  private handleTap(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    if (!this.inside) {
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      for (const h of hits) {
        const slotId = h.object.userData.slotId as string | undefined;
        if (slotId) {
          const slot = store.state.sponsorSlots.find((s) => s.slotId === slotId);
          this.handlers.onSponsorSlot(slotId, !slot?.sponsor);
          return;
        }
        if (h.object.userData.enterDoor) { this.enter(); return; }
        if (h.distance > 40) break;
      }
      this.handlers.onHint('enter');
      return;
    }

    const sponsorHits = this.raycaster.intersectObjects(this.sponsorClickables, false);
    if (sponsorHits.length) {
      const slotId = sponsorHits[0].object.userData.slotId as string | undefined;
      if (slotId) {
        const slot = store.state.sponsorSlots.find((s) => s.slotId === slotId);
        this.handlers.onSponsorSlot(slotId, !slot?.sponsor);
        return;
      }
    }

    if (this.tool === 'challenge') {
      const meshes = [...this.shapeMeshes.values()].filter((m) => m.count > 0);
      const hits = this.raycaster.intersectObjects(meshes, false);
      if (hits.length) {
        const hit = hits[0];
        const type = hit.object.userData.shapeType as ShapeType;
        const ids = this.shapeIds.get(type);
        if (ids && hit.instanceId !== undefined && ids[hit.instanceId]) {
          this.handlers.onSelectShape(ids[hit.instanceId]);
          return;
        }
      }
      this.handlers.onHint('challenge');
      return;
    }

    const floorHits = this.raycaster.intersectObjects(this.roomFloors, false);
    const hit = floorHits.find((h) => (h.object.userData.floor as number) === this.activeFloor);
    if (!hit) { this.handlers.onHint('outside'); return; }
    const room = this.roomById.get(hit.object.userData.roomId as number);
    if (!room) { this.handlers.onHint('outside'); return; }
    const cellX = THREE.MathUtils.clamp(Math.round(hit.point.x - room.cx), -2, 2);
    const cellZ = THREE.MathUtils.clamp(Math.round(hit.point.z - room.cz), -2, 2);
    store.setActiveRoom(room.id);
    this.handlers.onRoomChange(room.id);
    this.ghost.position.set(room.cx + cellX, room.y + 0.045, room.cz + cellZ);
    this.ghost.visible = true;
    this.handlers.onPlace(room.id, cellX, cellZ);
  }

  private updateMovement(dt: number): void {
    if (this.inside) return;
    let forward = (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0)
      - (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) + this.joyY;
    let right = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0)
      - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0) + this.joyX;
    const len = Math.hypot(forward, right);
    if (len > 1) { forward /= len; right /= len; }
    if (Math.abs(forward) + Math.abs(right) < 0.01) return;
    const speed = 7.5;
    const sin = Math.sin(this.azimuth);
    const cos = Math.cos(this.azimuth);
    const dx = (-sin * forward + cos * right) * speed * dt;
    const dz = (-cos * forward - sin * right) * speed * dt;
    let nx = THREE.MathUtils.clamp(this.avatarPos.x + dx, -28, 28);
    let nz = THREE.MathUtils.clamp(this.avatarPos.z + dz, -28, 28);
    if (Math.abs(nx) < 13.2 && Math.abs(nz) < 9.2) {
      // sliding around the building footprint
      if (Math.abs(this.avatarPos.z) >= 9.2) nz = this.avatarPos.z + Math.sign(nz - this.avatarPos.z) * Math.abs(dz);
      else if (Math.abs(this.avatarPos.x) >= 13.2) nx = this.avatarPos.x + Math.sign(nx - this.avatarPos.x) * Math.abs(dx);
      else { nx = this.avatarPos.x; nz = this.avatarPos.z; }
      if (Math.abs(nx) < 13.2 && Math.abs(nz) < 9.2) { nx = this.avatarPos.x; nz = this.avatarPos.z; }
    }
    this.avatarPos.set(nx, 0, nz);
    this.avatars.position.copy(this.avatarPos);
    this.avatars.rotation.y = Math.atan2(dx, dz);
  }

  private updateCamera(dt: number): void {
    if (this.inside) {
      this.desiredTarget.set(0, GROUND_Y + this.activeFloor * FLOOR_HEIGHT + 1.35, 0);
    } else {
      this.desiredTarget.set(this.avatarPos.x * 0.72, 3.4, this.avatarPos.z * 0.5 + 4);
    }
    this.desiredPolar = THREE.MathUtils.clamp(this.desiredPolar, 0.3, 1.32);
    this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance, 12, 72);
    const k = 1 - Math.exp(-7 * dt);
    this.cameraTarget.lerp(this.desiredTarget, k);
    this.azimuth += (this.desiredAzimuth - this.azimuth) * k;
    this.polar += (this.desiredPolar - this.polar) * k;
    this.distance += (this.desiredDistance - this.distance) * k;
    const sinP = Math.sin(this.polar);
    const px = this.cameraTarget.x + this.distance * sinP * Math.sin(this.azimuth);
    const py = this.cameraTarget.y + this.distance * Math.cos(this.polar);
    const pz = this.cameraTarget.z + this.distance * sinP * Math.cos(this.azimuth);
    this.camera.position.set(px, Math.max(1.1, py), pz);
    this.camera.lookAt(this.cameraTarget);
  }

  private updateConfetti(dt: number): void {
    if (!this.confetti || !this.confettiData || this.confettiTime <= 0) return;
    this.confettiTime -= dt;
    const data = this.confettiData;
    if (this.confettiTime <= 0) { this.confetti.count = 0; return; }
    for (let i = 0; i < 96; i++) {
      const o = i * 7;
      data[o + 4] -= 9.8 * dt;
      data[o] += data[o + 3] * dt;
      data[o + 1] += data[o + 4] * dt;
      data[o + 2] += data[o + 5] * dt;
      this.tmpVec.set(data[o], Math.max(0.2, data[o + 1]), data[o + 2]);
      this.tmpQuat.setFromAxisAngle(this.tmpScale.set(0.7, 0.3, 1).normalize(), (1 - this.confettiTime) * 6 + i);
      this.tmpScale.set(1, 1, 1);
      this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
      this.confetti.setMatrixAt(i, this.tmpMatrix);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    store.tick(Date.now());
    if (this.shapesDirty) this.refreshShapes();
    if (this.sponsorsDirty) this.refreshSponsors();
    this.matchingTick += dt;
    if (this.matchingTick > 0.5) { this.matchingTick = 0; this.updateMatching(); }
    if (!this.paused) {
      this.updateMovement(dt);
      this.updateCamera(dt);
      this.updateConfetti(dt);
      this.renderer.render(this.scene, this.camera);
      this.fpsAccum += dt;
      this.fpsFrames++;
      if (this.fpsAccum >= 2) {
        const fps = this.fpsFrames / this.fpsAccum;
        this.fpsAccum = 0; this.fpsFrames = 0;
        this.handlers.onFps(fps, fps < 40);
        if (store.state.settings.quality === 'auto') {
          if (fps < 45 && this.dprCap > 1) {
            this.dprCap = Math.max(1, this.dprCap - 0.25);
            this.applyPixelRatio();
          }
          if (fps < 30) {
            this.lowSamples++;
            if (this.lowSamples >= 3 && !this.fallbackTriggered) {
              this.fallbackTriggered = true;
              this.handlers.onFallback('fps');
            }
          } else this.lowSamples = 0;
        }
      }
    }
  };

  private fallbackTriggered = false;

  resize(): void {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || window.innerWidth;
    const h = parent?.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.inside) this.desiredDistance = this.outsideDistance();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  capture(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsub();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.resizeHandler);
    disposeObject(this.scene);
    this.renderer.dispose();
  }
}
