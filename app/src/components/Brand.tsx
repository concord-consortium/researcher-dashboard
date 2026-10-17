import { BeakerIcon } from "@heroicons/react/16/solid";
import logo from "../assets/cc-logo.png";
import type { TokenUser } from "../shell/oauth";

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
            <BeakerIcon aria-hidden="true" />Demo with sample data
          </span>
        )}
      </div>
    </div>
  );
}

// Who is signed in, from the access token's claims, for the header's far right.
export function UserInfo({ user }: { user: TokenUser }) {
  return (
    <div className="user">
      <p className="user-name">{user.name}</p>
      {user.username && <p className="meta">{user.username}</p>}
    </div>
  );
}
