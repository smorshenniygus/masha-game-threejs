import {
  AdditiveBlending,
  AmbientLight,
  AnimationClip,
  AnimationMixer,
  Audio,
  AudioListener,
  CircleGeometry,
  Clock,
  Color,
  ConeGeometry,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Object3D,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  Vector3
} from "three";
import type { Assets } from "../core/Assets";
import type { IGameState } from "../core/StateMachine";
import type { UI } from "../ui/UI";
import {
  createClubRoomPlaceholder,
  createDJBoothPlaceholder,
  createFriendPlaceholder,
  createKittyPlaceholder,
  createLightConeMaterial
} from "../utils/Placeholders";

export interface ClubSceneDeps {
  assets: Assets;
  ui: UI;
  audioListener: AudioListener;
  renderHook: (scene: Scene, camera: PerspectiveCamera, deltaSeconds: number) => void;
}

interface DancerSlot {
  root: Object3D;
  mixer: AnimationMixer | null;
  leftArm: Object3D | null;
  rightArm: Object3D | null;
  head: Object3D | null;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotY: number;
  phase: number;
  wiggleAmp: number;
  wiggleSpeed: number;
  hopDuration: number;
  hopHeight: number;
  hopStartAt: number;
  nextHopAt: number;
}

interface MovingSpot {
  light: SpotLight;
  target: Object3D;
  cone: Mesh;
  phase: number;
  speed: number;
  radius: number;
}

interface LedNode {
  mesh: Mesh;
  baseOpacity: number;
  phase: number;
  speed: number;
  scaleBase: number;
}

const MODEL_PATHS = {
  kitty: "/assets/models/custom/masha/masha.obj",
  friendGirl1: "/assets/models/custom/artem/artem.obj",
  friendGirl2: "/assets/models/custom/klim_sanych/klim_sanych.obj",
  friendBoy1: "/assets/models/custom/sanya/sanya.obj",
  friendBoy2: "/assets/models/kitty.glb",
  clubRoom: "/assets/models/club_room.glb",
  djBooth: "/assets/models/dj_booth.glb"
};

const SLOT_POSITIONS = {
  kitty_center: new Vector3(0, 0, 1.1),
  friend1_left: new Vector3(-3.2, 0, -2.8),
  friend2_left_mid: new Vector3(-1.35, 0, -3.2),
  friend3_right_mid: new Vector3(1.35, 0, -3.2),
  friend4_right: new Vector3(3.2, 0, -2.8),
  slot_dj_booth: new Vector3(0, 0, -5.5)
};

export class ClubScene implements IGameState {
  private readonly assets: Assets;
  private readonly ui: UI;
  private readonly listener: AudioListener;
  private readonly renderHook: ClubSceneDeps["renderHook"];

  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(57, 16 / 9, 0.1, 200);

  private initialized = false;
  private audioUnlocked = false;
  private music: Audio | null = null;
  private musicElement: HTMLAudioElement | null = null;

  private readonly dancers: DancerSlot[] = [];
  private readonly lights: MovingSpot[] = [];
  private readonly floorSpots: Mesh[] = [];
  private readonly leds: LedNode[] = [];
  private readonly clock = new Clock();
  private readonly tmpDir = new Vector3();
  private readonly upVec = new Vector3(0, 1, 0);
  private readonly cameraWaypoints: Vector3[] = [];
  private readonly cameraFocusPoints: Vector3[] = [];
  private readonly camFromPos = new Vector3();
  private readonly camToPos = new Vector3();
  private readonly camLookFrom = new Vector3();
  private readonly camLookTo = new Vector3();
  private readonly camLookNow = new Vector3();
  private cameraLegElapsed = 0;
  private cameraLegDuration = 2.4;

  constructor(deps: ClubSceneDeps) {
    this.assets = deps.assets;
    this.ui = deps.ui;
    this.listener = deps.audioListener;
    this.renderHook = deps.renderHook;

    this.scene.background = new Color("#0b1f57");
    this.camera.position.set(0, 4.6, 9.4);
    this.camera.lookAt(0, 1.5, 0);
  }

  setAudioUnlocked(value: boolean): void {
    this.audioUnlocked = value;
    this.tryStartMusic();
  }

  async enter(): Promise<void> {
    if (!this.initialized) {
      await this.buildScene();
      this.initialized = true;
    }

    this.ui.hideDialogue();
    this.ui.hideHint();

    if (!this.camera.children.includes(this.listener)) {
      this.camera.add(this.listener);
    }

    this.clock.start();
    this.resetCameraFlight();
    this.tryStartMusic();
  }

  exit(): void {
    this.ui.hideHint();
    this.ui.hideDialogue();
    if (this.music?.isPlaying) {
      this.music.stop();
    }
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement.currentTime = 0;
    }
  }

  update(deltaSeconds: number): void {
    const t = this.clock.getElapsedTime();

    for (const dancer of this.dancers) {
      if (dancer.mixer) {
        dancer.mixer.update(deltaSeconds);
      }

      if (t >= dancer.nextHopAt) {
        dancer.hopStartAt = t;
        dancer.hopDuration = 0.2 + Math.random() * 0.22;
        dancer.hopHeight = 0.07 + Math.random() * 0.12;
        dancer.nextHopAt = t + 0.45 + Math.random() * 1.0;
      }

      const wiggle = Math.sin(t * dancer.wiggleSpeed + dancer.phase) * dancer.wiggleAmp;
      const swayZ = Math.cos(t * (dancer.wiggleSpeed * 0.78) + dancer.phase) * dancer.wiggleAmp * 0.22;
      let hopOffset = 0;
      if (t >= dancer.hopStartAt && t <= dancer.hopStartAt + dancer.hopDuration) {
        const hopT = (t - dancer.hopStartAt) / dancer.hopDuration;
        hopOffset = Math.sin(hopT * Math.PI) * dancer.hopHeight;
      }

      dancer.root.position.x = dancer.baseX + wiggle;
      dancer.root.position.z = dancer.baseZ + swayZ;
      dancer.root.position.y = dancer.baseY + Math.sin(t * 2.0 + dancer.phase) * 0.035 + hopOffset;
      dancer.root.rotation.y = dancer.baseRotY + Math.sin(t * 1.2 + dancer.phase) * 0.18;
      dancer.root.rotation.z = wiggle * 0.08;

      const armSwing = Math.sin(t * 3.0 + dancer.phase) * 0.36;
      if (dancer.leftArm) dancer.leftArm.rotation.z = armSwing;
      if (dancer.rightArm) dancer.rightArm.rotation.z = -armSwing;
      if (dancer.head) dancer.head.rotation.y = Math.sin(t * 1.7 + dancer.phase) * 0.12;
    }

    this.updateLights(t);
    this.updateDynamicCamera(deltaSeconds);
  }

  render(deltaSeconds: number): void {
    this.renderHook(this.scene, this.camera, deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private async buildScene(): Promise<void> {
    this.scene.clear();
    this.dancers.length = 0;
    this.lights.length = 0;
    this.floorSpots.length = 0;
    this.leds.length = 0;

    const ambient = new AmbientLight(0xd8e8ff, 2.9);
    const hemi = new HemisphereLight(0xcfe0ff, 0x6f86c8, 2.4);
    const pulseLight = new PointLight(0xc8a8ff, 4.4, 32, 2);
    pulseLight.position.set(0, 5.1, 0.4);
    const fillFront = new PointLight(0xf4f7ff, 3.1, 32, 2);
    fillFront.position.set(0, 5.4, 8.4);
    const fillBack = new PointLight(0xa9c1ff, 2.7, 28, 2);
    fillBack.position.set(0, 4.5, -7.2);
    const fillSideL = new PointLight(0xb9d0ff, 2.3, 28, 2);
    fillSideL.position.set(-8.2, 4.1, 0.5);
    const fillSideR = new PointLight(0xb9d0ff, 2.3, 28, 2);
    fillSideR.position.set(8.2, 4.1, 0.5);
    this.scene.add(ambient, hemi, pulseLight, fillFront, fillBack, fillSideL, fillSideR);

    const [room, booth, kitty, friend1, friend2, friend3, friend4] = await Promise.all([
      this.assets.instantiateModel(MODEL_PATHS.clubRoom, () => createClubRoomPlaceholder()),
      this.assets.instantiateModel(MODEL_PATHS.djBooth, () => createDJBoothPlaceholder()),
      this.assets.instantiateModel(MODEL_PATHS.kitty, () => createKittyPlaceholder("#f7f4c2")),
      this.assets.instantiateModel(MODEL_PATHS.friendGirl1, () => createFriendPlaceholder("#ff9ac9", "friend_girl_1.glb")),
      this.assets.instantiateModel(MODEL_PATHS.friendGirl2, () => createFriendPlaceholder("#eeb1ff", "friend_girl_2.glb")),
      this.assets.instantiateModel(MODEL_PATHS.friendBoy1, () => createFriendPlaceholder("#7ec0ff", "friend_boy_1.glb")),
      this.assets.instantiateModel(MODEL_PATHS.friendBoy2, () => createFriendPlaceholder("#c9f0ff", "friend_boy_2.glb"))
    ]);

    room.root.position.set(0, 0, 0);
    booth.root.position.copy(SLOT_POSITIONS.slot_dj_booth);
    booth.root.position.y += this.getGroundLift(booth.root);
    kitty.root.position.copy(SLOT_POSITIONS.kitty_center);
    kitty.root.position.y += this.getGroundLift(kitty.root);

    this.scene.add(room.root, booth.root);

    this.addDancer(kitty.root, kitty.clips, SLOT_POSITIONS.kitty_center, 0.95);

    this.addDancer(friend1.root, friend1.clips, SLOT_POSITIONS.friend1_left, 0.3);
    this.addDancer(friend2.root, friend2.clips, SLOT_POSITIONS.friend2_left_mid, 1.8);
    this.addDancer(friend3.root, friend3.clips, SLOT_POSITIONS.friend3_right_mid, 3.5);
    this.addDancer(friend4.root, friend4.clips, SLOT_POSITIONS.friend4_right, 5.0);

    this.addSpotlights();
    this.addFloorSpots();
    this.addLedDecor();
    this.setupCameraFlightPaths();

    await this.setupMusic();
  }

  private addDancer(root: Object3D, clips: AnimationClip[], position: Vector3, phase: number): void {
    root.position.copy(position);
    root.position.y += this.getGroundLift(root);
    this.scene.add(root);

    let mixer: AnimationMixer | null = null;
    if (clips.length > 0) {
      mixer = new AnimationMixer(root);
      const action = mixer.clipAction(clips[0]);
      action.play();
    }

    const leftArm = root.getObjectByName("leftArm") ?? null;
    const rightArm = root.getObjectByName("rightArm") ?? null;
    const head = root.getObjectByName("head") ?? null;

    this.dancers.push({
      root,
      mixer,
      leftArm,
      rightArm,
      head,
      baseX: root.position.x,
      baseY: root.position.y,
      baseZ: root.position.z,
      baseRotY: root.rotation.y,
      phase,
      wiggleAmp: 0.08 + Math.random() * 0.08,
      wiggleSpeed: 2.2 + Math.random() * 1.6,
      hopDuration: 0.28,
      hopHeight: 0.09,
      hopStartAt: phase * 0.3,
      nextHopAt: 0.5 + phase * 0.35 + Math.random() * 0.35
    });
  }

  private addSpotlights(): void {
    const colors = [0xff4d8d, 0x4de3ff, 0x74ff6e, 0xffc64d, 0xcd7aff, 0x6effdd, 0xff7676, 0x8ab2ff];
    const coneGeo = new ConeGeometry(1.15, 6.6, 12, 1, true);
    coneGeo.translate(0, -3.3, 0);

    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = 5.1;

      const light = new SpotLight(colors[i], 2.8, 30, Math.PI / 7, 0.52, 1.2);
      light.position.set(Math.cos(angle) * radius, 6.0, Math.sin(angle) * radius);

      const target = new Object3D();
      target.position.set(Math.cos(angle) * 1.2, 0.1, Math.sin(angle) * 1.2);
      this.scene.add(target);
      light.target = target;

      const cone = new Mesh(coneGeo, createLightConeMaterial(colors[i]));
      cone.position.copy(light.position);
      this.scene.add(light, cone);

      this.lights.push({
        light,
        target,
        cone,
        phase: i * 0.9,
        speed: 0.7 + i * 0.04,
        radius: 2.4 + (i % 3) * 0.35
      });
    }
  }

  private addFloorSpots(): void {
    const floorColors = [0xff5f8f, 0x6ec6ff, 0xc59cff, 0x8dffcb, 0xffdd89];
    for (let i = 0; i < 5; i += 1) {
      const mat = new MeshBasicMaterial({
        color: floorColors[i],
        transparent: true,
        opacity: 0.45,
        blending: AdditiveBlending,
        depthWrite: false
      });

      const mesh = new Mesh(new CircleGeometry(0.85, 24), mat);
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.position.set(-3.6 + i * 1.8, 0.02, -1.0 + (i % 2) * 1.3);
      this.floorSpots.push(mesh);
      this.scene.add(mesh);
    }
  }

  private addLedDecor(): void {
    const palette = [0x66c9ff, 0xff71c8, 0x8bff7a, 0xffd869, 0xb493ff, 0xff7e7e];
    const ledGeo = new SphereGeometry(0.08, 8, 6);

    const addLed = (x: number, y: number, z: number, color: number, idx: number): void => {
      const mat = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.68,
        blending: AdditiveBlending,
        depthWrite: false
      });
      const mesh = new Mesh(ledGeo, mat);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.leds.push({
        mesh,
        baseOpacity: 0.62 + (idx % 3) * 0.12,
        phase: idx * 0.37,
        speed: 1.1 + (idx % 5) * 0.27,
        scaleBase: 0.8 + (idx % 4) * 0.08
      });
    };

    let idx = 0;
    for (let i = 0; i < 24; i += 1) {
      const z = -7.1 + i * 0.58;
      const yA = 1.1 + (i % 6) * 0.48;
      const yB = 1.25 + ((i + 3) % 6) * 0.48;
      addLed(-9.2, yA, z, palette[idx % palette.length], idx);
      idx += 1;
      addLed(9.2, yB, z, palette[idx % palette.length], idx);
      idx += 1;
    }

    for (let i = 0; i < 28; i += 1) {
      const x = -8.4 + i * 0.62;
      const y = 0.95 + (i % 7) * 0.42;
      addLed(x, y, -7.7, palette[idx % palette.length], idx);
      idx += 1;
    }

    for (let i = 0; i < 20; i += 1) {
      const x = -7.6 + i * 0.8;
      addLed(x, 0.35, 6.9, palette[idx % palette.length], idx);
      idx += 1;
    }
  }

  private updateLights(t: number): void {
    for (let i = 0; i < this.lights.length; i += 1) {
      const item = this.lights[i];
      const phase = item.phase + t * item.speed;

      item.target.position.x = Math.sin(phase * 0.9) * item.radius + Math.sin(phase * 3.7) * 0.15;
      item.target.position.z = Math.cos(phase * 1.1) * item.radius + Math.cos(phase * 2.5) * 0.15;
      item.target.position.y = 0.1;

      item.light.intensity = 2.1 + Math.sin(phase * 2.1) * 0.5;

      item.cone.position.copy(item.light.position);
      this.tmpDir.subVectors(item.target.position, item.light.position).normalize();
      item.cone.quaternion.setFromUnitVectors(this.upVec, this.tmpDir);
    }

    for (let i = 0; i < this.floorSpots.length; i += 1) {
      const spot = this.floorSpots[i];
      const mat = spot.material as MeshBasicMaterial;
      const wave = 0.82 + Math.sin(t * 1.8 + i * 0.9) * 0.34;
      mat.opacity = wave;
      spot.scale.setScalar(0.85 + Math.sin(t * 1.5 + i * 1.4) * 0.22);
    }

    for (let i = 0; i < this.leds.length; i += 1) {
      const led = this.leds[i];
      const mat = led.mesh.material as MeshBasicMaterial;
      const wave = 0.5 + Math.sin(t * led.speed + led.phase) * 0.5;
      mat.opacity = led.baseOpacity * (0.55 + wave * 0.85);
      const s = led.scaleBase + Math.sin(t * (led.speed * 1.2) + led.phase * 0.8) * 0.16;
      led.mesh.scale.setScalar(Math.max(0.55, s));
    }
  }

  private setupCameraFlightPaths(): void {
    this.cameraWaypoints.length = 0;
    this.cameraFocusPoints.length = 0;

    this.cameraWaypoints.push(
      new Vector3(-5.8, 3.4, 4.6),
      new Vector3(5.8, 3.4, 4.6),
      new Vector3(0.0, 4.7, 7.2),
      new Vector3(-4.7, 3.0, -0.2),
      new Vector3(4.7, 3.0, -0.2),
      new Vector3(-2.6, 2.8, -2.2),
      new Vector3(2.6, 2.8, -2.2),
      new Vector3(0.0, 3.2, -3.7),
      new Vector3(0.0, 4.2, -6.2)
    );

    this.cameraFocusPoints.push(
      new Vector3(0, 1.6, -0.8),
      new Vector3(0, 1.4, -2.3),
      new Vector3(-2.1, 1.5, -2.7),
      new Vector3(2.1, 1.5, -2.7),
      new Vector3(0, 1.8, 1.2)
    );
  }

  private resetCameraFlight(): void {
    if (this.cameraWaypoints.length === 0) {
      return;
    }

    this.camera.position.copy(this.cameraWaypoints[0]);
    this.camLookNow.set(0, 1.6, -1.1);
    this.camera.lookAt(this.camLookNow);

    this.camFromPos.copy(this.camera.position);
    this.camToPos.copy(this.camera.position);
    this.camLookFrom.copy(this.camLookNow);
    this.camLookTo.copy(this.camLookNow);
    this.cameraLegElapsed = this.cameraLegDuration;
  }

  private updateDynamicCamera(deltaSeconds: number): void {
    if (this.cameraWaypoints.length === 0 || this.cameraFocusPoints.length === 0) {
      return;
    }

    this.cameraLegElapsed += deltaSeconds;
    if (this.cameraLegElapsed >= this.cameraLegDuration) {
      this.pickNextCameraLeg();
    }

    const tRaw = Math.min(1, this.cameraLegElapsed / this.cameraLegDuration);
    const t = tRaw * tRaw * (3 - 2 * tRaw);
    this.camera.position.lerpVectors(this.camFromPos, this.camToPos, t);
    this.camLookNow.lerpVectors(this.camLookFrom, this.camLookTo, t);
    this.camera.lookAt(this.camLookNow);
  }

  private pickNextCameraLeg(): void {
    this.camFromPos.copy(this.camera.position);
    this.camLookFrom.copy(this.camLookNow);

    const waypoints = this.cameraWaypoints;
    let chosen = waypoints[Math.floor(Math.random() * waypoints.length)];
    for (let i = 0; i < 5; i += 1) {
      const candidate = waypoints[Math.floor(Math.random() * waypoints.length)];
      if (candidate.distanceTo(this.camFromPos) > 1.6) {
        chosen = candidate;
        break;
      }
    }

    const jitterX = (Math.random() - 0.5) * 0.9;
    const jitterY = (Math.random() - 0.5) * 0.45;
    const jitterZ = (Math.random() - 0.5) * 0.9;
    this.camToPos.set(chosen.x + jitterX, chosen.y + jitterY, chosen.z + jitterZ);

    const focusBase = this.cameraFocusPoints[Math.floor(Math.random() * this.cameraFocusPoints.length)];
    this.camLookTo.set(
      focusBase.x + (Math.random() - 0.5) * 0.8,
      focusBase.y + (Math.random() - 0.5) * 0.3,
      focusBase.z + (Math.random() - 0.5) * 0.8
    );

    this.cameraLegDuration = 1.5 + Math.random() * 2.0;
    this.cameraLegElapsed = 0;
  }

  private async setupMusic(): Promise<void> {
    if (this.music || this.musicElement) {
      return;
    }

    const buffer = await this.assets.loadAudioBuffer("/assets/audio/club_track.mp3");
    if (buffer) {
      this.music = new Audio(this.listener);
      this.music.setLoop(true);
      this.music.setVolume(0.55);
      this.music.setBuffer(buffer);

      this.tryStartMusic();
      return;
    }

    // Fallback for containers/codecs that fail decodeAudioData (common with mp4 video files).
    const element = document.createElement("audio");
    element.src = "/assets/audio/club_track.mp3";
    element.loop = true;
    element.preload = "auto";
    element.crossOrigin = "anonymous";
    element.volume = 0.55;
    this.musicElement = element;

    this.tryStartMusic();
  }

  private async tryStartMusic(): Promise<void> {
    if (!this.audioUnlocked) {
      return;
    }

    try {
      await this.listener.context.resume();
      if (this.music) {
        if (!this.music.isPlaying) {
          this.music.play();
        }
        return;
      }

      if (this.musicElement && this.musicElement.paused) {
        await this.musicElement.play();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("[ClubScene] Audio playback blocked", error);
    }
  }

  private getGroundLift(object: Object3D): number {
    return Number(object.userData.groundOffsetY ?? 0) * object.scale.y;
  }
}

