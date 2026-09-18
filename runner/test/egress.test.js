import assert from "node:assert/strict";
import test from "node:test";
import { hostAllowed, parseAuthority } from "../server/egress-proxy.js";
import { setupCommands, teardownCommands, HOST_ADDR, PROXY_PORT } from "../server/netns.js";

const ALLOW = ["report-server.concordqa.org", ".concord.org"];

test("allows exactly the named host", () => {
  assert.ok(hostAllowed("report-server.concordqa.org", ALLOW));
  assert.ok(hostAllowed("REPORT-SERVER.CONCORDQA.ORG", ALLOW), "hostnames are case-insensitive");
  assert.ok(!hostAllowed("report-server.concordqa.org.evil.com", ALLOW));
});

// The only wildcard worth having, and the one that is easy to get wrong.
test("a leading dot allows subdomains and not a lookalike zone", () => {
  assert.ok(hostAllowed("learn.concord.org", ALLOW));
  assert.ok(!hostAllowed("concord.org", ALLOW), "the bare zone is not a subdomain of itself");
  assert.ok(!hostAllowed("evilconcord.org", ALLOW), "a suffix match must not span a label");
});

test("refuses anything not named, including the metadata endpoint", () => {
  assert.ok(!hostAllowed("169.254.169.254", ALLOW));
  assert.ok(!hostAllowed("example.com", ALLOW));
  assert.ok(!hostAllowed("", ALLOW));
  assert.ok(!hostAllowed(undefined, ALLOW));
});

test("parses the CONNECT authority, including an IPv6 literal", () => {
  assert.deepEqual(parseAuthority("report-server.concordqa.org:443"), {
    host: "report-server.concordqa.org", port: 443
  });
  assert.deepEqual(parseAuthority("[fd00:ec2::254]:80"), { host: "fd00:ec2::254", port: 80 });
  assert.equal(parseAuthority("no-port"), null);
  assert.equal(parseAuthority("host:0"), null);
  assert.equal(parseAuthority(undefined), null);
});

// The namespace's reach is decided by routing, so the setup is worth reading as a list.
test("the namespace gets one /30 and no default route", () => {
  const commands = setupCommands();
  const flat = commands.map(([c, a]) => [c, ...a].join(" "));

  assert.ok(flat.some((c) => c.includes("addr add 10.201.0.2/30")), "the namespace holds one /30");
  assert.ok(!flat.some((c) => c.includes("route add default")),
    "no default route: the host end of the veth is the whole of what it can address");
});

// IMDS is also served over IPv6, and the review found the design named only the v4
// address. No IPv6 at all is the simpler answer than a second ruleset.
test("IPv6 is disabled in the namespace", () => {
  const flat = setupCommands().map(([c, a]) => [c, ...a].join(" "));
  assert.ok(flat.some((c) => c.includes("disable_ipv6=1")));
});

// The runner's own server binds every interface, so the host end of the veth would
// expose /run-package and /refresh-token to the package.
test("only the proxy port is reachable on the host end", () => {
  const flat = setupCommands().map(([c, a]) => [c, ...a].join(" "));
  const accept = flat.find((c) => c.includes("ACCEPT"));
  const reject = flat.find((c) => c.includes("REJECT"));

  assert.ok(accept.includes(`--dport ${PROXY_PORT}`) && accept.includes(HOST_ADDR));
  assert.ok(reject.includes(HOST_ADDR), "everything else on the host end is refused");
  assert.ok(flat.indexOf(accept) < flat.indexOf(reject), "the accept must precede the reject");
});

// A resumed VM starts from a namespace its previous life left behind.
test("setup tears down a leftover namespace first", () => {
  assert.deepEqual(teardownCommands()[0], ["ip", ["netns", "del", "analysis"]]);
});

// One list, in one place, is the property that makes this reviewable for an outside
// researcher's package: everything else a package needs goes through the runner.
test("the default allowlist is report-server and nothing else", async () => {
  const { loadEnv } = await import("../server/config.js");
  const env = loadEnv({ SYNC_BACKEND: "DIR", SYNC_DIR: "/tmp/x" });
  assert.deepEqual(env.egressAllowlist, ["report-server.concordqa.org", "report-server.concord.org"]);
  assert.ok(!env.egressAllowlist.some((h) => h.startsWith(".")), "no zone wildcards by default");
});
