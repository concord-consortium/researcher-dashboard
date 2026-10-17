// Result markdown shaped like what the packages write: wildfire-responses' open-response tables
// and wildfire-model-use's longer multi-section report.

export const WILDFIRE_RESPONSES = `6 open responses to 2 questions from 3 learners.

#### Activity 1, page 2: Where do wildfires start?

| Learner | Response |
|---|---|
| Learner 1 | Wildfires start where there is dry grass and something to light it, like lightning or a campfire. |
| Learner 2 | Mostly in dry places. The model showed the fire spreading faster uphill. |
| Learner 3 | When it is hot and windy. |

#### Activity 1, page 4: Explain what the wind did to the fire.

| Learner | Response |
|---|---|
| Learner 1 | The wind pushed the fire to the east so it burned that side first. |
| Learner 2 | It made it go faster in the direction the wind was blowing. |
| Learner 3 | It spread the fire more. |
`;

function repeat<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

const LEARNERS = 13;
const TASKS = [23, 24, 27, 31, 34];

export const MODEL_USE = `13 students, 13 ran the model, 8 completed a task page.

Includes logs up to 2026-08-06 02:00 UTC. A student's work after that time shows in the next run once the logs have caught up.

#### Patterns

| Task | Students who opened the model | Ran it once | Ran it 2 to 5 times | Ran it more than 5 times |
|---|---:|---:|---:|---:|
${TASKS.map((t, i) => `| Task ${t} | ${13 - i} | ${2 + i} | ${6 - i} | ${5 - i} |`).join("\n")}

#### Simulation use

${repeat(LEARNERS, (i) => `- Student ${i + 1}: ${3 + (i * 7) % 11} runs, longest ${(1.5 + (i % 4) * 0.75).toFixed(2)} minutes, last on Task ${TASKS[i % TASKS.length]}`).join("\n")}

#### Settings

| Task | Wind speed | Wind direction | Terrain | Vegetation | Drought index | Runs |
|---|---|---|---|---|---|---:|
${TASKS.flatMap((t) => repeat(4, (j) => `| Task ${t} | ${[0, 10, 20, 30][j]} mph | ${["north", "east", "south", "west"][j]} | ${["plains", "foothills", "mountains", "plains"][j]} | ${["grass", "shrub", "forest", "grass"][j]} | ${["low", "medium", "high", "severe"][j]} | ${4 + j * 3} |`)).join("\n")}

#### Page progress

${TASKS.map((t, i) => `##### Task ${t}

| Page | Opened | Answered every question | Completed |
|---|---:|---:|---:|
${repeat(5, (p) => `| Activity ${1 + (i % 2)}, page ${p + 1}: ${["Introduction", "Make a prediction", "Run the model", "Compare runs", "Make a claim"][p]} | ${13 - p} | ${11 - p} | ${10 - p - (i % 2)} |`).join("\n")}`).join("\n\n")}

#### Claims

${TASKS.map((t, i) => `##### Task ${t}: "${["Which direction will the fire spread fastest?", "How does terrain change the spread?", "What happens with no wind?", "Which vegetation burns fastest?", "What is the main source of fuel in the grassland?"][i]}"

| Choice | Students | Correct |
|---|---:|:---:|
| ${["Uphill", "Faster up slopes", "It spreads evenly", "Grass", "Grass"][i]} | ${3 + i} | yes |
| ${["Downhill", "No change", "It stops", "Forest", "Trees"][i]} | ${2} | |
| ${["Toward the wind", "Slower up slopes", "It spreads uphill only", "Shrub", "Shrubs"][i]} | ${1 + (i % 2)} | |`).join("\n\n")}

Pages no student opened: Activity 2, page 6: Reflection; Activity 2, page 7: Extension.

Claims nobody answered are not listed: 4 questions across Tasks 24 and 31.
`;

export const RUNNER_SMOKE = `Runner smoke test passed.

- cc-data: v0.3.0-pre.1
- Python: 3.11.9
- Answers pulled: 12
- Logs pulled: 59
`;

export const ISOLATION_PROBE = `No network reachable from the package sandbox.

| Probe | Result |
|---|---|
| \`https://example.com\` | blocked |
| \`169.254.169.254\` | blocked |
| DNS lookup | blocked |
`;
