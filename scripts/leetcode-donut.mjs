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

const COLORS = { Easy: "#00b894", Medium: "#ffc107", Hard: "#e74c3c" };

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
    color: COLORS[label],
  }));
}

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

function renderDonut(data, totalSolved, theme) {
  let angle = 0;
  const slices = data
    .filter((d) => d.solved > 0)
    .map((d) => {
      const sweep = (d.solved / totalSolved) * 360;
      const start = angle + (sweep < 360 ? GAP_DEG / 2 : 0);
      const end = angle + sweep - (sweep < 360 ? GAP_DEG / 2 : 0);
      angle += sweep;
      return `<path d="${arcPath(CX, CY, OUTER, INNER, start, end)}" fill="${d.color}"/>`;
    })
    .join("\n  ");

  const legend = data
    .map((d, i) => {
      const y = 70 + i * 34;
      return `
    <rect x="260" y="${y - 12}" width="14" height="14" rx="3" fill="${d.color}"/>
    <text x="282" y="${y}" font-family="Poppins, Segoe UI, sans-serif" font-size="14" font-weight="600" fill="${theme.text}">${d.label}</text>
    <text x="282" y="${y + 17}" font-family="Poppins, Segoe UI, sans-serif" font-size="11" fill="${theme.sub}">${d.solved} / ${d.total}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="${SIZE}" viewBox="0 0 460 ${SIZE}">
  <rect width="460" height="${SIZE}" rx="12" fill="${theme.background}"/>
  <circle cx="${CX}" cy="${CY}" r="${OUTER}" fill="${theme.track}" opacity="0.35"/>
  ${slices}
  <text x="${CX}" y="${CY - 4}" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="40" font-weight="700" fill="${theme.text}">${totalSolved}</text>
  <text x="${CX}" y="${CY + 20}" text-anchor="middle" font-family="Poppins, Segoe UI, sans-serif" font-size="13" fill="${theme.sub}">Solved</text>
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
