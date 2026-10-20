import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, BeakerIcon, CubeIcon, PlayCircleIcon } from "@heroicons/react/16/solid";
import { BUILD_VERSION } from "../build-info";
import { Brand, UserInfo } from "../components/Brand";
import type { User } from "../shell/portal";
import { Callout } from "../components/Callout";
import { CONTACT_URL } from "../components/PackageList";
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

// Why research access to a class can be missing, for the reasons that come from it, before what to do.
const ACCESS: Partial<Record<InfoReason, string>> = {
  withdrawn: "Research access ends when your researcher access to the class's project expires or is removed, or when "
    + "the class leaves the project.",
  "access-denied": "Research access to a class comes from being a researcher on a project the class belongs to."
};

// Reasons the way in and what the dashboard can show would not help with, so the page leaves them out.
const HIDE_PANELS: InfoReason[] = ["withdrawn", "access-denied", "class-gone"];

// Not a demo itself: invented results here would read as real ones. This page says what the
// dashboard is, why it is showing instead, and how to get in, and never shows class data. With no
// launch it links to the demo page, which is marked as sample data throughout.
// `user` is known only once the portal has said who signed in, so it is absent before then.
// `portal` is the origin of the portal the page signed in to, known once it has.
export function Info({ reason, detail, demo = false, user = null, portal = null }: {
  reason: InfoReason; detail?: string; demo?: boolean; user?: User | null; portal?: string | null;
}) {
  const access = ACCESS[reason];
  return (
    <div className="info-page">
      <header className="app-header">
        <div className="header-main info-header">
          <Brand demo={demo} />
          {user && <UserInfo user={user} />}
        </div>
      </header>
      <main className="info">
        <h1>Researcher Dashboard</h1>

        {reason === "no-launch" ? (
          <p>
            This is the Concord Consortium Researcher Dashboard. It runs analyses of the student work
            in a class you research, such as a summary of their open responses or how they used a
            model, and shows you the results. Developers and researchers build and test each analysis
            on their own computers, then upload it as a package for use here.
          </p>
        ) : (
          <Callout tone="notice" role="status">
            {REASONS[reason]}
            {detail && <> (<code>{detail}</code>)</>}
          </Callout>
        )}

        {access && (
          <p>
            {access} If you should have access, ask the project's administrator, or{" "}
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">contact Concord</a>.
          </p>
        )}
        {portal && HIDE_PANELS.includes(reason) && (
          <p><a className="link-button" href={portal}><ArrowLeftIcon aria-hidden="true" />Back to the portal</a></p>
        )}

        {reason === "no-launch" && (
          <section className="demo-panel" aria-labelledby="demo-heading">
            <div>
              <h2 id="demo-heading"><BeakerIcon aria-hidden="true" />Try the demo</h2>
              <p>
                See the dashboard with a sample class: run analyses, read their results and look around,
                without signing in. Nothing in it is real student data.
              </p>
            </div>
            <a className="link-button" href={demo ? "?scenario=ready" : "demo/?scenario=ready"}>
              <PlayCircleIcon aria-hidden="true" />Open the demo
            </a>
          </section>
        )}

        {!HIDE_PANELS.includes(reason) && <div className="info-grid">
          <section className="info-card" aria-labelledby="open-heading">
            <h2 id="open-heading"><ArrowTopRightOnSquareIcon aria-hidden="true" />How to use it</h2>
            <p>It is launched one class at a time from the portal:</p>
            <ol className="steps">
              <li>Open the portal, go to a project's Research Classes page, and use the filter to find a class.</li>
              <li>Use the Researcher Dashboard link on the class you want.</li>
            </ol>
            <p className="note">The link appears only on classes you research.</p>
          </section>

          <section className="info-card" aria-labelledby="shows-heading">
            <h2 id="shows-heading"><CubeIcon aria-hidden="true" />What it can show</h2>
            <ul>
              <li>
                The analyses that apply to the class, which you can search and filter by group: Official,
                Project, Personal and Community.
              </li>
              <li>Running an analysis for the class, and reading, copying and downloading its result and its tables.</li>
              <li>Finished results that re-run on their own as students save new work.</li>
              <li>
                How many of the class's students saved work in the last few minutes, and the counts from your
                own runs.
              </li>
            </ul>
          </section>
        </div>}
      </main>
      <footer className="build">
        <h2>Build info</h2>
        <p>Version <code>{BUILD_VERSION}</code>, deployed at <code>{deployPath()}</code>.</p>
      </footer>
    </div>
  );
}

// Where this copy of the app is served from, which is the versioned path the S3 deploy
// published it to. Shown because the first question about a deployed SPA is always which
// build you are looking at.
function deployPath(): string {
  const path = window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${window.location.host}${path}`;
}
