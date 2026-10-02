import { PORT } from "./core/runtime-config.js";
import { attachFrontend, listenOnPort } from "./app.js";

attachFrontend().then(() => {
  listenOnPort(PORT);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
