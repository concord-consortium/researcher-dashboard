import { BUILD_VERSION } from "../build-info";

// Deliberately not a demo. portal-report has a fake-data mode and copying it here would put
// invented results in front of a researcher, which read as real ones. This page says what
// the dashboard is and how to get into it, and nothing else.
export function Info() {
  return (
    <main className="info">
      <h1>Researcher Dashboard</h1>

      <p>
        This is the Concord Consortium Researcher Dashboard. It shows the packages that apply to
        a class you research.
      </p>

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
