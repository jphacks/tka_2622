# DESIGN.md — よりみち UI Design Rules

Single source of truth for UI/UX work in this repository. **Read this file before any UI design or modification**, together with the installed skills (see §11). Do not redesign existing screens unless explicitly asked — improve what is there, preserving information architecture, features, and user flows.

**Design direction:** Modern minimalism · refined product UI · strong typography and hierarchy · clean layout with intentional whitespace · mobile-first, tuned for iPhone-width (430 px) rendering. Quality bar: OpenAI / Linear — as a benchmark for restraint and precision, not as a template to copy.

**Product:** よりみち — a Japanese mobile app for organizing belongings before a move: sign in, complete a short residence/station profile, add photographed items for AI recognition, then choose an action when ready, view verified guidance/services, save a plan, and track completion.

---

## 1. Tech Stack Constraints

- Next.js 16 App Router + React 19 + TypeScript. Read `node_modules/next/dist/docs/` before writing framework code (see AGENTS.md).
- **No Tailwind, no CSS-in-JS, no component library.** All styling lives in `src/app/globals.css` using plain CSS with BEM-ish class prefixes (`home-*`, `confirm-*`, `rule-*`, `service-*`, `station-*`, `pipeline2-*`, `mode-*`).
- Do **not** add UI dependencies (icon packs, component kits, font downloads) without explicit approval. Icons are inline SVGs with `stroke: currentColor`, `fill: none`, `stroke-linecap/linejoin: round`, width ~1.7–2.1.
- Do not touch business logic, APIs, or data structures while doing UI work.

## 2. Color

Two token families coexist. **New and revised UI in the 3-step core flow uses the Warm Paper system.** Pipeline 2 screens may keep the Legacy Green tokens until they are revised, but any *new* rule there must pick Warm Paper.

### Warm Paper (canonical — `.home-stage` scope)

| Token | Value | Role |
|---|---|---|
| `--home-ink` | `#292827` | Primary text, near-black |
| `--home-muted` | `#767b70` | Secondary text (contrast-safe muted; ≥ 4.5:1 on white) |
| `--home-line` | `#e8e3dc` | Hairlines, borders |
| `--home-cream` | `#f8f5f0` | Soft fills, icon chips, page tint |
| `--home-gold` | `#c78b05` | Accent / highlighted copy (large text only) |
| `--sage-soft` | `#e2e7d6` | Sage chips, badges, check circles |
| `--olive` | `#46513a` | Olive accent: step badges, rings, active bars |
| `--paper` | `#ffffff` | Card surfaces |
| `--canvas` | `#f4f2ea` | Confirm-screen page background |
| Danger | `#a8544a` / `#a1463c` | Errors, destructive |
| Warning | `#7c612c` on `#fbf2dd`, icon `#e8b64f` | Caution notices |
| Ink button | `linear-gradient(115deg, #313131, #222)` | Primary CTA pill (existing pattern — do not add new gradients elsewhere) |

### Legacy Green (`:root`, Pipeline 2 only)

`--green #386f58`, `--green-dark #28563f`, `--green-soft #eaf1eb`, `--orange #e1a261`, `--red #a1463c`, `--line #e4e8e2`, `--canvas #f7f8f4`, `--shadow`.

### Hard rules

- Body text contrast ≥ 4.5:1; large text (≥ 19 px bold / ≥ 24 px) ≥ 3:1. Never use `#8d8780`, `#9d958d`, `#a09992`, `#b7b0a9`, `#b1aaa3` on white for meaningful text — they fail (2.3–3.6:1, found by audit). Use `--home-muted #767b70` instead.
- No purple/blue gradients, no gradient text, no gradient buttons beyond the existing ink CTA. Max one decorative gradient per screen (currently the `home-app` radial washes).
- White cards need separation via `--home-line` borders or soft shadows — never both heavy.

## 3. Typography

Japanese system stack, one family everywhere:

```css
font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", Meiryo, sans-serif;
```

Size ramp (px) — do not invent values between steps:

| Use | Size | Weight | Notes |
|---|---|---|---|
| Hero title | 40–52 | 760 | `clamp(40px, 10vw, 52px)`, line-height 1.28 |
| Screen title (in-content) | 22 | 800 | e.g. 認識結果を確認 |
| Section/card title | 15–19 | 700–800 | |
| Item value / emphasized body | 15–17 | 600–750 | e.g. form input values |
| Body | 13 | 500 | line-height 1.6–1.75 (JP needs ≥ 1.6) |
| Label / meta | 12 | 700 | |
| **Functional text floor** | **11** | — | **Nothing interactive or content-bearing below 11 px.** 9–10 px values in the current footer/mode panels are legacy debt — never add new ones. |

- Letter-spacing: `0.02–0.04em` for headings; ≥ `0.14em` only for short uppercase/kana micro-labels (STEP 01 style) — and never as an "eyebrow chip" stacked above a hero headline (known AI cliché; the STEP label sits inside the intro block, not on cards).
- Numbers that measure things (4/5 score, counts) use weight 750–800.

## 4. Spacing & Layout

4 px base scale: **4 / 8 / 12 / 14 / 16 / 18 / 20 / 24 / 32 / 34 / 48**. Pick the closest step; never 5, 7, 9, 13, 15, 17, 19 px in new code.

- App frame: `width: min(100%, 430px)`, centered, full-height — the design target is one iPhone column, not a responsive desktop grid.
- Screen gutter: 34 px (22 px below 440 px). Content inside cards: 15–20 px.
- Card internal gaps: 14 px between blocks; form label→field 7 px; related items 10–12 px.
- Section rhythm between stacked cards: 14–18 px. Intentional whitespace beats density — when in doubt, more air around headings, less decoration.
- One idea per card. **Never nest cards inside cards.** A card contains content, at most a hairline-divided list.

## 5. Shape, Depth, Motion

- Radius scale: inputs 14 · small chips/badges 10–11 · buttons 8 (legacy `--` keep) or pill 34 · cards/phot tiles 20–22 · progress dots 999. Large friendly radii are part of the product feel — keep them consistent within a screen.
- Shadows: single soft ambient recipe, low opacity, warm-tinted: `0 10–16px 26–45px rgb(45 38 31 / 6–10%)`. Never glow, never dark hard shadows, never shadow-on-shadow. Elevation via radius + border is preferred; shadow is the accent.
- Borders: 1px `--home-line`; dashed 1.6–2px `#d5d0c2` only for dropzone/add-tile affordances.
- Motion: 150–260 ms `ease-out`; hover/press = `translateY(-1 to -2px)` + slightly stronger shadow; screen transitions = fade + 8 px rise (existing `home-screen-in`). Micro-interactions must degrade under `prefers-reduced-motion: reduce` (already global — keep it).
- Focus: visible `outline: 3px solid rgb(56 111 88 / 35%)` offset 3px — never remove.

## 6. Components

Inventory (reuse before creating): `ImageUploader`, `RecognitionResult`, `ActionSelector`, `StationSelector`, `Pipeline2Flow`, `ServiceCard(s)`, `ActionGuide`, `RuleResultView`.

- **Primary CTA** — `.home-analyze-button`: full-width, min-height 66–72 px, ink pill, label + `→` arrow, disabled = opacity .5. One primary CTA per screen.
- **Secondary button** — `.button-secondary`: white, 1px `#dce4dc`, green-dark text. Text-link button: `.text-button`, underline, accent color.
- **Card** — white, radius 20–22, padding 15–18, border or soft shadow (§4/§5).
- **Form field** — label above (12/700, `#6f7468`), input height 50–56 px, radius 14, 1px `#e4dfd2`, focus border `#97a886`. Selects get the inline SVG chevron, `appearance: none`.
- **Notice** — error `.notice-error` / caution `.confirm-caution` (amber) / info; icon circle + 12 px text, radius 12–14. Never red for warnings.
- **Step badge** — 36 px sage square (`.confirm-step-badge` pattern) with 800-weight number.
- **List row with divider** — `li + li { border-top: 1px solid #f0ede4 }`, leading check/icon circle 24 px sage.
- Icon chips (`.home-upload-icon`, `.confirm-photo-add-icon`, `.home-policy-icon`): 34–104 px circle or rounded square, `--home-cream`/`--sage-soft` fill, single-color stroke icon. Max one icon per label — no decorative icon rows.

## 7. Responsive & Mobile

- Design for 430 px first; verify 390 px and 320 px. Breakpoints: 440 px (compact phones), 560 px (frame goes full-bleed), 760 px (legacy Pipeline 2 desktop → mobile).
- Touch targets ≥ 44 × 44 px; buttons ≥ 48 px tall. Use `env(safe-area-inset-top)` for the header (already in place).
- No hover-dependent affordances; hover is progressive enhancement only.
- Horizontal overflow is a bug — `scrollWidth` must equal `clientWidth` at all breakpoints.

## 8. Accessibility Floors (non-negotiable)

1. Contrast per §2 — this audit found 11 violations; don't add more.
2. Functional text ≥ 11 px (§3).
3. Every icon-only button has `aria-label` (existing pattern).
4. State is announced: `role="status"`/`aria-live` for loading, `role="alert"` for errors.
5. `:focus-visible` rings intact; keyboard path mirrors pointer path.

## 9. Anti-Pattern Blacklist (AI-UI clichés — reject on sight)

Gradient everything · nested cards · eyebrow-chip-above-hero · 9–10 px text · muted gray-on-white body text below 4.5:1 · purple-blue palette by default · icon spam (3+ decorative icons in one row) · exaggerated glows/shadows · every-screen-different radius or spacing · bounce easing · decorative blob/orbit diviations on product screens · endless centered text stacks (center is for heroes/CTAs; forms and lists are left-aligned).

## 10. Screen-Specific Notes

- **Login:** use the JPHACK wordmark, moving-box illustration, and compact email/password card on a warm, light canvas. Keep administrator-provisioned Email + Password authentication; public self-registration is intentionally unavailable. Use original in-repository artwork and keep the complete form usable without scrolling at common phone heights where possible.
- **Inventory:** show the collection as a two-column grid of the user's real photos, item names, and state badges; derive status filters from saved item state and keep the photo-add action above the mobile safe area. Keep the collection focused on item name, analysis state, saved action, and completion status. Reuse the existing uploader and recognition-result/action-selector components for item details; do not create sample inventory data.
- **Recognition:** keep the existing photo row, editable item fields, olive condition ring (SVG, stroke `#4b5a3a`; amber `#c08a2d` at 3, red `#a8544a` ≤ 2), observation card, amber caution, and ink CTA.
- **Handling results:** use the existing Rule Engine, RuleResult, json-render Catalog/Registry/Renderer and legacy `rule-*` styles. Render the result for the user's chosen action, not the AI recommendation.
- Image recognition uses the configured real API; do not add a mock-mode switch or present sample analysis as a real result.
- Demo service records, when present, must remain explicitly labeled as mock data.
- Keep item registration/recognition independent of an action plan. Only evaluate rules and query nearby services after the user chooses an action for that saved item.

## 11. UI Work Workflow (mandatory for every UI task)

1. Read this file. Check §1 constraints and the relevant screen notes (§10).
2. Plan with **ui-ux-pro-max** (project skills at `.zcode/skills/`):
   - Style/palette/typography research: `python .zcode/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain style|typography|ux|icons`
   - Full system proposal: `python .zcode/skills/ui-ux-pro-max/scripts/search.py "<product description>" --design-system -p "<name>"`
   On Windows use `python` (not `python3`). It is offline/std-lib only.
3. Implement with existing components and tokens (§2–§6). Preserve IA and flows.
4. Refine with **impeccable** (`.zcode/skills/impeccable/`, engine at `scripts/bin/windows-x64/impeccable.exe`):
   - `impeccable.exe detect http://localhost:3000` — deterministic anti-pattern/contrast/legibility scan (must show **no new findings** vs. the 11 known legacy ones)
   - `impeccable.exe detect <file.css>` — quick regex-level pass
   - Skill commands (`critique`, `polish`, `typeset`, `layout`, `distill`, …) are invoked conversationally via the Skill tool once loaded — follow `SKILL.md` reference docs in that directory.
5. Verify in browser at 430 × 932 (and 390/320): screenshots, `domSnapshot`, interaction walk. Screenshots for anything visual.
6. Run `npm run typecheck && npm run lint && npm test` before reporting done.

*Legacy audits for reference:* baseline scan (2026-10-17) = 11 findings (2 undersized 9–10 px texts, 8 low-contrast muted texts, 1 hero-eyebrow chip). Fix these opportunistically when touching the owning screen; do not batch-redesign.
