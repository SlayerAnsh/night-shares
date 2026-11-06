import { loadConfig } from "./config/load-config";
import { buildContainer } from "./container/build-container";
import { createServer } from "./server/create-server";

const config = loadConfig();
const container = buildContainer(config);
const server = createServer(container);
server.listen(config.port, () => {
  const address = server.address();
  console.log(
    `Night Shares API listening on ${typeof address === "object" && address ? address.port : config.port}`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () =>
    server.close((error) => {
      container.ports.db.close();
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    }),
  );
}
