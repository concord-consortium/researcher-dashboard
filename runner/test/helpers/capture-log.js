// The runner's log lines written while `fn` runs, parsed. The log writes to stdout, so a
// line from anything else still running, a loop a test left going included, lands here too.
export async function captureLog(fn) {
  const lines = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return lines.flatMap((l) => l.split("\n")).filter(Boolean).map((l) => JSON.parse(l));
}
