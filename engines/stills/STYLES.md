# Style index

Eleven still styles in four groups (three each for groups 1–3, two for group 4; a twelfth, `mapcard`, is planned).
- **No sharing across groups:** each style belongs to one group only, so clients in different groups never share one.
- **Inside a group:** the roster (`engines/stills/library/roster.json`) keeps same-city clients apart.
- **Own typefaces:** each style owns its display face; no display face appears in two styles.
- **Loud by default:** every style was pushed to the thumb-stop bar (saturated field or deep ground, one giant focal element). Front Page is the one quieter, editorial style, and it still carries a reverse-type or accent device.

| Group (family) | Style | Slug | Type | Signature device | Loudness | Best for |
|---|---|---|---|---|---|---|
| 1 Ledger · precise, numeric | Swiss Data Poster | `swiss` | Archivo (widths 86–115) | Full-bleed field that changes every slide; a payment disc whose area is the payment and whose ring is the hike; a bar that walks one grid column per slide | Loud | Payment maths, rate-day numbers |
| 1 | Terminal Card | `terminal` | Martian Mono | Dark market-terminal panel: command-line headline, dated data table, zero-based "fork" chart with a crosshair readout in the client colour | Loud | Rate calls, odds, prime and bond moves |
| 1 | Bento Ledger | `bento` | Mona Sans | Square tiles of unequal size, one hero tile in the client colour; every bar on a slide drawn to one shared scale | Medium-loud | Deadlines, rule summaries, single-post tip cards |
| 2 Kitchen Table · warm, human | Editorial Cover | `magazine` | Bodoni Moda + Schibsted Grotesk | A newsstand cover: masthead from the series, city edition line, cover lines with real slide numbers, a giant Bodoni figure (or the client photo once supplied) | Loud | Money stories, case studies |
| 2 | Marker Markup | `annotated` | Familjen Grotesk + Nanum Pen Script | A code-drawn phone with a generic lender notification (or the client's photo once supplied), circled and arrowed in felt-tip on a full accent field | Loud | "Look at this letter/alert" posts, face-led accounts |
| 2 | Paper Cut-out | `cutout` | Young Serif + Rethink Sans | Torn construction-paper strips and flat cut objects on a mustard or sky board, tight real shadows, scraps that cross into the next slide | Loud | Family money, first-time buyers, gentle explainers |
| 3 Riso · loud print | Riso Two-Ink | `riso` | Bricolage Grotesque + Space Mono | A real two-plate print pass: halftone screens, seeded misregistration, two translucent inks overprinting into a third | Loud | Renewal and rate explainers |
| 3 | Poster Type | `bold-type` | Big Shoulders | Lines set edge to edge, the field flipping accent/ink/paper per slide, emphasis on a full-bleed band; every line tagged `data-k` for animation | Loud | Hooks, myths, one-number punches |
| 3 | Iso Blocks | `isometric` | Red Hat Display + Red Hat Mono | three.js isometric clay models on a loud field, volumes sized from the numbers, HTML labels on projected leader lines | Loud | Comparisons of amounts, "two ways" stories |
| 4 Dossier · evidence, record | Paper Trail | `paper-trail` | Courier Prime + IBM Plex Sans Condensed | A generic document (statement, gift letter, slip, bill of sale) on a deep desk, stamped ILLUSTRATIVE, the line that matters circled in red pencil | Loud | Documentation, statements, letters |
| 4 | Front Page | `broadsheet` | UnifrakturMaguntia (nameplate) + Libre Franklin + Newsreader | A fictional front page named after the series: dateline, columns, chart as the news photo, "Continued on slide N" jumps; reverse-type blocks in variant b | Quieter (editorial) | News pegs: budget, rate decisions, local market reports |
| 4 (planned) | Transit Map | `mapcard` | Overpass + Overpass Mono | Schematic route map of regions with data stops, "schematic, not to scale" | — | Local market posts (until built, use `broadsheet`) |

## Roster

`library/roster.json` maps each client to a group, a primary and a secondary style, and a variant (a/b). The repo ships an example roster: one fully set-up fictional client, **Northline Mortgages** (Sam Rivera, Toronto; group 1, `swiss` primary, `terminal` secondary, variant a, tokens in `tokens/clients/northline-mortgages.json`), plus placeholder entries in other cities that show how the same-city and same-metro rules work. Replace them with your own clients.

How to fill it:
- Give each group's styles to clients in different cities first. Two clients in the same city never share a style; two in the same metro (for example the GTA) share one only on different variants.
- Several clients in one big city should sit in different groups, so they get different styles.
- Each client needs a token file (`tokens/clients/<id>.json`) before it can render.

## Legacy group families

The first prototype's four CSS families (`styles/family-*.css`: Ledger, Kitchen Table, Riso, Dossier) still render through `render.mjs` for old specs, but they don't meet the thumb-stop bar and are superseded:
- Ledger → swiss/terminal/bento
- Kitchen Table → magazine/annotated/cutout
- Riso → riso/bold-type/isometric
- Dossier → paper-trail/broadsheet

Write new specs for the library (`"engine": "library"`).

Each style's rules: `library/<slug>/STYLE.md`. How to build or change one: `AUTHORING.md`. How to choose and ship: `.claude/skills/stills/SKILL.md` (from the repo root). The gate: `QA.md`.
