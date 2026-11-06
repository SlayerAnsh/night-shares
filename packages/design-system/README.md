# @night-shares/design-system

Design tokens for the Night Shares web apps (Stay, Host and Trade). Values are extracted from the approved mock in `mock/v2/assets/` (`styles.css`, plus `login.css`, `host.css` and `trade.css`), so all three apps share one look.

This package holds tokens only. React components come later, after the mock is approved.

## Token groups

| File | Exports | CSS prefix |
| --- | --- | --- |
| `src/tokens/color.ts` | `colorLight`, `colorDark` | none (mock names) |
| `src/tokens/typography.ts` | `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing` | none, `--fs-`, `--fw-`, `--lh-`, `--ls-` |
| `src/tokens/space.ts` | `space`, `layout` | `--sp-`, none |
| `src/tokens/radius.ts` | `radius` | none (`--r-*`) |
| `src/tokens/shadow.ts` | `shadowLight`, `shadowDark`, `shadow` | none (`--shadow-*`) |
| `src/tokens/motion.ts` | `duration`, `easing`, `keyframes` | `--dur-`, `--ease-` |
| `src/tokens/z-index.ts` | `zIndex` | `--z-` |
| `src/tokens/breakpoints.ts` | `breakpoints` (numbers, px) | TS only |
| `src/themes/light.ts`, `dark.ts` | `lightTheme`, `darkTheme` (color plus theme shadows) | none |
| `src/themes/world-id.ts` | `worldIdLight`, `worldIdDark`, `worldIdFont` | none (`--w-*`) |

Token keys are the CSS variable names without the leading `--`. Sizes with no mock variable are keyed by their pixel value (`fontSize["13.5"]` is `--fs-13-5`). That scale is a faithful record of the mock and should be consolidated once the mock is approved.

Breakpoints are not emitted as CSS variables because custom properties do not work inside media queries.

## Using it in an app

Import the stylesheet once in the Next.js root layout:

```ts
// app/layout.tsx
import "@night-shares/design-system/tokens.css";
```

Light is the default. Set `data-theme="dark"` on `<html>` to force dark, or `data-theme="light"` to force light. Without the attribute the system preference decides.

Use the TS tokens where CSS variables cannot reach, for example chart libraries or canvas:

```ts
import { darkTheme, lightTheme } from "@night-shares/design-system";

const series = { up: lightTheme.pos, down: lightTheme.neg };
```

Fonts are not bundled. Load Bebas Neue, Nunito Sans and JetBrains Mono (and Inter for the World ID screens), for example with `next/font`, so the stacks in `--display`, `--sans`, `--mono` and `--w-font` resolve.

## Scripts

```sh
bun run gen:css    # writes generated/tokens.css
bun test           # checks the CSS output covers every token and both themes
bun run typecheck
```

Run `gen:css` after changing any token. `generated/tokens.css` is what apps import.

## Mapping from the mock

Mock variables keep their names, so porting mock CSS is a search and replace of hard-coded values only.

| Mock | Token | Notes |
| --- | --- | --- |
| `:root` in `styles.css` | `:root` | light theme and static tokens |
| `.theme-dark` | `[data-theme="dark"]` and `prefers-color-scheme: dark` | rename the class to the attribute |
| `--bg`, `--surface`, `--surface-2`, `--surface-3` | same | `colorLight` / `colorDark` |
| `--ink`, `--ink-2`, `--muted` | same | |
| `--line`, `--line-2` | same | |
| `--accent`, `--accent-soft`, `--grad` | same | dark keeps the light gradient (the mock does not redefine it) |
| `--pos`, `--pos-soft`, `--neg`, `--neg-soft` | same | positive and negative (good and bad) |
| `--warn` | same | dark value `#E9B23A` comes from `trade.css` |
| `--r-sm`, `--r`, `--r-lg` | same | `radius` |
| `--shadow`, `--shadow-lg` | same | `shadowLight` / `shadowDark` |
| `--display`, `--sans`, `--mono` | same | `fontFamily` |
| `--nav-h` | same | `layout` |
| `--w-*` and `--w-font` in `login.css` | same | `worldIdLight` / `worldIdDark` / `worldIdFont` |
| `#fff` text on gradient or accent | `--on-accent` | new role |
| `rgba(14,12,20,.48)` on `.modal-bg` | `--scrim` | new role |
| `.toast` colors | `--inverse`, `--inverse-ink` | new roles, swap in dark |
| focus ring `0 0 0 4px var(--accent-soft)` | `--shadow-focus` | |
| `.btn-primary` glow | `--shadow-glow`, `--shadow-glow-hover` | |
| `.wrap`, `.wrap-wide`, 24px gutter | `--wrap-max`, `--wrap-wide-max`, `--gutter` | |
| hard-coded radii 6, 8, 12, 14, 24, 999 px | `--r-6`, `--r-8`, `--r-12`, `--r-14`, `--r-24`, `--r-pill` | |
| `font-size: Npx` | `--fs-N` (dot becomes hyphen) | |
| gaps and paddings | `--sp-N` | |
| transition durations | `--dur-80` to `--dur-250` | |
| `cubic-bezier(.2,.8,.2,1)` | `--ease-out` | |
| z-index 1, 50, 60, 100, 200 | `--z-raised`, `--z-nav`, `--z-popover`, `--z-modal`, `--z-toast` | |
| `@keyframes fade`, `rise` | same | emitted in `tokens.css` |
