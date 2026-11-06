import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

const names = ["identity", "catalog", "stay", "market", "host", "wallet"];
const urls = names.map((name) => ({ name, url: `/docs/openapi/${name}.yaml` }));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Night Shares API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.1/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.1/swagger-ui-bundle.js"></script>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.1/swagger-ui-standalone-preset.js"></script>
<script>SwaggerUIBundle({dom_id:'#swagger-ui',urls:${JSON.stringify(urls)},presets:[SwaggerUIBundle.presets.apis,SwaggerUIStandalonePreset],layout:'StandaloneLayout'});</script></body></html>`;
export async function serveDocs(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (req.method !== "GET") return false;
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/docs" || path === "/docs/") {
    res
      .writeHead(200, { "content-type": "text/html; charset=utf-8" })
      .end(html);
    return true;
  }
  const name = /^\/docs\/openapi\/([a-z]+)\.yaml$/.exec(path)?.[1];
  if (!name || !names.includes(name)) return false;
  const file = new URL(
    `../../../../../packages/proto/gen/openapi/${name}.openapi.yaml`,
    import.meta.url,
  );
  const yaml = await readFile(file, "utf8");
  res
    .writeHead(200, { "content-type": "application/yaml; charset=utf-8" })
    .end(yaml);
  return true;
}
