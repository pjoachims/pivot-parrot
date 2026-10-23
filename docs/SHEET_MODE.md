# Sheet mode (prototype)

Sheet mode shows the pivot result as a read-only range in a spreadsheet, styled by area like an Excel PivotTable. The user types values and formulas in the free cells next to it. A host turns it on with `settings.enableSheetMode: true`. The table stays the default view.

## How it works

- `buildPivotGrid` (in `application/utils/export.ts`) builds the pivot's visual layout as rows of cells. The "Visual Layout" CSV export uses the same function. It also says what each row is (`header`, `item`, `group` with its expansion key and open state, `total`) and what each column is (`label`, `value`, `subtotal`, `total`).
- Row groups open and close like in the table. A group row has a ⊞ or ⊟ in front of its label. A click on it toggles the same open state the table uses (`expanded` in the store, keyed by `rowKey`), so switching between Table and Sheet keeps it. The sheet builds again from the grid with only the open groups' rows.
- Column groups open and close in both views with the table's own column folding (`useColumnCollapse`, `domain/pivot/columnFit.ts`). The state is `collapsedColumns` and `expandedColumns` in the store, each a list of `columnPathKey` of a member path (`["Tech"]`). Each group of every column field but the innermost has a toggle in its header: a chevron in the table, ⊞/⊟ in the sheet. Both call the same `toggle`, so a group closed in one view is closed in the other.
- The display data is built once from that state (`usePivotDisplay`), with the groups folded to fit the 100-column limit already applied. A collapsed group is one leaf per metric in the data (`isCollapsed`), the CUBE row at the group's level, which the pivot query already returns: a collapse sends no query, and avg, count distinct, median or a ratio metric are computed by the engine, never added up in the browser. `tests/e2e/collapsed-columns.e2e.test.ts` checks each DuckDB aggregation against a direct `GROUP BY` at the group's level. The sheet shows exactly the table's columns, so it cannot grow past the limit either. When a group cannot open without passing the limit, the sheet shows the table's notice.
- `buildPivotGrid` reads the column groups from the leaves (`columnPath`, `isCollapsed`) and lists the header cells that get a toggle (`columnGroups`, with `columnPathKey` as key and whether the group is open). A collapsed group's columns are `value` columns, as the table styles them.
- Totals follow the table everywhere. `displayTotals(config)` (in `application/utils/displayTotals.ts`) reads the settings dialog's "Subtotals" (`config.subtotals`) and "Grand Totals" (`config.grandTotals`), each `both`, `row`, `col` or `none`, default `both`. The table, the column-limit count, the sheet, the "Visual Layout" CSV and the debug ZIP's expected output use it. `config.showGrandTotal`, which the sheet and the CSV read before, is not read any more.
- The "Visual Layout" CSV (`layoutCSV`) applies the same totals and the column groups as the table shows them, but writes every row group open. The table's rows start closed, so a CSV that followed the open rows would by default hold only the top-level rows.
- While the cell editor is open, a click on a toggle is a click on its cell: in point mode it picks the cell as a reference, as Excel does, otherwise jspreadsheet closes the editor. The toggle does not take focus, so the arrow keys move the selection as before.
- `pivotCellStyle` (in `domain/sheet/sheet.ts`) gives each pivot cell its role from its row and column: `header` (column members and metric names), `rowLabel`, `value`, `subtotal` (a group row or a column subtotal, bold) and `grandTotal` (bold, with a rule above the grand-total row and left of the grand-total column). The view writes it as `data-role` on the cell. The user's cells have no role and keep the plain surface.
- Colours come from the theme tokens. Each area is a step of `--color-accent` mixed into `--surface-bg`. The grid, its headers, the selection and the cell editor use jspreadsheet's theme variables (`jspreadsheet.themes.css`) set from the same tokens, so the dark theme shows a dark grid.
- `domain/sheet/sheet.ts` holds the pure parts. `pivotRange` writes the grid from A1. `composeSheet` adds the user's cells. `editCell` keeps the pivot range read-only. `summarize` computes the status bar values.
- The user's cells are a map from A1 address to the typed text, for example `{ "K3": "=H3/H7" }`. They are in the store (`sheetCells`), and a saved view stores them as `view.sheet = { show, cells }`. A view without `sheet` loads as the table with no cells, so views saved before this change still load.
- When the pivot result changes, the sheet is built again from the new range and the same cells, so every formula recomputes.
- If the pivot grows over a user's cell, the pivot value shows in that cell. The user's cell stays in the state, and the status bar names it. When the pivot gets smaller again, the user's cell shows again.
- Point mode works like Excel. While the cell editor holds a formula and the caret sits after `=`, an operator, `(`, `,` or `:`, a click on a cell or an arrow key puts that cell's address into the formula. More arrow keys move the reference, and shift (click or arrow) makes it a range. Pivot cells can be picked. Jspreadsheet CE 5 has no point mode: a click on another cell closes the editor, and arrow keys only move the caret. `domain/sheet/formula.ts` holds the text rules (`referenceSlot`, `putReference`, `formulaReferences`), and `SheetView` catches the click and the arrow key before jspreadsheet does.
- The references of the formula being edited, or of the selected formula cell, get a coloured outline, one colour per reference.
- Jspreadsheet's `secureFormulas` option upper-cases a formula outside its double-quoted text on entry, so `=c25/c21` is stored and computed as `=C25/C21`. Its reference pattern is upper case only.
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
- No undo across a pivot change: each new result or toggled group builds the sheet again.
- Number formats are generic: two decimals for pivot values, four for formula results, and percent for percentage metrics. The pivot's per-metric currency format is not used.
- Point mode works only in the cell editor, not in the formula bar. A range is picked with shift, not by dragging.
- Formulas with fixed addresses shift when a group opens or closes. Opening or closing a group above the formula's row moves the pivot rows, so `=B3` points at another member afterwards. The test `a formula with a fixed address points at another row once a group above it closes` in `presentation/sheet/__tests__/PivotSheet.toggle.test.tsx` shows it.
- Formulas with fixed addresses also shift when a column group opens or closes. Closing a group left of the formula's column moves the pivot columns, so `=H4` points at another column afterwards. The test `a formula with a fixed address points at another column once a column group left of it closes` in `presentation/sheet/__tests__/PivotSheet.columns.test.tsx` shows it.
- A grand-total column is headed apart from the table. The sheet writes "Grand Total" on the top header line and its metric on the last, the lines between stay empty; the table repeats "Grand Total" on every line above the metric. With Σ Values in rows the table heads that column "Total", the sheet "Grand Total". Every other header line, toggle and cell role is the table's wherever Σ Values sits (first, between or last in the columns, or in the rows): `presentation/sheet/__tests__/sheetHeaders.test.tsx` compares them with the rendered `ColumnHeaders`.
- No keyboard shortcut toggles a group. A click is the only way.
- A rebuild keeps the scroll position, but not the selection.
