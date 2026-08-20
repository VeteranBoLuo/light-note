import { createHostAgent } from "./server.js";

const agent = await createHostAgent();
await agent.listen();
console.log("Light Note Host Agent listening on local Unix socket");

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await agent.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
