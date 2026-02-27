import {
  AmbientLight,
  AnimationClip,
  AnimationMixer,
  Audio,
  AudioListener,
  BoxGeometry,
  Color,
  DodecahedronGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3
} from "three";
import type { Assets } from "../core/Assets";
import type { Input } from "../core/Input";
import type { IGameState } from "../core/StateMachine";
import type { DialogueLine, UI } from "../ui/UI";
import {
  createHousePlaceholder,
  createKittyPlaceholder,
  createLandscapePlaceholder,
  createNpcGirlPlaceholder
} from "../utils/Placeholders";
import { getBaseTerrainHeight, getHillVisualBaseY, sampleWorldTerrainHeight, WORLD_HILLS } from "../utils/Terrain";

export interface WorldSceneDeps {
  assets: Assets;
  input: Input;
  ui: UI;
  audioListener: AudioListener;
  renderHook: (scene: Scene, camera: PerspectiveCamera, deltaSeconds: number) => void;
  onDialogueFinished: () => void;
  onDialogueGesture: () => void;
}

const MODEL_PATHS = {
  kitty: "/assets/models/kitty.glb",
  worldLandscape: "/assets/models/world_landscape.glb",
  houseA: "/assets/models/custom/zamok/castle.obj",
  houseB: "/assets/models/custom/zamok/castle.obj",
  npcGirl: "/assets/models/custom/masha/masha.obj"
};

const DIALOGUE: DialogueLine[] = [
  { speaker: "Хеллоу Китти", text: "Маша, привет! Я узнала, что у тебя сегодня день рождения! Поздравляю!" },
  { speaker: "Маша", text: "О, хеллоу китти, спасибо! Ты очень крутая!" },
  { speaker: "Хеллоу Китти", text: "Маша, это ты очень крутая! Ты будешь со мной дружить?" },
  { speaker: "Маша", text: "Конечно, Хеллоу Китти! Идем тусить с нами на мое др!" }
];

export class WorldScene implements IGameState {
  private readonly assets: Assets;
  private readonly input: Input;
  private readonly ui: UI;
  private readonly listener: AudioListener;
  private readonly renderHook: WorldSceneDeps["renderHook"];
  private readonly onDialogueFinished: () => void;
  private readonly onDialogueGesture: () => void;

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(60, 16 / 9, 0.1, 200);

  private initialized = false;
  private player: Object3D = new Group();
  private playerVisual: Object3D = new Group();
  private npc: Object3D = new Group();
  private npcMaterials: MeshLambertMaterial[] = [];
  private readonly mixers: AnimationMixer[] = [];
  private readonly riverTiles: Mesh[] = [];
  private riverTime = 0;
  private worldMusic: Audio | null = null;
  private audioUnlocked = false;

  private readonly cameraOffset = new Vector3(0, 3.2, 6.1);
  private readonly lookOffset = new Vector3(0, 1.2, 0);

  private inDialogue = false;
  private dialogueIndex = 0;

  private readonly groundRay = new Raycaster();
  private readonly groundRayOrigin = new Vector3();
  private readonly groundRayDirection = new Vector3(0, -1, 0);
  private readonly groundSurfaces: Object3D[] = [];
  private readonly desiredCamPos = new Vector3();
  private readonly lookAtPos = new Vector3();
  private readonly camForward = new Vector3();
  private readonly camRight = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);

  constructor(deps: WorldSceneDeps) {
    this.assets = deps.assets;
    this.input = deps.input;
    this.ui = deps.ui;
    this.listener = deps.audioListener;
    this.renderHook = deps.renderHook;
    this.onDialogueFinished = deps.onDialogueFinished;
    this.onDialogueGesture = deps.onDialogueGesture;

    this.scene.background = new Color("#f0b4d3");
    this.camera.position.set(0, 3, -6);
  }

  async enter(): Promise<void> {
    if (!this.initialized) {
      await this.buildScene();
      this.initialized = true;
    }

    this.reset();
    this.ui.hideDialogue();
    this.ui.hideHint();

    if (!this.camera.children.includes(this.listener)) {
      this.camera.add(this.listener);
    }
    this.tryStartMusic();
  }

  exit(): void {
    this.ui.hideDialogue();
    this.ui.hideHint();
    if (this.worldMusic?.isPlaying) {
      this.worldMusic.stop();
    }
  }

  update(deltaSeconds: number): void {
    for (const mixer of this.mixers) {
      mixer.update(deltaSeconds);
    }

    if (this.inDialogue) {
      this.handleDialogueInput();
    } else {
      this.handleMovement(deltaSeconds);
      this.handleInteraction();
    }

    this.snapPlayerToGround(deltaSeconds);
    this.updateRiver(deltaSeconds);
    this.updateNpcHighlight();
    this.updateCamera(deltaSeconds);
  }

  render(deltaSeconds: number): void {
    this.renderHook(this.scene, this.camera, deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setAudioUnlocked(value: boolean): void {
    this.audioUnlocked = value;
    this.tryStartMusic();
  }

  private async buildScene(): Promise<void> {
    this.scene.clear();

    const ambient = new AmbientLight(0xffcfe3, 0.92);
    const hemisphere = new HemisphereLight(0xffd7ef, 0xe8a7c8, 0.52);
    const directional = new DirectionalLight(0xfff0fa, 1.2);
    directional.position.set(7, 12, -4);
    this.scene.add(ambient, hemisphere, directional);

    const [kitty, npc, worldLandscape, houseA, houseB] = await Promise.all([
      this.assets.instantiateModel(MODEL_PATHS.kitty, () => createKittyPlaceholder("#fff4be")),
      this.assets.instantiateModel(MODEL_PATHS.npcGirl, () => createNpcGirlPlaceholder()),
      this.assets.instantiateModel(MODEL_PATHS.worldLandscape, () => createLandscapePlaceholder()),
      this.assets.instantiateModel(MODEL_PATHS.houseA, () => createHousePlaceholder(0)),
      this.assets.instantiateModel(MODEL_PATHS.houseB, () => createHousePlaceholder(1))
    ]);

    this.player = kitty.root;
    this.playerVisual = kitty.root;
    const visualYawOffset = Number(this.playerVisual.userData.visualYawOffset ?? 0);
    const groundOffsetY = Number(this.playerVisual.userData.groundOffsetY ?? 0);
    this.playerVisual.rotation.y += visualYawOffset;
    this.playerVisual.position.y += groundOffsetY;

    const playerRoot = new Group();
    playerRoot.add(this.playerVisual);
    this.player = playerRoot;
    this.player.position.set(0, sampleWorldTerrainHeight(0, 8), 8);

    this.npc = npc.root;
    this.npc.position.set(1.6, sampleWorldTerrainHeight(1.6, 3.2) + this.getGroundLift(this.npc), 3.2);
    const roadFocus = new Vector3(0, this.npc.position.y, 4.6);
    this.npc.lookAt(roadFocus);
    this.npc.rotateY(Math.PI);

    worldLandscape.root.position.set(0, 0, 0);
    worldLandscape.root.scale.setScalar(1.35);

    const houseTemplates = [houseA.root, houseB.root];
    const houseLayout = [
      { x: 4.5, z: -3.6, rot: 0.1, variant: 0, scale: 3.4 },
      { x: -4.2, z: -5.0, rot: -0.25, variant: 1, scale: 3.8 },
      { x: 9.4, z: -8.4, rot: 0.35, variant: 1, scale: 4.1 },
      { x: -10.2, z: -9.2, rot: -0.35, variant: 0, scale: 3.6 },
      { x: 12.5, z: -0.9, rot: -0.2, variant: 0, scale: 4.5 },
      { x: -13.4, z: -1.6, rot: 0.25, variant: 1, scale: 3.9 },
      { x: 15.1, z: 6.5, rot: 0.4, variant: 0, scale: 4.8 },
      { x: -15.0, z: 5.6, rot: -0.45, variant: 1, scale: 4.2 },
      { x: 7.8, z: -16.5, rot: 0.18, variant: 0, scale: 3.7 },
      { x: -8.1, z: -17.4, rot: -0.22, variant: 1, scale: 4.4 },
      { x: 2.6, z: -22.2, rot: 0.15, variant: 1, scale: 4.9 },
      { x: -3.6, z: -23.0, rot: -0.18, variant: 0, scale: 4.0 }
    ];

    const houses: Object3D[] = [];
    for (const slot of houseLayout) {
      const template = houseTemplates[slot.variant % houseTemplates.length];
      const house = template.clone(true);
      house.scale.setScalar(slot.scale);
      house.position.set(slot.x, sampleWorldTerrainHeight(slot.x, slot.z) + this.getGroundLift(house), slot.z);
      house.rotation.y = slot.rot;
      houses.push(house);
    }

    this.scene.add(worldLandscape.root, ...houses, this.npc, this.player);

    this.groundSurfaces.length = 0;
    this.groundSurfaces.push(worldLandscape.root);
    const roadTiles = this.buildRoad();
    const hills = this.buildHills();
    this.buildRiver();
    this.groundSurfaces.push(...roadTiles, ...hills);

    this.snapPlayerToGround(1);
    this.collectNpcMaterials();

    this.setupAnimation(this.playerVisual, kitty.clips);
    this.setupAnimation(npc.root, npc.clips);
    await this.setupMusic();
  }

  private buildRoad(): Object3D[] {
    const roadTiles: Object3D[] = [];
    const roadMat = new MeshLambertMaterial({ color: "#74686a", flatShading: true });
    for (let i = 0; i < 16; i += 1) {
      const tile = new Mesh(new BoxGeometry(1.7, 0.03, 2.1), roadMat);
      const tileX = 0.5 * Math.sin(i * 0.48);
      const tileZ = 9.5 - i * 2.15;
      tile.position.set(tileX, sampleWorldTerrainHeight(tileX, tileZ) + 0.02, tileZ);
      this.scene.add(tile);
      roadTiles.push(tile);
    }
    return roadTiles;
  }

  private buildHills(): Object3D[] {
    const hills: Object3D[] = [];
    const hillMat = new MeshLambertMaterial({ color: "#c07ab0", flatShading: true });
    const hillGeo = new DodecahedronGeometry(1, 0);

    for (const hill of WORLD_HILLS) {
      const mound = new Mesh(hillGeo, hillMat);
      mound.position.set(hill.x, getBaseTerrainHeight(hill.x, hill.z) + getHillVisualBaseY(hill.sy), hill.z);
      mound.scale.set(hill.sx, hill.sy, hill.sz);
      mound.rotation.y = (hill.x + hill.z) * 0.03;
      this.scene.add(mound);
      hills.push(mound);
    }
    return hills;
  }

  private buildRiver(): void {
    this.riverTiles.length = 0;

    const waterMat = new MeshBasicMaterial({
      color: "#6bb2ff",
      transparent: true,
      opacity: 0.76
    });
    const bankMat = new MeshLambertMaterial({ color: "#9e6d7e", flatShading: true });

    for (let i = 0; i < 17; i += 1) {
      const riverX = -18.4 + Math.sin(i * 0.62) * 1.1;
      const riverZ = 12.5 - i * 2.25;
      const baseY = sampleWorldTerrainHeight(riverX, riverZ);

      const water = new Mesh(new PlaneGeometry(2.6, 2.3, 1, 1), waterMat);
      water.rotation.x = -Math.PI * 0.5;
      water.rotation.y = Math.sin(i * 0.75) * 0.28;
      water.position.set(riverX, baseY + 0.045, riverZ);
      water.userData.baseY = water.position.y;
      water.userData.baseRotY = water.rotation.y;
      this.scene.add(water);
      this.riverTiles.push(water);

      const bankLeft = new Mesh(new BoxGeometry(0.22, 0.11, 2.34), bankMat);
      bankLeft.position.set(riverX - 1.42, baseY + 0.07, riverZ);
      this.scene.add(bankLeft);

      const bankRight = new Mesh(new BoxGeometry(0.22, 0.11, 2.34), bankMat);
      bankRight.position.set(riverX + 1.42, baseY + 0.07, riverZ);
      this.scene.add(bankRight);
    }
  }

  private collectNpcMaterials(): void {
    this.npcMaterials = [];
    this.npc.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh || !mesh.material) {
        return;
      }

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => {
          if (mat instanceof MeshLambertMaterial) {
            this.npcMaterials.push(mat);
          }
        });
      } else if (mesh.material instanceof MeshLambertMaterial) {
        this.npcMaterials.push(mesh.material);
      }
    });
  }

  private setupAnimation(root: Object3D, clips: AnimationClip[]): void {
    if (clips.length === 0) {
      return;
    }

    const mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clips[0]);
    action.play();
    this.mixers.push(mixer);
  }

  private reset(): void {
    this.player.position.set(0, sampleWorldTerrainHeight(0, 8), 8);
    this.player.rotation.y = Math.PI;
    this.inDialogue = false;
    this.dialogueIndex = 0;
    this.snapPlayerToGround(1);

    // Snap camera directly behind character at state start.
    this.computeCameraTargets(this.camera.position, this.lookAtPos);
    this.camera.lookAt(this.lookAtPos);
  }

  private handleMovement(deltaSeconds: number): void {
    const moveInput = this.input.getMovementVector();
    const turnInput = moveInput.x;
    const forwardInput = moveInput.y;

    const turnSpeed = 2.7;
    if (Math.abs(turnInput) > 1e-4) {
      // A/D: rotate only around local Y (tank controls).
      this.player.rotation.y -= turnInput * turnSpeed * deltaSeconds;
      this.player.rotation.y = Math.atan2(Math.sin(this.player.rotation.y), Math.cos(this.player.rotation.y));
    }

    if (Math.abs(forwardInput) > 1e-4) {
      const moveSpeed = forwardInput > 0 ? 4.25 : 3.25;
      // W/S: move relative to character facing ("nose"), not world axes.
      this.player.translateZ(-forwardInput * moveSpeed * deltaSeconds);
    }

    this.player.position.x = MathUtils.clamp(this.player.position.x, -23, 23);
    this.player.position.z = MathUtils.clamp(this.player.position.z, -30, 24);
  }

  private snapPlayerToGround(deltaSeconds: number): void {
    this.groundRayOrigin.set(this.player.position.x, 50, this.player.position.z);
    this.groundRay.set(this.groundRayOrigin, this.groundRayDirection);

    let targetY = sampleWorldTerrainHeight(this.player.position.x, this.player.position.z);
    const intersections = this.groundRay.intersectObjects(this.groundSurfaces, true);
    if (intersections.length > 0) {
      targetY = intersections[0].point.y;
    }

    const snapAmount = 1 - Math.exp(-deltaSeconds * 16);
    this.player.position.y = MathUtils.lerp(this.player.position.y, targetY, snapAmount);
  }

  private getGroundLift(object: Object3D): number {
    return Number(object.userData.groundOffsetY ?? 0) * object.scale.y;
  }

  private updateRiver(deltaSeconds: number): void {
    if (this.riverTiles.length === 0) {
      return;
    }

    this.riverTime += deltaSeconds;
    for (let i = 0; i < this.riverTiles.length; i += 1) {
      const tile = this.riverTiles[i];
      const baseY = Number(tile.userData.baseY ?? tile.position.y);
      const baseRotY = Number(tile.userData.baseRotY ?? tile.rotation.y);
      tile.position.y = baseY + Math.sin(this.riverTime * 1.9 + i * 0.6) * 0.03;
      tile.rotation.y = baseRotY + Math.sin(this.riverTime * 0.75 + i * 0.55) * 0.045;
    }
  }

  private handleInteraction(): void {
    const nearNpc = this.player.position.distanceTo(this.npc.position) < 2.1;

    if (nearNpc) {
      this.ui.showHint("E - talk");
      if (this.input.consumeInteract()) {
        this.onDialogueGesture();
        this.startDialogue();
      }
    } else {
      this.ui.hideHint();
    }
  }

  private updateNpcHighlight(): void {
    const nearNpc = this.player.position.distanceTo(this.npc.position) < 2.1;
    for (const material of this.npcMaterials) {
      material.emissive.setHex(nearNpc ? 0x331122 : 0x000000);
      material.emissiveIntensity = nearNpc ? 0.9 : 0.0;
    }
  }

  private handleDialogueInput(): void {
    if (!this.input.consumeDialogueAdvance()) {
      return;
    }

    this.onDialogueGesture();
    this.dialogueIndex += 1;

    if (this.dialogueIndex >= DIALOGUE.length) {
      this.inDialogue = false;
      this.ui.hideDialogue();
      this.onDialogueFinished();
      return;
    }

    this.ui.showDialogue(DIALOGUE[this.dialogueIndex]);
  }

  private startDialogue(): void {
    this.inDialogue = true;
    this.dialogueIndex = 0;
    this.ui.hideHint();
    this.ui.showDialogue(DIALOGUE[0]);
  }

  private async setupMusic(): Promise<void> {
    if (this.worldMusic) {
      return;
    }

    const buffer = await this.assets.loadAudioBuffer("/assets/audio/world_track.mp3");
    if (!buffer) {
      return;
    }

    this.worldMusic = new Audio(this.listener);
    this.worldMusic.setLoop(true);
    this.worldMusic.setVolume(0.5);
    this.worldMusic.setBuffer(buffer);
    this.tryStartMusic();
  }

  private async tryStartMusic(): Promise<void> {
    if (!this.audioUnlocked || !this.worldMusic || this.worldMusic.isPlaying) {
      return;
    }

    try {
      await this.listener.context.resume();
      this.worldMusic.play();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[WorldScene] Audio playback blocked", error);
    }
  }

  private updateCamera(deltaSeconds: number): void {
    this.computeCameraTargets(this.desiredCamPos, this.lookAtPos);
    this.camera.position.lerp(this.desiredCamPos, 1 - Math.exp(-deltaSeconds * 7));
    this.camera.lookAt(this.lookAtPos);
  }

  private computeCameraTargets(outPos: Vector3, outLookAt: Vector3): void {
    // Character forward in world space (Three.js forward is local -Z).
    this.camForward.set(0, 0, -1).applyQuaternion(this.player.quaternion);
    this.camForward.y = 0;
    if (this.camForward.lengthSq() < 1e-5) {
      this.camForward.set(0, 0, -1);
    } else {
      this.camForward.normalize();
    }

    this.camRight.crossVectors(this.camForward, this.worldUp).normalize();

    outPos
      .copy(this.player.position)
      .addScaledVector(this.camForward, -this.cameraOffset.z)
      .addScaledVector(this.camRight, this.cameraOffset.x);
    outPos.y += this.cameraOffset.y;

    outLookAt
      .copy(this.player.position)
      .add(this.lookOffset)
      .addScaledVector(this.camForward, 0.9);
  }
}

