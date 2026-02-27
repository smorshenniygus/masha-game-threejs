export interface DialogueLine {
  speaker: string;
  text: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class UI {
  private readonly layer: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly dialog: HTMLDivElement;
  private readonly dialogName: HTMLParagraphElement;
  private readonly dialogText: HTMLParagraphElement;
  private readonly fade: HTMLDivElement;

  constructor(root: HTMLElement) {
    this.layer = document.createElement("div");
    this.layer.className = "ui-layer";

    this.hint = document.createElement("div");
    this.hint.className = "ui-hint";
    this.hint.textContent = "E - talk";

    this.dialog = document.createElement("div");
    this.dialog.className = "ui-dialog";

    this.dialogName = document.createElement("p");
    this.dialogName.className = "ui-dialog-name";

    this.dialogText = document.createElement("p");
    this.dialogText.className = "ui-dialog-text";

    const dialogTip = document.createElement("p");
    dialogTip.className = "ui-dialog-tip";
    dialogTip.textContent = "Space / Enter / Click";

    this.dialog.append(this.dialogName, this.dialogText, dialogTip);

    this.fade = document.createElement("div");
    this.fade.className = "ui-fade";

    const scanlines = document.createElement("div");
    scanlines.className = "ui-scanlines";

    this.layer.append(this.hint, this.dialog, scanlines, this.fade);
    root.append(this.layer);
  }

  showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.classList.add("visible");
  }

  hideHint(): void {
    this.hint.classList.remove("visible");
  }

  showDialogue(line: DialogueLine): void {
    this.dialogName.textContent = line.speaker;
    this.dialogText.textContent = line.text;
    this.dialog.classList.add("visible");
  }

  hideDialogue(): void {
    this.dialog.classList.remove("visible");
  }

  async fadeIn(durationMs: number): Promise<void> {
    this.fade.style.transitionDuration = `${durationMs}ms`;
    this.fade.style.opacity = "1";
    await wait(20);
    this.fade.style.opacity = "0";
    await wait(durationMs + 24);
  }

  async fadeOut(durationMs: number): Promise<void> {
    this.fade.style.transitionDuration = `${durationMs}ms`;
    this.fade.style.opacity = "1";
    await wait(durationMs + 24);
  }

  setFadeVisible(visible: boolean): void {
    this.fade.style.opacity = visible ? "1" : "0";
  }
}
