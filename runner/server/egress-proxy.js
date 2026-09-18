import http from "node:http";
import net from "node:net";
import { log } from "./log.js";

// The only way out of the analysis namespace.
//
// The package gets a network namespace whose single reachable address is this proxy,
// so "what may a package talk to" is one allowlist in one place rather than a set of
// packet-filter rules that have to anticipate every destination. That is the property
// an outside researcher's package needs: it can reach report-service and nothing else,
// enforced rather than asserted.
//
// Hostnames, not addresses. report-server sits behind a load balancer whose addresses
// change, so an IP allowlist would break later and the fix would be to widen it. The
// name is resolved here, outside the namespace, which also means the package never
// needs DNS and DNS is never a hole.

export function hostAllowed(host, allowlist) {
  if (!host) return false;
  const name = host.toLowerCase();
  return allowlist.some((entry) => {
    const allowed = entry.toLowerCase();
    // A leading dot allows the subdomains of a zone and not the zone itself, which is
    // the only wildcard worth having: `.concordqa.org` must not match `evilconcordqa.org`.
    return allowed.startsWith(".") ? name.endsWith(allowed) : name === allowed;
  });
}

export function parseAuthority(authority) {
  // CONNECT carries `host:port`; an IPv6 literal is bracketed.
  const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(String(authority ?? ""));
  if (!match) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: match[1], port };
}

export function createEgressProxy({ allowlist, allowedPorts = [443], onDecision = () => {} }) {
  const server = http.createServer((req, res) => {
    // Plain HTTP is refused outright: everything the package needs is HTTPS, and
    // proxying cleartext would mean this process handling researcher data in the open.
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "only CONNECT is proxied" }));
  });

  server.on("connect", (req, clientSocket, head) => {
    const target = parseAuthority(req.url);
    const allowed = target && hostAllowed(target.host, allowlist) && allowedPorts.includes(target.port);
    onDecision({ authority: req.url, allowed });

    if (!allowed) {
      log.warn("egress.refused", { authority: req.url });
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }

    const upstream = net.connect(target.port, target.host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });

    // Both halves are torn down together: a half-open pair would leak a socket per
    // refused or failed connection, and a package can make many.
    const close = () => {
      upstream.destroy();
      clientSocket.destroy();
    };
    upstream.on("error", (err) => {
      log.warn("egress.upstream_error", { authority: req.url, error: err.message });
      close();
    });
    clientSocket.on("error", close);
    upstream.on("close", close);
    clientSocket.on("close", close);
  });

  return server;
}
