import { CheckIcon, ClipboardDocumentIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";

// How long a copy button shows that it copied, or could not, before it looks as it did.
export const COPIED_MS = 1000;

// A button that copies, and answers in its own look and icon, so nothing around it moves; a screen
// reader hears the answer in words. A `copy` that throws, as navigator.clipboard's absence outside a
// secure context makes it, counts as a refusal.
// `name` is the button's full accessible name, when its label alone is the same as other buttons'.
export function CopyButton({ label, name, title, copy, done, failed }: {
  label: string; name?: string; title: string; copy: () => Promise<unknown>; done: string; failed: string;
}) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const Icon = copied === "ok" ? CheckIcon : copied === "failed" ? XMarkIcon : ClipboardDocumentIcon;
  return (
    <>
      <button type="button" className={`icon-button${copied === "ok" ? " copy-ok" : copied === "failed" ? " danger" : ""}`} title={title} aria-label={name}
        onClick={() => Promise.resolve().then(copy).then(() => setCopied("ok"), () => setCopied("failed"))}>
        <Icon aria-hidden="true" />{label}
      </button>
      <span aria-live="polite" className="visually-hidden">{copied === "ok" ? done : copied === "failed" ? failed : ""}</span>
    </>
  );
}
