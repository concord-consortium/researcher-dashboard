import { ExclamationCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";

// A warning that something may be missing, or an error: something could not be read, or a run failed
// or was refused.
export function Callout({ tone, role, children }: { tone: "notice" | "error"; role?: "status"; children: ReactNode }) {
  const Icon = tone === "error" ? ExclamationCircleIcon : ExclamationTriangleIcon;
  return (
    <p className={`callout ${tone}`} role={role}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
