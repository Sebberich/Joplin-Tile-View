# Formula Tables

A Joplin plugin that adds formulas to standard Markdown tables, with
**explicit types and no auto-detection**. A cell only has a type when it
carries one explicitly (`date{...}`, `time{...}`, `eur{...}`, a plain
number, ...), and a cell is only calculated when it starts with `=`.

Notes stay plain Markdown, so they still make sense without the plugin, on
desktop, on mobile (Joplin ≥ 3.0, Android), and after sync.

Two content scripts do the work:

- **Renderer** (markdown-it): evaluates formulas when a note is displayed
  and shows the result in the cell.
- **Editor** (CodeMirror 6): highlights literals/formulas as you type and
  shows the computed result as `→ result` right after each formula cell -
  so filling in a table on a phone never requires switching to the viewer.
  It also adds a "Stempeln" ("insert current time") command/toolbar button
  and an "insert current date+time" command.

## Syntax

No auto-detection: a value only has a type if it is written with one, and
only cells starting with `=` are calculated.

| Writes as | Type | Notes |
|---|---|---|
| `12`, `1,5`, `1.5`, `-3` | number | comma or dot as decimal separator |
| `date{23.09.2026}`, `date{23.9.26}` | date | `.` = always D.M.Y; 2-digit year = 2000+y |
| `date{23.09.}` | date | no year = current year |
| `date{2026-09-23}` | date | `-` = always ISO Y-M-D |
| `date{23.09.2026 14:05}` | datetime | date + time of day |
| `time{14:05}` | time of day | `HH:MM` or `HH:MM:SS`, no unit |
| `time{1,5h}`, `time{1.5h}`, `time{90min}`, `time{45m}`, `time{2h30min}`, `time{1:30h}` | duration | any value with an `h`/`min`/`m` unit |
| `eur{12,50}`, `usd{...}`, `chf{...}`, `gbp{...}` | currency | no conversion between currencies |
| `now` | datetime | evaluated live, at render time |
| `A1`, `B2:B9` | cell reference / range | column letters, row 1 = first row below the header; ranges only inside function args |
| `[Kommen]` | cell reference | the cell in the column whose header text equals `Kommen` (case-insensitive), same row as the formula |

Operators: `+ - * /`, parentheses, unary minus.
Functions: `sum{...}`, `sqrt{...}`, `min{...}`, `max{...}`, `avg{...}`,
`round{x; digits}`. Function arguments are separated by `;` (`,` is a
decimal separator, not an argument separator).

## Example: time tracking ("Stempeluhr")

```markdown
| Tag              | Kommen      | Gehen       | Dauer                |
|------------------|-------------|-------------|----------------------|
| date{22.09.2026} | time{08:12} | time{16:40} | =[Gehen] - [Kommen]  |
| date{23.09.2026} | time{08:05} | now         | =[Gehen] - [Kommen]  |
| **Summe**        |             |             | =sum{D1:D2}          |
```

`now` is evaluated live - handy for "currently clocked in". To clock out,
use the editor's "Stempeln" command/toolbar button, which inserts a fixed
`time{16:40}` (or `date{23.09.2026 16:40}` with the second command) instead
of `now`, since a live `now` would keep changing every time the note is
opened or re-rendered.

Other examples:

```markdown
| Item        | Preis        | Menge | Summe            |
|-------------|--------------|-------|------------------|
| Kaffee      | eur{3,50}    | 2     | =[Preis]*[Menge] |
| Stundenlohn | eur{12,50}   |       | =time{1,5h} * [Preis] |
```

## Type rules

Anything not covered below is a **`#TYPE`** error - shown in red - instead
of a guessed result.

- number `op` number → number
- date − date → duration; datetime − datetime → duration
- datetime/date ± duration → datetime
- time ± duration → time (wraps within 0:00-23:59)
- time − time → duration, wraps within 24h if negative (e.g. `23:00 → 01:00` = `2:00 h`)
- datetime − time / time − datetime → duration, using the datetime's time-of-day
  part (this is what makes `now - time{08:05}` work in the Stempeluhr example above -
  see "Design decisions" below)
- duration ± duration → duration
- duration × number, number × duration → duration; duration / number → duration; duration / duration → number
- currency ± currency (same currency only) → currency
- currency × number, number × currency → currency; currency / number → currency
- duration × currency, currency × duration → currency (hourly rate: `1,5h × 12,50 € = 18,75 €`)
- `sqrt{...}` only on numbers
- `sum{...}` / `min{...}` / `max{...}` / `avg{...}` on a homogeneous list
  (all numbers, all durations, or all the same currency); empty and text
  cells in the range are skipped

Errors: division by zero → `#DIV/0`; unknown cell/header reference →
`#REF`; cannot parse the formula or a literal → `#SYNTAX`; a formula that
(in)directly refers to itself → `#CIRC`.

## Formatting

- number: up to 2 decimals, trailing zeros trimmed, decimal separator per setting
- duration: `H:MM h` (e.g. `7:45 h`; negative: `-0:15 h`)
- date: `DD.MM.YYYY`
- datetime: `DD.MM.YYYY HH:MM`
- time: `HH:MM`
- currency: `12,50 €` / `12.50 $` (always 2 decimals)

## Settings

- **Decimal separator** (`,` or `.`, default `,`): used when formatting
  numbers and currency amounts. Parsing always accepts both `,` and `.`
  regardless of this setting.

## Design decisions / open questions

These are called out explicitly rather than left implicit, per
`docs/KONZEPT.md`:

- **Year-less dates and the turn of the year.** `date{28.12.}` always
  means 28 December of the *current* year, even if that is more than six
  months in the past (e.g. when typed in July). The plugin does **not**
  roll such a date into the previous/next year - "current year" is taken
  literally, on the theory that a note is far more often about looking
  back at *this* year than at silently guessing a different one.
- **`datetime − time`.** `KONZEPT.md`'s own type-rule table does not list
  this combination, but its own Stempeluhr example needs it (`now` is a
  datetime; `time{08:05}` is a time of day). This plugin adds the rule
  by using only the datetime's time-of-day component, with the same 24h
  wrap-around as `time − time`.
- **Currency rounding.** All currency arithmetic rounds to 2 decimals
  (cents) at each step; there is no separate "display rounding only" mode.
- **Which currencies.** Only EUR, USD, CHF and GBP are built in (per the
  spec: "further currencies as needed"). Currencies are never converted
  into one another; mixing them is a `#TYPE` error.
- **Duration display.** Durations always render as `H:MM h`; there is no
  per-column setting for `7,75 h` decimal-hours style, and no per-column
  formatting overrides in general.

## Limitations

- The tile/grid preview shows raw Markdown text, i.e. formulas rather than
  results (this plugin only affects the note viewer and editor).
- The Rich Text editor does not understand this syntax; edit tables in the
  Markdown/Code View editor.
- `now` is evaluated when the note is rendered; the viewer does not
  periodically re-render on its own, so a note showing `now` will not
  visibly tick forward while simply left open.

## Install

1. Download the `.jpl` file from the
   [GitHub releases](https://github.com/Sebberich/Joplin-Tile-View) page
   (or build it yourself, see below).
2. In Joplin: **Options/Settings → Plugins → Install from file**, then pick
   the downloaded `.jpl` file.
3. Restart Joplin if prompted.

## Development

```
npm install
npm test     # jest unit tests for src/core and the markdown-it renderer
npm run lint # tsc --noEmit
npm run dist # builds publish/com.sebberich.formulaTables.jpl
```

`src/core` is plain TypeScript with no DOM or Joplin dependency (parser,
evaluator, formatter, table addressing), so it is fully unit-testable on
its own. `src/contentScripts` adapts that core logic to markdown-it and to
a CodeMirror 6 `ViewPlugin`.
