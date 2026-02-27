import { AudioListener } from "three";
import { Assets } from "./Assets";
import { Input } from "./Input";
import { StateMachine } from "./StateMachine";
import { ClubScene } from "../scenes/ClubScene";
import { WorldScene } from "../scenes/WorldScene";
import { UI } from "../ui/UI";
import { PS1Renderer } from "../render/PS1Renderer";

const STATE_WORLD = "STATE_A_WORLD";
const STATE_CLUB = "STATE_B_CLUB";

export class Game {
  private readonly mount: HTMLElement;
  private readonly root: HTMLDivElement;

  private readonly renderer: PS1Renderer;
  private readonly assets: Assets;
  private readonly input: Input;
  private readonly ui: UI;
  private readonly stateMachine: StateMachine;
  private readonly listener: AudioListener;

  private readonly worldScene: WorldScene;
  private readonly clubScene: ClubScene;

  private running = false;
  private rafId = 0;
  private lastTimestamp = 0;
  private inTransition = false;
  private audioUnlocked = false;

  constructor(mount: HTMLElement) {
    this.mount = mount;

    this.root = document.createElement("div");
    this.root.className = "game-root";
    this.mount.append(this.root);

    this.renderer = new PS1Renderer(this.root, {
      pixelScale: 3,
      enableDither: true,
      enableUvWobble: true,
      colorLevels: 48
    });

    this.assets = new Assets();
    this.input = new Input();
    this.ui = new UI(this.root);
    this.stateMachine = new StateMachine();
    this.listener = new AudioListener();
    this.input.onUserGesture(() => {
      void this.unlockAudio();
    });

    this.worldScene = new WorldScene({
      assets: this.assets,
      input: this.input,
      ui: this.ui,
      audioListener: this.listener,
      renderHook: (scene, camera, deltaSeconds) => this.renderer.render(scene, camera, deltaSeconds),
      onDialogueFinished: () => {
        void this.transitionToClub();
      },
      onDialogueGesture: () => {
        void this.unlockAudio();
      }
    });

    this.clubScene = new ClubScene({
      assets: this.assets,
      ui: this.ui,
      audioListener: this.listener,
      renderHook: (scene, camera, deltaSeconds) => this.renderer.render(scene, camera, deltaSeconds)
    });

    this.stateMachine.register(STATE_WORLD, this.worldScene);
    this.stateMachine.register(STATE_CLUB, this.clubScene);
  }

  async start(): Promise<void> {
    this.onResize();
    window.addEventListener("resize", this.onResize);

    await this.stateMachine.change(STATE_WORLD);
    await this.ui.fadeIn(450);

    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafId = window.requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.running = false;
    window.cancelAnimationFrame(this.rafId);
    window.removeEventListener("resize", this.onResize);

    this.input.dispose();
    this.renderer.dispose();
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) {
      return;
    }

    const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, 1 / 20);
    this.lastTimestamp = timestamp;

    this.stateMachine.update(deltaSeconds);
    this.stateMachine.render(deltaSeconds);
    this.input.endFrame();

    this.rafId = window.requestAnimationFrame(this.tick);
  };

  private readonly onResize = (): void => {
    const width = this.root.clientWidth || window.innerWidth;
    const height = this.root.clientHeight || window.innerHeight;

    this.renderer.setSize(width, height);
    this.stateMachine.resize(width, height);
  };

  private async transitionToClub(): Promise<void> {
    if (this.inTransition || this.stateMachine.current === STATE_CLUB) {
      return;
    }

    this.inTransition = true;
    await this.ui.fadeOut(520);

    await this.stateMachine.change(STATE_CLUB);
    this.clubScene.setAudioUnlocked(this.audioUnlocked);
    this.onResize();

    await this.ui.fadeIn(520);
    this.inTransition = false;
  }

  private async unlockAudio(): Promise<void> {
    if (this.audioUnlocked) {
      return;
    }

    this.audioUnlocked = true;
    this.worldScene.setAudioUnlocked(true);
    this.clubScene.setAudioUnlocked(true);

    try {
      await this.listener.context.resume();
    } catch {
      // If browser still blocks audio, ClubScene will try again on enter/update.
    }
  }
}
