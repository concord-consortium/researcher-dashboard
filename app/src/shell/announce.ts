import { millis, sentence, type Result } from "./runs";

// What a screen reader is told as runs move on: a run starting, finishing with what it found, or
// failing, each naming its package. The first reading, and every stage in between, says nothing; a
// finish or failure is told when it is new, even with no running seen before it.
export function runNews(before: Map<string, Result> | null, after: Map<string, Result>, titleOf: (key: string) => string): string[] {
  if (!before) return [];
  const news: string[] = [];
  for (const [key, result] of after) {
    const was = before.get(key);
    const moved = was?.status !== result.status;
    const ended = moved || millis(was?.finished_at) !== millis(result.finished_at);
    const title = titleOf(key);
    if (result.status === "running" && moved) news.push(`${title} is running.`);
    else if (result.status === "done" && ended) news.push(`${title} finished: ${sentence(result.summary ?? "it wrote no summary")}`);
    else if (result.status === "failed" && ended) news.push(`${title} failed: ${sentence(result.error ?? "no reason was given")}`);
  }
  return news;
}
