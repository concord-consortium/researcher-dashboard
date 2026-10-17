import { ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";

// A message about the page itself, not one package: a warning that something may be missing, or an
// error that something could not be read.
export function Callout({ tone, role, children }: { tone: "notice" | "error"; role?: "status"; children: ReactNode }) {
  const Icon = tone === "error" ? ExclamationCircleIcon : ExclamationTriangleIcon;
  return (
    <p className={`callout ${tone}`} role={role}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
