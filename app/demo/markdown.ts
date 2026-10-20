// Result markdown shaped like what the packages write: wildfire-responses' open-response tables,
// activity-model-use's longer multi-section report, and the smaller packages' results.

export const WILDFIRE_RESPONSES = `# Wildfire open responses

6 open responses to 2 questions from 3 learners.

Questions with an open response, by assignment, in question-id order rather than page order.

## Researcher Dashboard Wildfire Fixture

| Question | Learners |
|---|---|
| Where do wildfires start\\? | 3 |
| Explain what the wind did to the fire. | 3 |
`;

// wildfire-simulation-use's report in the layout and wording of a real run, with every number made
// up, so nothing from a real class is in this repo.
export { default as MODEL_USE } from "./model-use.md?raw";

export const EXPLANATION_KEYWORDS = `# Explanation keywords

8 science keywords in 6 responses.

| Keyword | Responses | Learners |
|---|---:|---:|
| wind | 4 | 3 |
| spread | 3 | 2 |
| uphill | 2 | 2 |
| dry | 2 | 2 |
| fuel | 1 | 1 |
| grass | 1 | 1 |
| direction | 1 | 1 |
| terrain | 1 | 1 |
`;
