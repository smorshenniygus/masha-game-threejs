import { Vector2 } from "three";

type UserGestureCallback = () => void;

const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private pointerPressed = false;
  private readonly gestureCallbacks = new Set<UserGestureCallback>();

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointerdown", this.onPointerDown);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointerdown", this.onPointerDown);
  }

  onUserGesture(callback: UserGestureCallback): void {
    this.gestureCallbacks.add(callback);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  consumePressed(code: string): boolean {
    if (!this.pressed.has(code)) {
      return false;
    }
    this.pressed.delete(code);
    return true;
  }

  consumeInteract(): boolean {
    return this.consumePressed("KeyE");
  }

  consumeDialogueAdvance(): boolean {
    if (this.consumePressed("Space") || this.consumePressed("Enter")) {
      return true;
    }

    if (this.pointerPressed) {
      this.pointerPressed = false;
      return true;
    }

    return false;
  }

  getMovementVector(): Vector2 {
    let x = 0;
    let y = 0;

    if (this.down.has("KeyA") || this.down.has("ArrowLeft")) x -= 1;
    if (this.down.has("KeyD") || this.down.has("ArrowRight")) x += 1;
    if (this.down.has("KeyW") || this.down.has("ArrowUp")) y += 1;
    if (this.down.has("KeyS") || this.down.has("ArrowDown")) y -= 1;

    const vec = new Vector2(x, y);
    if (vec.lengthSq() > 1) {
      vec.normalize();
    }
    return vec;
  }

  endFrame(): void {
    this.pressed.clear();
    this.pointerPressed = false;
  }

  private notifyGesture(): void {
    for (const callback of this.gestureCallbacks) {
      callback();
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (MOVE_KEYS.includes(event.code) || event.code === "Space") {
      event.preventDefault();
    }

    if (!event.repeat) {
      this.pressed.add(event.code);
    }
    this.down.add(event.code);

    this.notifyGesture();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  private onPointerDown = (): void => {
    this.pointerPressed = true;
    this.notifyGesture();
  };
}
