import "./styles.css";
import { Game } from "./core/Game";

async function bootstrap() {
  const root = document.getElementById("app");
  if (!root) {
    throw new Error("#app element is missing");
  }

  const game = new Game(root);
  await game.start();
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start game", error);
});
