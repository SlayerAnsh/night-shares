import { colorDark } from "../tokens/color";
import { shadowDark } from "../tokens/shadow";
import type { ThemeToken } from "./light";

export const darkTheme = { ...colorDark, ...shadowDark } as const satisfies Record<ThemeToken, string>;
