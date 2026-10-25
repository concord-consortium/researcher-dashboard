// The host every replay link in the demo's CLUE result points at. `.invalid` is reserved and never
// resolves, so a link to it reaches nothing even when it is opened some way no page event sees.
export const REDACTED_HOST = "redacted.demo.link.invalid";

export const REDACTED_MESSAGE =
  "The demo's replay links are redacted. On a real class, each opens the student's document in CLUE at that point in its history.";

// The renderer keeps a result's https links and opens them in a new tab, so the demo page stops a
// click on a redacted one before the browser follows it. A middle-click arrives as an auxclick, as
// does a right-click, which is left to open the context menu.
export function catchRedactedLinks(target: Document, say: (message: string) => void): () => void {
  const handle = (event: MouseEvent) => {
    if (event.button !== (event.type === "click" ? 0 : 1)) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(link instanceof HTMLAnchorElement) || link.hostname !== REDACTED_HOST) return;
    event.preventDefault();
    say(REDACTED_MESSAGE);
  };
  target.addEventListener("click", handle, true);
  target.addEventListener("auxclick", handle, true);
  return () => {
    target.removeEventListener("click", handle, true);
    target.removeEventListener("auxclick", handle, true);
  };
}
