import type { Token } from "./oauth";
import { Api, Portal } from "./portal";
import type { PortalConfig } from "./portals";

// Everything the dashboard page calls out to, gathered so a test can hand it fakes. The page
// gets these and never the launch, so nothing after the redirect can read `classId`.
export interface DashboardServices {
  portal: Portal;
}

export function makeServices(config: PortalConfig, token: Token): DashboardServices {
  return { portal: new Portal(new Api(config.origin, token)) };
}
