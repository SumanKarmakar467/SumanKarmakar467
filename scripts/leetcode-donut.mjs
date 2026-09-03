// One-off generator for the LeetCode Easy/Medium/Hard donut chart used in
// the README. Re-run manually and commit the output when the solved counts
// change: node scripts/leetcode-donut.mjs

import { writeFile } from "node:fs/promises";

const DATA = [
  { label: "Easy", solved: 34, total: 962, color: "#00b894" },
  { label: "Medium", solved: 49, total: 2109, color: "#ffc107" },
  { label: "Hard", solved: 5, total: 971, color: "#e74c3c" },
];

const TOTAL_SOLVED = DATA.reduce((s, d) => s + d.solved, 0);

const THEMES = {
  light: { background: "#ffffff", track: "#ebedf0", text: "#1a1a1a", sub: "#57606a" },
  dark: { background: "#0d1117", track: "#21262d", text: "#e6edf3", sub: "#8b949e" },
};

const SIZE = 320;
const CX = 130;
const CY = 160;
const OUTER = 100;
const INNER = 62;
const GAP_DEG = 3;

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx, cy, outer, inner, startDeg, endDeg) {
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = polar(cx, cy, outer, startDeg);
  const [x2, y2] = polar(cx, cy, outer, endDeg);
  const [x3, y3] = polar(cx, cy, inner, endDeg);
  const [x4, y4] = polar(cx, cy, inner, startDeg);
  return [
    `M ${x1} ${y1}`,
    `A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

function renderDonut(theme) {
  let angle = 0;
  const slices = DATA.map((d) => {
    const sweep = (d.solved / TOTAL_SOLVED) * 360;
    const start = angle + GAP_DEG / 2;
    const end = angle + sweep - GAP_DEG / 2;
    angle += sweep;
    return `<path d="${arcPath(CX, CY, OUTER, INNER, start, end)}" fill="${d.color}"/>`;
  }).join("\n  ");

  const legend = DATA.map((d, i) => {
    const y = 70 + i * 34;
    return `
    <rect x="260" y="${y - 12}" width="14" height="14" rx="3" fill="${d.color}"/>
    <text x="282" y="${y}" font-family="Poppins, Segoe UI, sans-serif" font-size="14" font-weight="600" fill="${theme.text}">${d.label}</text>
    <text x="282" y="${y + 17}" font-family="Poppins, Segoe UI, sans-serif" font-size="11" fill="${theme.sub}">${d.solved} / ${d.total}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="${SIZE}" viewBox="0 0 460 ${SIZE}">
  <rect width="460" height="${SIZE}" rx="12" fill="${theme.background}"/>
  <circle cx="${CX}" cy="${CY}" r="${OUTER}" fill="${theme.track}" opacity="0.35"/>
  ${slices}
  <text x="${CX}" y="${CY - 4}" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="40" font-weight="700" fill="${theme.text}">${TOTAL_SOLVED}</text>
  <text x="${CX}" y="${CY + 20}" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="13" fill="${theme.sub}">Solved</text>
  ${legend}
</svg>`;
}

async function main() {
  for (const [name, theme] of Object.entries(THEMES)) {
    const svg = renderDonut(theme);
    const filename = `assets/leetcode-donut${name === "dark" ? "-dark" : ""}.svg`;
    await writeFile(filename, svg);
    console.log(`Wrote ${filename}`);
  }
}

main();
