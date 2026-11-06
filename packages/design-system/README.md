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
| `src/themes/trade.ts` | `tradeLight`, `tradeDark`, `tradeStatic` | none (mock names, scoped to `[data-app="trade"]`) |

Token keys are the CSS variable names without the leading `--`. Sizes with no mock variable are keyed by their pixel value (`fontSize["13.5"]` is `--fs-13-5`). That scale is a faithful record of the mock and should be consolidated once the mock is approved.

Breakpoints are not emitted as CSS variables because custom properties do not work inside media queries.

## Using it in an app

Import the stylesheet once in the Next.js root layout:

```ts
// app/layout.tsx
import "@night-shares/design-system/tokens.css";
```

Light is the default. Set `data-theme="dark"` on `<html>` to force dark, or `data-theme="light"` to force light. Without the attribute the system preference decides.

The trader app has its own palette. Set `data-app="trade"` on `<html>` (or on a wrapper) and the base names (`--bg`, `--accent`, `--r`, `--sans` and so on) switch to the trade values, plus `--subtle`, `--accent-btn`, `--info` and `--w6`. Dark trade follows the same `data-theme` and system preference rules.

Use the TS tokens where CSS variables cannot reach, for example chart libraries or canvas:

```ts
import { darkTheme, lightTheme } from "@night-shares/design-system";

const series = { up: lightTheme.pos, down: lightTheme.neg };
```

Fonts are not bundled. Load Bebas Neue, Nunito Sans and JetBrains Mono (and Inter for the World ID and trade screens), for example with `next/font`, so the stacks in `--display`, `--sans`, `--mono` and `--w-font` resolve.

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
| `--warn` | same | dark keeps the light `#B87A0A` (the mock does not redefine it) |
| `--r-sm`, `--r`, `--r-lg` | same | `radius` |
| `--shadow`, `--shadow-lg` | same | `shadowLight` / `shadowDark` |
| `--display`, `--sans`, `--mono` | same | `fontFamily` |
| `--nav-h` | same | `layout` |
| `--w-*` and `--w-font` in `login.css` | same | `worldIdLight` / `worldIdDark` / `worldIdFont` |
| `.trade-page` in `trade.css` | `[data-app="trade"]` | rename the class to the attribute |
| `.trade-page.theme-dark` | `[data-theme="dark"]` plus `[data-app="trade"]` (same element or descendant) | `tradeDark` |
| `--subtle`, `--accent-btn`, `--info`, `--w6` | same | trade only, `tradeLight` / `tradeDark` / `tradeStatic` |
| `--on-accent` in `trade.css` | same | trade defines the role the base package already promoted |
| `--m` in `styles.css` | not a token | per element month count set inline by `NS.calendar` |
| `#fff` text on gradient or accent | `--on-accent` | new role |
| `rgba(14,12,20,.48)` on `.modal-bg` | `--scrim` | new role |
| `.cmdk-back` backdrop of the command palette | `--cmdk-scrim` | light `rgba(22,19,31,.38)`, dark `rgba(0,0,0,.62)` |
| `.nav-apps-on` shadow (app switcher) | `--shadow-seg-on` | dark is `none` |
| `.toast` colors | `--inverse`, `--inverse-ink` | new roles, swap in dark |
| focus ring `0 0 0 4px var(--accent-soft)` | `--shadow-focus` | |
| `.btn-primary` glow | `--shadow-glow`, `--shadow-glow-hover` | |
| `.wrap`, `.wrap-wide`, 24px gutter | `--wrap-max`, `--wrap-wide-max`, `--gutter` | |
| hard-coded radii 3, 4, 6, 8, 12, 14, 24, 999 px | `--r-3`, `--r-4`, `--r-6`, `--r-8`, `--r-12`, `--r-14`, `--r-24`, `--r-pill` | `--r-3` is the `kbd` hint radius |
| `font-size: Npx` | `--fs-N` (dot becomes hyphen) | |
| gaps and paddings | `--sp-N` | |
| transition durations | `--dur-80` to `--dur-250` | |
| `cubic-bezier(.2,.8,.2,1)` | `--ease-out` | |
| z-index 1, 5, 50, 60, 100, 200 | `--z-raised`, `--z-sticky`, `--z-nav`, `--z-popover`, `--z-modal`, `--z-toast` | command palette uses `--z-modal` |
| `@keyframes fade`, `rise` | same | emitted in `tokens.css` |

Command palette (`NS.palette`, `.cmdk-*`) and its `kbd` hints use only existing tokens: `--surface`, `--surface-2`, `--surface-3`, `--line`, `--line-2`, `--muted`, `--ink-2`, `--mono`, `--fs-11`, `--r-3`, `--r-4`, `--r-6` and `--shadow-lg`. The palette adds no CSS variables of its own.

Breakpoints (TS only): `xxs` 420 (command palette), `xs` 480 (login), `sm` 720, `md` 860 and `lg` 1100 (trade), `xl` 1180 (host).

## Inconsistencies in the mock

Recorded as found, not fixed. Resolve them in the mock, then update the tokens.

- `--warn` has no dark value in `styles.css`. The earlier `trade.css` hard-coded `#E9B23A`. The current one defines a scoped `--warn` instead, so the base dark theme now inherits the light `#B87A0A`.
- `--grad` has no dark value, so dark keeps the light gradient.
- Two backdrops for the same job: `.modal-bg` uses `rgba(14,12,20,.48)` with a 3px blur in both themes, `.cmdk-back` uses `rgba(22,19,31,.38)` (dark `rgba(0,0,0,.62)`) with a 2px blur.
- The trade palette is a separate system: `--r` drops from 16px to 3px, `--sans` becomes Inter, `--surface` equals `--bg` in light and `--surface-2` equals `--surface` in dark, and `--pos` equals `--accent` in dark.
- `--on-accent` exists only in `trade.css`. Base screens hard-code `#fff` for the same role.
- `--w6` (weight 600) is a trade only variable. Every other screen writes weights as literals (400 to 800).
- `--mono` in `trade.css` repeats the base value.
- Font sizes are not a scale: 35 distinct values from 8px to 64px, including half pixels.
- Radii drift: the new app switcher and command palette use 3px, 4px and 6px while the rest of the base uses 10px, 12px and 16px.
- `.toast` and `.nav.on-hero` controls hard-code colors (`#16131F`, `#F4F1E8`, `#fff` and white alphas from .12 to .9) instead of variables. The on hero whites are left as literals.
- The `styles.css` header comment still says "mock v1".
