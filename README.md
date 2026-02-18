# css-baseline-grid

CLI tool to check whether elements sit on a baseline grid, plus a plain CSS rhythm system.

## Quick start

```sh
git clone https://github.com/bkazez/css-baseline-grid.git
cd css-baseline-grid
npm install
node check-grid.mjs http://localhost:3000 --grid 24
```

## Example output

```
Baseline Grid Check
  url:       http://localhost:3000
  grid:      27.4px (from CLI --grid)
  origin:    h3 "Browse by Instrument" @ y=135.2
  tolerance: 1px

 OK   h3  "Browse by Instrument"                  line    0.00    +0.00px
 OK   h3  "Browse by Voicing"                     line    5.00    +0.02px
MISS  h3  "Off-Grid Heading"                      line   12.31    +8.49px
 OK   h1  "Page Title"                            line   81.00    +0.07px

4 checked: 3 OK, 1 MISS
```

Exit code 0 = all pass, 1 = any MISS.

## CSS setup

```html
<link rel="stylesheet" href="rhythm.css">

<style>
  :root {
    --grid: 1.5rem;  /* your line-height */
  }
</style>
```

`rhythm.css` zeros out browser default margins and sets `line-height: var(--grid)` on body. You set font sizes and spacing in your own stylesheet.

## Patterns

**rhythm** -- space text in grid multiples:

```css
/* Before: arbitrary margin */
h2 { margin-top: 2em; }

/* After: grid-aligned margin */
h2 { margin-top: calc(2 * var(--grid)); }
```

**rhythm-box** -- bordered containers that stay on-grid:

```css
/* Before: border pushes content off-grid */
.box {
  padding-top: 1.5rem;
  border-top: 1px solid #ccc;
}

/* After: subtract border from padding */
.box {
  padding-top: calc(var(--grid) - 1px);
  border-top: 1px solid #ccc;
}
```

## CLI reference

| Option | Description | Default |
|---|---|---|
| `--grid <px>` | Grid height in px | Auto-detect from `--grid` CSS custom property |
| `--origin <selector>` | Element whose top edge = grid line 0 | First matched element |
| `--selectors <list>` | Comma-separated CSS selectors | `h1,h2,h3,h4,h5,h6` |
| `--screenshot <path>` | Save full-page screenshot with red grid overlay | -- |
| `--auth <user:pass>` | HTTP basic auth | -- |
| `--viewport <WxH>` | Viewport dimensions | `1280x900` |
| `--tolerance <px>` | Max acceptable grid error | `1` |
| `--json` | Output JSON instead of table | -- |

## How it works

For each element matching `--selectors`, the tool computes `offset = element.top - origin.top`, then `gridError = (offset / gridPx - round(offset / gridPx)) * gridPx`. An element is on-grid when `|gridError| <= tolerance`.

## License

MIT
