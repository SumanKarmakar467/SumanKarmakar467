// Generates the LeetCode Easy/Medium/Hard donut chart from live solved
// counts pulled from LeetCode's public GraphQL API. Run on the same
// schedule as scripts/leetcode-snake.mjs via .github/workflows/snake.yml.
//
// Usage: node scripts/leetcode-donut.mjs <leetcode-username> <output-dir>

import { writeFile, mkdir } from "node:fs/promises";

const USERNAME = process.argv[2] ?? process.env.LEETCODE_USERNAME;
const OUT_DIR = process.argv[3] ?? "dist";

if (!USERNAME) {
  console.error("Usage: node leetcode-donut.mjs <username> [outDir]");
  process.exit(1);
}

const COLORS = {
  Easy: { from: "#34e0a1", to: "#00b894" },
  Medium: { from: "#ffd54f", to: "#ff9f1a" },
  Hard: { from: "#ff7b7b", to: "#e63946" },
};

const THEMES = {
  light: {
    cardFrom: "#ffffff",
    cardTo: "#f5f6fb",
    border: "#e4e7ee",
    track: "#eceef4",
    text: "#14161a",
    sub: "#6b7280",
    shadow: "#94a3b8",
  },
  dark: {
    cardFrom: "#12161f",
    cardTo: "#0a0d13",
    border: "#232837",
    track: "#1c2130",
    text: "#f2f4f8",
    sub: "#8b93a7",
    shadow: "#000000",
  },
};

const TITLE_H = 40;
const SIZE = 320 + TITLE_H;
const CX = 130;
const CY = 158 + TITLE_H;
const RADIUS = 78;
const STROKE = 24;
const GAP_PX = 10;

async function fetchSolvedCounts(username) {
  const query = `
    query userProblemsSolved($username: String!) {
      matchedUser(username: $username) {
        submitStatsGlobal {
          acSubmissionNum {
            difficulty
            count
          }
        }
      }
      allQuestionsCount {
        difficulty
        count
      }
    }
  `;

  const res = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: `https://leetcode.com/${username}/`,
      "User-Agent": "Mozilla/5.0 (compatible; leetcode-donut-generator)",
    },
    body: JSON.stringify({ query, variables: { username } }),
  });

  if (!res.ok) {
    throw new Error(`LeetCode API request failed: ${res.status} ${res.statusText}`);
  }

  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);

  const solvedByDifficulty = Object.fromEntries(
    (data?.matchedUser?.submitStatsGlobal?.acSubmissionNum ?? []).map((d) => [
      d.difficulty,
      d.count,
    ]),
  );
  const totalByDifficulty = Object.fromEntries(
    (data?.allQuestionsCount ?? []).map((d) => [d.difficulty, d.count]),
  );

  if (!solvedByDifficulty.Easy && solvedByDifficulty.Easy !== 0) {
    throw new Error(`No stats found for user "${username}"`);
  }

  return ["Easy", "Medium", "Hard"].map((label) => ({
    label,
    solved: solvedByDifficulty[label] ?? 0,
    total: totalByDifficulty[label] ?? 0,
    gradient: COLORS[label],
  }));
}

const FONT = "'Poppins', 'Segoe UI', sans-serif";
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function renderDonut(data, totalSolved, theme) {
  const active = data.filter((d) => d.solved > 0);
  const usable = CIRCUMFERENCE - GAP_PX * active.length;

  let cumulative = 0;
  const segments = active
    .map((d, i) => {
      const segLen = (d.solved / totalSolved) * usable;
      const offset = cumulative + GAP_PX * i;
      cumulative += segLen;
      return `<circle cx="${CX}" cy="${CY}" r="${RADIUS}" fill="none" stroke="url(#grad-${d.label})"
        stroke-width="${STROKE}" stroke-linecap="round"
        stroke-dasharray="${segLen.toFixed(2)} ${(CIRCUMFERENCE - segLen).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${CX} ${CY})" filter="url(#ringGlow)"/>`;
    })
    .join("\n  ");

  const gradients = data
    .map(
      (d) => `<linearGradient id="grad-${d.label}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${d.gradient.from}"/>
      <stop offset="100%" stop-color="${d.gradient.to}"/>
    </linearGradient>`,
    )
    .join("\n    ");

  const maxSolved = Math.max(1, ...data.map((d) => d.solved));
  const legend = data
    .map((d, i) => {
      const y = 54 + TITLE_H + i * 44;
      const pct = totalSolved ? Math.round((d.solved / totalSolved) * 100) : 0;
      const barW = 116;
      const fillW = Math.max(3, (d.solved / maxSolved) * barW);
      return `
    <circle cx="266" cy="${y - 5}" r="5" fill="url(#grad-${d.label})"/>
    <text x="280" y="${y}" font-family="${FONT}" font-size="14" font-weight="600" fill="${theme.text}">${d.label}</text>
    <text x="440" y="${y}" text-anchor="end" font-family="${FONT}" font-size="13" font-weight="700" fill="${d.gradient.to}">${pct}%</text>
    <rect x="266" y="${y + 8}" width="${barW}" height="5" rx="2.5" fill="${theme.track}"/>
    <rect x="266" y="${y + 8}" width="${fillW.toFixed(1)}" height="5" rx="2.5" fill="url(#grad-${d.label})"/>
    <text x="440" y="${y + 22}" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="${theme.sub}">${d.solved} / ${d.total}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="${SIZE}" viewBox="0 0 460 ${SIZE}">
  <defs>
    ${gradients}
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.cardFrom}"/>
      <stop offset="100%" stop-color="${theme.cardTo}"/>
    </linearGradient>
    <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="${theme.shadow}" flood-opacity="0.35"/>
    </filter>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="${theme.shadow}" flood-opacity="0.18"/>
    </filter>
  </defs>

  <rect x="3" y="3" width="454" height="${SIZE - 6}" rx="18" fill="url(#cardBg)" stroke="${theme.border}" stroke-width="1" filter="url(#cardShadow)"/>

  <text x="24" y="34" font-family="${FONT}" font-size="16" font-weight="700" fill="${theme.text}">🧩 LeetCode Problems Solved</text>
  <line x1="24" y1="48" x2="436" y2="48" stroke="${theme.border}" stroke-width="1"/>

  <circle cx="${CX}" cy="${CY}" r="${RADIUS}" fill="none" stroke="${theme.track}" stroke-width="${STROKE}"/>
  ${segments}

  <text x="${CX}" y="${CY - 6}" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="800" fill="${theme.text}">${totalSolved}</text>
  <text x="${CX}" y="${CY + 20}" text-anchor="middle" font-family="${FONT}" font-size="12" font-weight="600" letter-spacing="1.5" fill="${theme.sub}">SOLVED</text>

  ${legend}
</svg>`;
}

async function main() {
  console.log(`Fetching LeetCode solved counts for ${USERNAME}...`);
  const data = await fetchSolvedCounts(USERNAME);
  const totalSolved = data.reduce((s, d) => s + d.solved, 0);

  await mkdir(OUT_DIR, { recursive: true });

  for (const [name, theme] of Object.entries(THEMES)) {
    const svg = renderDonut(data, totalSolved, theme);
    const filename = `${OUT_DIR}/leetcode-donut${name === "dark" ? "-dark" : ""}.svg`;
    await writeFile(filename, svg);
    console.log(`Wrote ${filename}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
