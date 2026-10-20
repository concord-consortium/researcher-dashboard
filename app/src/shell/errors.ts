// What a failed run's error means, in a plain sentence, with the error as it was written when that
// adds anything. The runner and report-service's watchdog write these texts; an error the page does
// not know reads as the analysis stopping with an error, with the text as its detail.
export interface PlainError { plain: string; detail: string | null }

const KNOWN: { match: RegExp; plain: string; detail: boolean }[] = [
  { match: /^VM terminated during analysis/, plain: "The run stopped before it finished.", detail: false },
  { match: /^The machine running it stopped before the run finished/, plain: "The run stopped before it finished.", detail: false },
  { match: /^No VM took this package before/, plain: "This run did not start in time.", detail: false },
  { match: /^analysis exceeded \d+ms/, plain: "The run took too long and was stopped.", detail: false },
  { match: /^cc-data login exited/, plain: "The run could not sign in to read the class's data.", detail: true },
  { match: /^package wrote no readable display\.json/, plain: "The analysis finished without writing a result.", detail: true }
];

export function plainError(error: string | null): PlainError {
  if (error === null || !error.trim()) return { plain: "The analysis gave no reason.", detail: null };
  const known = KNOWN.find((k) => k.match.test(error));
  if (!known) return { plain: "The analysis stopped with an error.", detail: error };
  return { plain: known.plain, detail: known.detail ? error : null };
}
