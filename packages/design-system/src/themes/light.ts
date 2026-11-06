import { colorLight } from "../tokens/color";
import { shadowLight } from "../tokens/shadow";

export const lightTheme = { ...colorLight, ...shadowLight } as const;

export type ThemeToken = keyof typeof lightTheme;
