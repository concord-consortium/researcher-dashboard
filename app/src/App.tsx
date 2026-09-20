import { ANALYZE_CLASS, classRef, pageFor, parseLaunch } from "./shell/launch";
import { AnalyzeClass } from "./pages/AnalyzeClass";
import { Info } from "./pages/Info";

// One index.html, the feature selected by `page`. A page the app does not know, or a launch
// missing what its page needs, renders the info page rather than a broken feature: a
// bookmarked launch url whose grant has expired is the ordinary way to arrive here.
export function App({ search }: { search: string }) {
  const launch = parseLaunch(search);
  const page = pageFor(launch);

  if (page === ANALYZE_CLASS) {
    return <AnalyzeClass ref_={classRef(launch.classUrl)!} token={launch.token!} />;
  }
  return <Info reason={launch.page && launch.token ? "bad-token" : "no-launch"} />;
}
