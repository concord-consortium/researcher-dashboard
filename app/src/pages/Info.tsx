import { BUILD_VERSION } from "../build-info";
import type { InfoReason } from "../shell/start";

const REASONS: Record<Exclude<InfoReason, "no-launch">, string> = {
  "unknown-portal": "This link is for a portal this dashboard does not serve.",
  "sign-in-failed": "This sign-in could not be completed. Launch the dashboard again from the portal.",
  "access-denied": "You do not have research access to this class.",
  "authorize-error": "The portal could not sign you in to the dashboard.",
  withdrawn: "Your research access to this class has been withdrawn.",
  "class-gone": "This class no longer exists.",
  "unsupported-scope": "This dashboard opens classes only, and this link is for something else.",
  expired: "Your sign-in has expired and could not be renewed. Launch the dashboard again from the portal."
};

// Deliberately not a demo. portal-report has a fake-data mode and copying it here would put
// invented results in front of a researcher, which read as real ones. This page says what
// the dashboard is, why it is showing instead, and how to get in, and never shows class data.
export function Info({ reason, detail }: { reason: InfoReason; detail?: string }) {
  return (
    <main className="info">
      <h1>Researcher Dashboard</h1>

      {reason === "no-launch" ? (
        <p>
          This is the Concord Consortium Researcher Dashboard. It shows the packages that apply
          to a class you research.
        </p>
      ) : (
        <p className="notice" role="status">
          {REASONS[reason]}
          {detail && <> (<code>{detail}</code>)</>}
        </p>
      )}

      <h2>How to open it</h2>
      <p>
        It is launched one class at a time from the portal. Open the portal, go to a project's
        Research Classes page, and use the Researcher Dashboard link on the class you want. The
        link appears only on classes you research.
      </p>

      <h2>What it can show</h2>
      <ul>
        <li>
          The packages that apply to the class, grouped as Official, the class's projects, your
          own, and Community.
        </li>
      </ul>

      <h2>This build</h2>
      <p className="build">
        Version <code>{BUILD_VERSION}</code>, deployed at <code>{deployPath()}</code>.
      </p>
    </main>
  );
}

// Where this copy of the app is served from, which is the versioned path the S3 deploy
// published it to. Shown because the first question about a deployed SPA is always which
// build you are looking at.
function deployPath(): string {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.host}${path}`;
}
