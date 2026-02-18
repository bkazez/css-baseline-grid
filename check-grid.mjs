#!/usr/bin/env node

import puppeteer from "puppeteer";

const DEFAULTS = {
  selectors: "h1,h2,h3,h4,h5,h6",
  viewport: "1280x900",
  tolerance: 1,
  textTruncate: 40,
};

// --- CLI arg parsing ---

function printUsage() {
  console.log(`
Usage: check-grid [options] <url>

Options:
  --grid <px>          Grid height in px (default: auto-detect from --grid CSS custom property)
  --origin <selector>  Element whose baseline = grid line 0 (default: first matched element)
  --selectors <list>   Comma-separated CSS selectors to check (default: ${DEFAULTS.selectors})
  --screenshot <path>  Save full-page screenshot with red grid overlay
  --auth <user:pass>   HTTP basic auth
  --viewport <WxH>     Viewport dimensions (default: ${DEFAULTS.viewport})
  --tolerance <px>     Max acceptable grid error in px (default: ${DEFAULTS.tolerance})
  --json               Output JSON instead of table
  --help               Show this message
`.trim());
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const config = {
    url: null,
    grid: null,
    origin: null,
    selectors: DEFAULTS.selectors,
    screenshot: null,
    auth: null,
    viewport: DEFAULTS.viewport,
    tolerance: DEFAULTS.tolerance,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      case "--grid":
        config.grid = parseFloat(args[++i]);
        break;
      case "--origin":
        config.origin = args[++i];
        break;
      case "--selectors":
        config.selectors = args[++i];
        break;
      case "--screenshot":
        config.screenshot = args[++i];
        break;
      case "--auth":
        config.auth = args[++i];
        break;
      case "--viewport":
        config.viewport = args[++i];
        break;
      case "--tolerance":
        config.tolerance = parseFloat(args[++i]);
        break;
      case "--json":
        config.json = true;
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        config.url = arg;
    }
  }

  if (!config.url) {
    printUsage();
    process.exit(1);
  }

  return config;
}

// --- Core measurement ---

async function measure(page, config) {
  const selectorList = config.selectors;
  const originSelector = config.origin;
  const explicitGrid = config.grid;

  return page.evaluate(
    ({ selectorList, originSelector, explicitGrid }) => {
      // Detect first-line baseline Y (page coords) via zero-height inline-block probe.
      // The probe's bottom edge aligns to the parent's baseline; at height 0, top = bottom = baseline.
      function getBaselineY(el) {
        const probe = document.createElement("span");
        probe.style.cssText =
          "display:inline-block;width:0;height:0;vertical-align:baseline";
        el.insertBefore(probe, el.firstChild);
        const y = probe.getBoundingClientRect().top + window.scrollY;
        probe.remove();
        return y;
      }

      // Detect grid from CSS custom property
      let gridPx = explicitGrid;
      if (!gridPx) {
        const gridValue = getComputedStyle(document.documentElement)
          .getPropertyValue("--grid")
          .trim();
        if (gridValue) {
          const temp = document.createElement("div");
          temp.style.cssText = `position:absolute;visibility:hidden;height:${gridValue}`;
          document.body.appendChild(temp);
          gridPx = temp.getBoundingClientRect().height;
          temp.remove();
        }
      }

      if (!gridPx) {
        return { error: "Could not detect grid size. Use --grid <px> or set --grid CSS custom property." };
      }

      const gridSource = explicitGrid ? "CLI --grid" : "CSS --grid";

      // Find origin element
      let originEl = null;
      if (originSelector) {
        originEl = document.querySelector(originSelector);
        if (!originEl) {
          return { error: `Origin selector "${originSelector}" matched no elements.` };
        }
      }

      // Gather all matching elements
      const selectors = selectorList.split(",").map((s) => s.trim());
      const combined = selectors.join(",");
      const elements = Array.from(document.querySelectorAll(combined));

      // Filter to visible elements
      const visible = elements.filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.width > 0;
      });

      if (visible.length === 0) {
        return { error: `No visible elements found for selectors: ${selectorList}` };
      }

      if (!originEl) {
        originEl = visible[0];
      }

      const originBaseline = getBaselineY(originEl);
      const originText = (originEl.textContent || "").trim().substring(0, 40);
      const originTag = originEl.tagName.toLowerCase();
      const originDesc = {
        tag: originTag,
        text: originText,
        baseline: Math.round(originBaseline * 100) / 100,
      };

      // Measure each element's first-line baseline against the grid
      const measurements = visible.map((el) => {
        const baseline = getBaselineY(el);
        const offset = baseline - originBaseline;
        const gridLines = offset / gridPx;
        const gridError = (gridLines - Math.round(gridLines)) * gridPx;

        const text = (el.textContent || "").trim().substring(0, 40);
        const tag = el.tagName.toLowerCase();

        return {
          tag,
          text,
          baseline: Math.round(baseline * 100) / 100,
          gridLines: Math.round(gridLines * 100) / 100,
          gridError: Math.round(gridError * 100) / 100,
        };
      });

      return {
        measurements,
        origin: originDesc,
        originBaseline: Math.round(originBaseline * 100) / 100,
        detectedGrid: Math.round(gridPx * 100) / 100,
        gridSource,
      };
    },
    { selectorList, originSelector, explicitGrid }
  );
}

// --- Output formatting ---

function formatTable(results, config) {
  const lines = [];

  lines.push("Baseline Grid Check");
  lines.push(`  url:       ${config.url}`);
  lines.push(
    `  grid:      ${results.detectedGrid}px (from ${results.gridSource})`
  );
  lines.push(
    `  origin:    ${results.origin.tag} "${results.origin.text}" baseline @ y=${results.origin.baseline}`
  );
  lines.push(`  tolerance: ${config.tolerance}px`);
  lines.push("");

  let okCount = 0;
  let missCount = 0;

  for (const m of results.measurements) {
    const absError = Math.abs(m.gridError);
    const pass = absError <= config.tolerance;
    const status = pass ? " OK " : "MISS";

    if (pass) okCount++;
    else missCount++;

    const sign = m.gridError >= 0 ? "+" : "";
    const text = m.text.padEnd(DEFAULTS.textTruncate);
    const lineNum = m.gridLines.toFixed(2).padStart(8);
    const error = `${sign}${m.gridError.toFixed(2)}px`;

    lines.push(`${status}  ${m.tag.padEnd(3)}  "${text}"  line${lineNum}    ${error}`);
  }

  const total = results.measurements.length;
  lines.push("");
  lines.push(`${total} checked: ${okCount} OK, ${missCount} MISS`);

  return lines.join("\n");
}

function formatJSON(results, config) {
  const output = {
    url: config.url,
    grid: results.detectedGrid,
    gridSource: results.gridSource,
    origin: results.origin,
    tolerance: config.tolerance,
    measurements: results.measurements.map((m) => ({
      ...m,
      pass: Math.abs(m.gridError) <= config.tolerance,
    })),
  };
  return JSON.stringify(output, null, 2);
}

// --- Screenshot with grid overlay ---

async function screenshot(page, gridPx, originBaseline, path) {
  await page.evaluate(({ gridPx, originBaseline }) => {
    const overlay = document.createElement("div");
    overlay.id = "__baseline_grid_overlay";
    overlay.style.cssText = [
      "position: absolute",
      "top: 0",
      "left: 0",
      "width: 100%",
      `height: ${document.documentElement.scrollHeight}px`,
      "pointer-events: none",
      "z-index: 99999",
      `background: repeating-linear-gradient(to bottom, rgba(255, 0, 0, 0.2) 0px, rgba(255, 0, 0, 0.2) 1px, transparent 1px, transparent ${gridPx}px)`,
      `background-position-y: ${originBaseline}px`,
    ].join(";");
    document.body.appendChild(overlay);
  }, { gridPx, originBaseline });

  await page.screenshot({ path, fullPage: true });

  await page.evaluate(() => {
    const overlay = document.getElementById("__baseline_grid_overlay");
    if (overlay) overlay.remove();
  });
}

// --- Main ---

async function main() {
  const config = parseArgs(process.argv);

  const [vw, vh] = config.viewport.split("x").map(Number);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: vh });

  if (config.auth) {
    const [username, password] = config.auth.split(":");
    await page.authenticate({ username, password });
  }

  await page.goto(config.url, { waitUntil: "networkidle2" });

  const results = await measure(page, config);

  if (results.error) {
    console.error(`Error: ${results.error}`);
    await browser.close();
    process.exit(1);
  }

  if (config.json) {
    console.log(formatJSON(results, config));
  } else {
    console.log(formatTable(results, config));
  }

  if (config.screenshot) {
    await screenshot(page, results.detectedGrid, results.originBaseline, config.screenshot);
    if (!config.json) {
      console.log(`\nScreenshot saved: ${config.screenshot}`);
    }
  }

  await browser.close();

  const hasMiss = results.measurements.some(
    (m) => Math.abs(m.gridError) > config.tolerance
  );
  process.exit(hasMiss ? 1 : 0);
}

main();
