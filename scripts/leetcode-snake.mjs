// Generates an animated SVG of a snake eating a LeetCode submission-calendar
// grid, mirroring the look of the GitHub contribution snake but built from
// scratch (own solver + renderer) against real LeetCode data.
//
// Usage: node scripts/leetcode-snake.mjs <leetcode-username> <output-dir>

import { mkdir, writeFile } from "node:fs/promises";

const USERNAME = process.argv[2] ?? process.env.LEETCODE_USERNAME;
const OUT_DIR = process.argv[3] ?? "dist";

if (!USERNAME) {
  console.error("Usage: node leetcode-snake.mjs <username> [outDir]");
  process.exit(1);
}

const COLS = 53;
const ROWS = 7;
const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const MARGIN = 4;
const SNAKE_LENGTH = 4;
const TOTAL_DURATION_S = 40;

const THEMES = {
  light: {
    background: "#ffffff",
    empty: "#ebedf0",
    levels: ["#ffe0b3", "#ffb84d", "#ff9800", "#e65100"],
    snake: "#ff6b35",
  },
  dark: {
    background: "#0d1117",
    empty: "#161b22",
    levels: ["#3a2a12", "#6b3e0f", "#b35a00", "#ffa116"],
    snake: "#00f7ff",
  },
};

async function fetchSubmissionCalendar(username) {
  const query = `
    query userProfileCalendar($username: String!) {
      matchedUser(username: $username) {
        userCalendar {
          submissionCalendar
        }
      }
    }
  `;

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/${username}/`,
      "User-Agent": "Mozilla/5.0 (compatible; leetcode-snake-generator)",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode API request failed: ${res.status} ${res.statusText}`);
  }

  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);

  const calendar = data?.matchedUser?.userCalendar?.submissionCalendar;
  if (!calendar) throw new Error(`No calendar data for user "${username}"`);

  const raw = JSON.parse(calendar);
  const byDayIndex = new Map();
  for (const [ts, count] of Object.entries(raw)) {
    byDayIndex.set(Math.floor(Number(ts) / 86400), Number(count));
  }
  return byDayIndex;
}

function levelForCount(count) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

function buildGrid(byDayIndex) {
  const today = new Date();
  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const todayDayIndex = Math.floor(todayUTC / 1000 / 86400);
  const weekday = new Date(todayUTC).getUTCDay(); // 0 = Sunday

  const endOfWeekDayIndex = todayDayIndex + (6 - weekday);
  const startDayIndex = endOfWeekDayIndex - (COLS * ROWS - 1);

  const cells = [];
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      const dayIndex = startDayIndex + x * ROWS + y;
      const count = dayIndex <= todayDayIndex ? byDayIndex.get(dayIndex) ?? 0 : 0;
      cells.push({ x, y, count, level: levelForCount(count) });
    }
  }
  return cells;
}

// Serpentine path across columns so consecutive steps are always adjacent.
function buildPath() {
  const path = [];
  for (let x = 0; x < COLS; x++) {
    if (x % 2 === 0) {
      for (let y = 0; y < ROWS; y++) path.push({ x, y });
    } else {
      for (let y = ROWS - 1; y >= 0; y--) path.push({ x, y });
    }
  }
  return path;
}

function keyTimesAttr(n) {
  return Array.from({ length: n + 1 }, (_, i) => (i / n).toFixed(6)).join(";");
}

function renderSvg(cells, path, theme) {
  const cellByKey = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));
  const eatenStep = new Map(path.map((p, i) => [`${p.x},${p.y}`, i]));
  const n = path.length;

  const width = MARGIN * 2 + COLS * STEP - GAP;
  const height = MARGIN * 2 + ROWS * STEP - GAP;
  const keyTimes = keyTimesAttr(n);

  const dotRects = cells
    .map((c) => {
      const cx = MARGIN + c.x * STEP;
      const cy = MARGIN + c.y * STEP;
      const origColor = c.level > 0 ? theme.levels[c.level - 1] : theme.empty;

      if (c.level === 0) {
        return `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" fill="${theme.empty}"/>`;
      }

      // calcMode="discrete" holds the last keyframe's value until the
      // animation loops back to time 0, so eating a dot only needs two
      // keyframes: colored at the start, emptied once the snake reaches it.
      const te = eatenStep.get(`${c.x},${c.y}`);
      const teFrac = (te / n).toFixed(6);

      return `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" fill="${origColor}">
        <animate attributeName="fill" values="${origColor};${theme.empty}" keyTimes="0;${teFrac}" calcMode="discrete" dur="${TOTAL_DURATION_S}s" repeatCount="indefinite"/>
      </rect>`;
    })
    .join("\n");

  const snakeRects = Array.from({ length: SNAKE_LENGTH }, (_, s) => {
    const xValues = Array.from({ length: n + 1 }, (_, i) => {
      const step = Math.max(0, (i % n) - s);
      return MARGIN + path[step].x * STEP;
    }).join(";");
    const yValues = Array.from({ length: n + 1 }, (_, i) => {
      const step = Math.max(0, (i % n) - s);
      return MARGIN + path[step].y * STEP;
    }).join(";");

    const opacity = s === 0 ? 1 : 0.85 - s * 0.12;

    return `<rect width="${CELL}" height="${CELL}" rx="3" fill="${theme.snake}" fill-opacity="${opacity.toFixed(2)}">
      <animate attributeName="x" values="${xValues}" keyTimes="${keyTimes}" calcMode="discrete" dur="${TOTAL_DURATION_S}s" repeatCount="indefinite"/>
      <animate attributeName="y" values="${yValues}" keyTimes="${keyTimes}" calcMode="discrete" dur="${TOTAL_DURATION_S}s" repeatCount="indefinite"/>
    </rect>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${theme.background}"/>
  ${dotRects}
  ${snakeRects}
</svg>`;
}

async function main() {
  console.log(`Fetching LeetCode submission calendar for ${USERNAME}...`);
  const byDayIndex = await fetchSubmissionCalendar(USERNAME);
  const cells = buildGrid(byDayIndex);
  const path = buildPath();

  await mkdir(OUT_DIR, { recursive: true });

  for (const [name, theme] of Object.entries(THEMES)) {
    const svg = renderSvg(cells, path, theme);
    const filename = `${OUT_DIR}/leetcode-contribution-grid-snake${name === "dark" ? "-dark" : ""}.svg`;
    await writeFile(filename, svg);
    console.log(`Wrote ${filename}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
