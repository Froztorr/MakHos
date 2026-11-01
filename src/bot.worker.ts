import { bestMove } from "./rules.ts";
self.onmessage = (event) => {
  const { game, depth, revision } = event.data;
  self.postMessage({ move: bestMove(game, depth), revision });
};
