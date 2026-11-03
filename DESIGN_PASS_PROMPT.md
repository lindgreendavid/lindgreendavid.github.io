# Design pass prompt (written by Claude for itself, 2026-11-03)

Task from David: go through every page of the site and make it look clean, calm and designed by a person: nothing overlapping or clipped, everything logical, and less "Claude-y". Do the work, then report. Nothing is pushed or deployed without his yes.

## 0. Ground rules
1. Read `../standards/AGENT_STANDARDS.md` (section 5 design rules, section 7 verification), `../PRODUCT.md`, `src/styles/global.css` tokens, `src/styles/projects.css`. The standards win if anything here differs.
2. Use the installed Impeccable plugin (v4.5.0, do not update): `critique` and `audit` first, then `layout`, `typeset`, `polish`, `distill`, `harden`, `adapt` as needed. `impeccable detect --json src` must return `[]` at the end. Emil Kowalski's motion rules and the Taste Skill house rules are applied by hand (not installed). Install nothing.
3. Change presentation only. Do not change facts, numbers, model logic, test counts, status wording ("Version 1.0.x", "not independently reviewed"), disclosure of AI assistance or the "Planned" labels. If a layout fix needs copy to be shorter, shorten without changing the claim.
4. Least code that works. Prefer deleting CSS and markup to adding it. Tokens only for colour (light and dark). No new dependencies, fonts, trackers or CDNs.

## 1. Pages and states to cover (every one, light and dark)
`/` (hero, chart, pillars, work, experience, heading, contact, footer); `/projects/`; the five project pages (pharma, research assistant, M&A screening, LBO workbench, credit risk screen); the five method notes `/projects/<slug>/method/`; `/impressum/`, `/datenschutz/`, `/cookies/`; the 404 page if present.
Interactive states: forms and sliders, tabs/details, tables, heatmaps, charts after changing an input, the LBO and credit tools after a change, error and empty states, focus, hover (pointer devices only), reduced motion, JavaScript off.
Widths: 320, 375, 390, 768, 1024, 1440, 1920.

## 2. Defects to hunt (fix each at its cause)
- Overlap, clipping, truncated labels, text over a chart line, axis labels touching data, legends over bars.
- Horizontal scroll at any width; tables wider than their panel without a scroll wrapper and a visible hint.
- Panels of unequal height that look accidental; orphaned single words; awkward line breaks in headings; wide empty columns.
- Inconsistent spacing: section gaps must exceed inner gaps; equal outer margins; one panel radius (28px), one button shape (fully round).
- Inconsistent type: five sizes at most, one family, 45 to 75 characters per line for prose, 16px minimum body.
- Dense walls of text on project pages: split with headings, short paragraphs, and move detail behind `<details>` (overview first, depth on click). Check that the first screen of each page says what it is, what it shows and what to do.
- Hierarchy: one clear primary action per screen; secondary actions visibly quieter; links that look like links.
- Controls: 44px targets, visible focus, labels that name the action, units next to inputs, sensible defaults, error text that says how to fix it.
- Charts: readable at 320px, no text under 11px, labelled axes or labelled values, colour never the only signal, `role="img"` with a useful label.
- Tables: right-aligned numbers, consistent decimals, sticky first column only if it helps, caption present.

## 3. Things AI-made sites do that this one must not
(Remove any that are present; do not add any.)
- Eyebrows and small uppercase tracked labels; 01/02/03 numbering; "Step 1" badges used as decoration.
- Rows of identical cards; icon-topped feature cards; emoji or decorative shapes; stat tiles with a big number and a vague caption.
- Gradients (except a scrim under text on a photo); glow; glassmorphism and backdrop blur; resting shadows; 1px outlined boxes and hairline dividers between every section.
- Side-border "callout" cards; pill badges on everything; coloured chips with no meaning.
- Violet, indigo or purple-to-blue palettes; yellow-cream with terracotta; neon accents.
- Centred hero with a gradient headline and two buttons; "Welcome to my portfolio"; marketing superlatives.
- Copy tells: "seamless", "leverage", "unlock", "robust", "cutting-edge", "delve", "in today's world", "not just X, but Y", triplet lists in every sentence, em dashes used as a rhythm device, headings phrased as slogans, exclamation marks, rhetorical questions as headings.
- Over-explaining: three sentences where one works; a caption that repeats the heading; a "How it works" block that restates the nav.
- Decorative motion: bouncing, parallax, looping animation, entrance animation on everything. Motion only where it explains or confirms (ease-out, under 300ms for UI, `scale(0.97)` press, `transform` and `opacity` only, fades only with reduced motion).
- Placeholder or fake imagery; invented logos, quotes or users.
- Generic stock layout rhythm (hero, three features, testimonial, CTA). Layout should follow the content: what a visitor needs first.

## 4. What "good" looks like here
Light, airy, calm: one ground, one ink, one accent, surfaces separated by tone. Type does the work (size, weight, spacing), not decoration. Whitespace is generous and consistent. A finance reader should find, in seconds: who David is, what each project does, one chart that explains it, the limits, and where to download or reproduce it. Pages read like a careful analyst's notes, not a product landing page. Honest status words stay visible but quiet.

## 5. Method
1. Start the dev server with `preview_start` (`portfolio`). Restart it after structural changes.
2. Capture every page at 375, 768 and 1440 in light and dark (headless Edge with `--virtual-time-budget=8000` for settled shots; real pane for narrow widths and dark). Open and read every screenshot. Write a defect list with page, width and cause.
3. Fix by cause, in this order: global tokens and spacing, then shared components (`MiniBars`, `ProjectFlow`, `ProjectUses`, panels, tables, forms), then page specifics, then copy trims.
4. After each batch: `npm test` (117 pass), `ASTRO_TELEMETRY_DISABLED=1 npm run build`, `impeccable detect --json src` returns `[]`, re-capture and re-read the changed pages.
5. Final checks: keyboard through every page, JavaScript off, reduced motion, measured contrast on text over tinted panels and chart colours, no console errors.

## 6. Report (short)
What changed (files), what was verified and how, what was not checked, what David must decide, any risk. Include before and after screenshots for the pages that changed most. Commit locally with a clear message; do not push.
