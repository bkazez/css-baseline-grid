# css-baseline-grid

Print typography has obeyed baseline grids for centuries. Web typography never has. This changes that. Inspired by Robert Bringhurst's *The Elements of Typographic Style*.

**[See the live demo](https://bkazez.github.io/css-baseline-grid/)** — three font sizes, one baseline grid.

## The JS technique — baseline correction across font sizes

CSS has no way to read font metrics. Different font sizes place the baseline at different positions within the same line box, so headings and body text land on different grids. No amount of `calc()` can fix this in pure CSS.

The fix is a runtime probe: insert a zero-height `inline-block` with `vertical-align: baseline` into any element and its `.getBoundingClientRect().top` gives you the baseline Y in page pixels. Compare each element's baseline offset to the body text reference, then apply the difference: reduce `margin-top`, add `padding-bottom` by the same amount. The swap shifts the text onto the grid without changing the element's total box height, so subsequent elements stay aligned.

```js
function getBaselineY(el) {
  const probe = document.createElement("span");
  probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
  el.insertBefore(probe, el.firstChild);
  const y = probe.getBoundingClientRect().top;
  probe.remove();
  return y;
}

function getBaselineOffset(el) {
  return getBaselineY(el) - el.getBoundingClientRect().top;
}

function alignBaselines(gridPx) {
  const ref = document.createElement("p");
  ref.textContent = "x";
  ref.style.cssText = "position:absolute;visibility:hidden";
  document.body.appendChild(ref);
  const refOffset = getBaselineOffset(ref);
  ref.remove();

  document.querySelectorAll("h1, h2, h3, h4, h5, h6, p").forEach(el => {
    const elOffset = getBaselineOffset(el);
    const raw = elOffset - refOffset;
    const correction = ((raw % gridPx) + gridPx) % gridPx;
    if (correction === 0) return;

    const currentMargin = parseFloat(getComputedStyle(el).marginTop);
    el.style.marginTop = (currentMargin - correction) + "px";
    el.style.paddingBottom = correction + "px";
  });
}
```

See `index.html` for a working example with mixed heading sizes.

## check-grid — the baseline evaluator

Point it at any URL and it measures actual text baselines — not CSS box edges — to tell you what's on-grid and what isn't. Designed for both humans and LLMs: structured output, `--json` mode, and exit codes so an AI coding agent can check and fix baseline alignment in a build loop.

```sh
npm install css-baseline-grid
node check-grid.mjs http://localhost:3000 --grid 24
```

```
Baseline Grid Check
  url:       http://localhost:3000
  grid:      24px (from CSS --grid)
  origin:    h1 "Page Title" baseline @ y=65
  tolerance: 1px

 OK   h1  "Page Title"                  line    0.00    +0.00px
 OK   p   "First paragraph"             line    2.00    +0.00px
MISS  h2  "Off-Grid Heading"            line   12.31    +8.49px
 OK   h3  "On-Grid Heading"             line   81.00    +0.00px

4 checked: 3 OK, 1 MISS
```

Exit code 0 = all pass, 1 = any MISS.

### CLI reference

| Option | Description | Default |
|---|---|---|
| `--grid <px>` | Grid height in px | Auto-detect from `--grid` CSS custom property |
| `--origin <selector>` | Element whose baseline = grid line 0 | First matched element |
| `--selectors <list>` | Comma-separated CSS selectors | `h1,h2,h3,h4,h5,h6` |
| `--screenshot <path>` | Save full-page screenshot with red grid overlay | — |
| `--auth <user:pass>` | HTTP basic auth | — |
| `--viewport <WxH>` | Viewport dimensions | `1280x900` |
| `--tolerance <px>` | Max acceptable grid error | `1` |
| `--json` | Output JSON instead of table | — |

## CSS utilities

`rhythm.css` is a starting point, not a complete solution. Baseline grids on the web are inherently fiddly — every border, padding, and font-size change can knock things off-grid. The CSS gives you the foundation (margin resets, `line-height: var(--grid)`, monospace line-height fix), but expect to need per-project adjustments. The evaluator above is what tells you when something drifts.

```html
<link rel="stylesheet" href="rhythm.css">

<style>
  :root {
    --grid: 1.5rem;  /* your line-height */
  }
</style>
```

### Patterns

**rhythm** — space text in grid multiples:

```css
h2 { margin-top: calc(2 * var(--grid)); }
```

**rhythm-box** — bordered containers that stay on-grid:

```css
.box {
  padding-top: calc(var(--grid) - 1px);
  border-top: 1px solid #ccc;
}
```

## License

MIT
