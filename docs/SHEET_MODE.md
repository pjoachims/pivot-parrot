# Sheet mode (prototype)

Sheet mode shows the pivot result as a read-only, greyed range in a spreadsheet. The user types values and formulas in the free cells next to it. A host turns it on with `settings.enableSheetMode: true`. The table stays the default view.

## How it works

- `buildPivotGrid` (in `application/utils/export.ts`) builds the pivot's visual layout as rows of cells. The "Visual Layout" CSV export uses the same function.
- `domain/sheet/sheet.ts` holds the pure parts. `pivotRange` writes the grid from A1. `composeSheet` adds the user's cells. `editCell` keeps the pivot range read-only. `summarize` computes the status bar values.
- The user's cells are a map from A1 address to the typed text, for example `{ "K3": "=H3/H7" }`. They are in the store (`sheetCells`), and a saved view stores them as `view.sheet = { show, cells }`. A view without `sheet` loads as the table with no cells, so views saved before this change still load.
- When the pivot result changes, the sheet is built again from the new range and the same cells, so every formula recomputes.
- If the pivot grows over a user's cell, the pivot value shows in that cell. The user's cell stays in the state, and the status bar names it. When the pivot gets smaller again, the user's cell shows again.
- `presentation/sheet/SheetView.tsx` is loaded with `React.lazy`. The table mode does not load the spreadsheet code.

## Component decision (2026-10-23)

| Candidate | License | Latest version | Last release / commit | Min+gzip (measured with esbuild, React external) |
|---|---|---|---|---|
| Jspreadsheet CE | MIT (formula engine `@jspreadsheet/formula` 2.0.2: "MIT" in its file header) | 5.0.4 (npm, 2025-08) | commit 2026-10-14 | 131.6 KB JS, CSS separate |
| Fortune-sheet (`@fortune-sheet/react`) | MIT | 1.0.4 | release and last commit 2025-11-06 | 611 KB JS + 8.5 KB CSS |
| Univer (`@univerjs/presets` + sheets-core) | Apache-2.0 core (editing, formulas, formats). Univer Pro is commercial: collaboration, import/export, print, charts, pivot tables, enhanced formula engine (Univer README, "Open Source and Pro") | 1.2.0 | release 2026-10-22 | 2,764 KB JS |
| Handsontable, HyperFormula | Not free for commercial use (HyperFormula is GPL-3.0) | | | rejected |

Jspreadsheet CE is the choice. It is the smallest. It has cell formulas with ranges (`SUM`, `IF`), read-only cells, and A/B/C column headers with row numbers. Fortune-sheet was the first choice, but it is 4.6 times larger and has had no commit in about 11 months. Univer is 21 times larger.

## Bundle impact (measured)

- Library `dist/index2.js`: 307,461 B to 309,531 B (+2.1 KB raw, +0.6 KB gzip). The new lazy chunk `dist/SheetView.js` is 75.5 KB (16.8 KB gzip). Most of it is the jspreadsheet and jsuites CSS. `jspreadsheet-ce` is external, so the host bundles it.
- Demo app (Vite): main chunk +2.3 KB raw (+0.7 KB gzip). New lazy chunk `SheetView-*.js` is 564.5 KB (148.9 KB gzip). The browser downloads it only after the first switch to Sheet.

## Limits

- Formulas use absolute addresses. If the pivot's shape changes (another row or column field), `=H3/H7` still points to H3 and H7. There is no `GETPIVOTDATA`.
- The formula engine is the basic Jspreadsheet one. Division by zero shows `NaN`, not `#DIV/0!`. Jspreadsheet uses `eval` and `new Function`, so a page whose CSP has no `'unsafe-eval'` cannot run formulas.
- No undo across a pivot change: each new result builds the sheet again, which also resets scroll and selection.
- Number formats are generic: two decimals for pivot values, four for formula results, and percent for percentage metrics. The pivot's per-metric currency format is not used.
- The theme is light only. The dark theme leaves the grid light.
