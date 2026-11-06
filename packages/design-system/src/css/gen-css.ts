// Writes generated/tokens.css. Kept apart from build-css so apps can import the
// package without pulling in Bun file APIs.
import { buildCss } from "./build-css";

const target = new URL("../../generated/tokens.css", import.meta.url);
await Bun.write(target, buildCss());
console.log(`wrote ${target.pathname}`);
