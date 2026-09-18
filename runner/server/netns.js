import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { log } from "./log.js";

const run = promisify(execFile);

// The analysis namespace: a package's only route out is the egress proxy.
//
// Built rather than empty, because a package makes its own report-service pulls now.
// The shape is chosen so that "what may a package reach" is answered by routing rather
// than by filtering: the namespace holds one /30, so the single address it can reach is
// the host end of the veth, and the proxy is what listens there. The metadata endpoint,
// the rest of AWS and the internet are unreachable because there is no route to them,
// not because a rule says no.
//
// Two things still need a rule. The runner's own HTTP server binds every interface, so
// the host end of the veth would otherwise expose /run-package and /refresh-token to
// the package; only the proxy port is allowed. And IPv6 is never configured, which is
// what closes the fd00:ec2::254 metadata address without a second ruleset.

export const NETNS = "analysis";
export const HOST_ADDR = "10.201.0.1";
export const NS_ADDR = "10.201.0.2";
export const PREFIX = 30;
export const PROXY_PORT = 8123;

// Written as data so the setup is reviewable as a list and testable without root.
export function setupCommands({ netns = NETNS, proxyPort = PROXY_PORT } = {}) {
  return [
    ["ip", ["netns", "add", netns]],
    ["ip", ["link", "add", "veth-an", "type", "veth", "peer", "name", "veth-ns"]],
    ["ip", ["link", "set", "veth-ns", "netns", netns]],
    ["ip", ["addr", "add", `${HOST_ADDR}/${PREFIX}`, "dev", "veth-an"]],
    ["ip", ["link", "set", "veth-an", "up"]],
    ["ip", ["netns", "exec", netns, "ip", "addr", "add", `${NS_ADDR}/${PREFIX}`, "dev", "veth-ns"]],
    ["ip", ["netns", "exec", netns, "ip", "link", "set", "veth-ns", "up"]],
    ["ip", ["netns", "exec", netns, "ip", "link", "set", "lo", "up"]],
    // No default route: the /30 is the whole of what this namespace can address, so
    // there is nothing to reach but the host end.
    ["ip", ["netns", "exec", netns, "sysctl", "-w", "net.ipv6.conf.all.disable_ipv6=1"]],
    ["ip", ["netns", "exec", netns, "sysctl", "-w", "net.ipv6.conf.default.disable_ipv6=1"]],
    // The host end is the runner's machine, and the runner's own server listens on
    // every interface. Only the proxy is reachable on it.
    ["ip", ["netns", "exec", netns, "iptables", "-A", "OUTPUT", "-p", "tcp",
            "-d", HOST_ADDR, "--dport", String(proxyPort), "-j", "ACCEPT"]],
    ["ip", ["netns", "exec", netns, "iptables", "-A", "OUTPUT", "-d", HOST_ADDR, "-j", "REJECT"]]
  ];
}

export function teardownCommands({ netns = NETNS } = {}) {
  return [
    ["ip", ["netns", "del", netns]],
    ["ip", ["link", "del", "veth-an"]]
  ];
}

export async function setupNamespace({ netns = NETNS, proxyPort = PROXY_PORT, exec = run } = {}) {
  // Torn down first so a resumed or restarted VM does not fail on a namespace that
  // already exists from its previous life.
  for (const [command, args] of teardownCommands({ netns })) {
    await exec(command, args).catch(() => {});
  }
  for (const [command, args] of setupCommands({ netns, proxyPort })) {
    await exec(command, args);
  }
  log.info("netns.ready", { netns, proxy: `${HOST_ADDR}:${proxyPort}` });
  return { netns, proxyUrl: `http://${HOST_ADDR}:${proxyPort}` };
}
