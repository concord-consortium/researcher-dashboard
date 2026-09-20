import { BUILD_VERSION } from "../build-info";

// What the root renders: no page, no token, a rejected token, or a page it does not know.
//
// Deliberately not a demo. portal-report has a fake-data mode and copying it here would put
// invented analyses in front of a researcher, which read as real results. This page says
// what the dashboard is and how to get into it, and nothing else.
export function Info({ reason }: { reason: "no-launch" | "bad-token" }) {
  return (
    <main className="info">
      <h1>Researcher Dashboard</h1>

      {reason === "bad-token" ? (
        <p className="notice">
          This link has expired. Launch the dashboard again from the portal to get a new one.
        </p>
      ) : (
        <p>
          This is the Concord Consortium Researcher Dashboard. It analyzes a class you research
          and shows you the result.
        </p>
      )}

      <h2>How to open it</h2>
      <p>
        It is launched one class at a time from the portal. Open the portal, go to a project's
        Research Classes page, and use the Analyze Class link on the class you want. The link
        appears only on classes you research.
      </p>

      <h2>What it can show</h2>
      <ul>
        <li>
          <strong>Analyze Class</strong>: a class's CLUE documents, its student answers and its
          log rows, and the result of any analysis package run against it.
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
