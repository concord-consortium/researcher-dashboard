import { BeakerIcon } from "@heroicons/react/16/solid";
import logo from "../assets/cc-logo.png";
import type { User } from "../shell/portal";

export const DEMO_LABEL = "Demo with sample data";

// The logo and the product's name, which every page's header starts with, and on the demo page the
// pill saying its data is made up.
export function Brand({ demo }: { demo: boolean }) {
  return (
    <div className="brand">
      <img className="logo" src={logo} alt="Concord Consortium" />
      <div className="product">
        <span>Researcher Dashboard</span>
        {demo && (
          <span className="demo-pill" title="This dashboard uses a made-up class and simulated runs. Nothing here reaches a portal or real student data.">
            <BeakerIcon aria-hidden="true" />{DEMO_LABEL}
          </span>
        )}
      </div>
    </div>
  );
}

// Who is signed in, from the portal, for the header's far right.
export function UserInfo({ user }: { user: User }) {
  return (
    <div className="user">
      <p className="user-name">{user.name}</p>
      {user.provider ? <p className="meta">Signed in with {user.provider}</p> : user.username && <p className="meta">{user.username}</p>}
    </div>
  );
}
