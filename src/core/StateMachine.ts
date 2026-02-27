export interface IGameState {
  enter(): Promise<void> | void;
  exit(): void;
  update(deltaSeconds: number): void;
  render(deltaSeconds: number): void;
  resize(width: number, height: number): void;
}

export class StateMachine {
  private states = new Map<string, IGameState>();
  private currentKey: string | null = null;
  private currentState: IGameState | null = null;

  register(key: string, state: IGameState): void {
    this.states.set(key, state);
  }

  async change(key: string): Promise<void> {
    if (this.currentKey === key) {
      return;
    }

    const next = this.states.get(key);
    if (!next) {
      throw new Error(`State '${key}' is not registered`);
    }

    this.currentState?.exit();
    this.currentState = next;
    this.currentKey = key;
    await next.enter();
  }

  update(deltaSeconds: number): void {
    this.currentState?.update(deltaSeconds);
  }

  render(deltaSeconds: number): void {
    this.currentState?.render(deltaSeconds);
  }

  resize(width: number, height: number): void {
    this.currentState?.resize(width, height);
  }

  get current(): string | null {
    return this.currentKey;
  }
}
