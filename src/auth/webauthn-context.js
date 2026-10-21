const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isProxyInternalHost(hostname) {
  if (!hostname) return true;
  if (DEV_HOSTS.has(hostname)) return false;
  return !hostname.includes(".");
}

function readClientOrigin(req) {
  const raw = req.body?.clientOrigin;
  if (typeof raw !== "string" || !raw.startsWith("http")) return null;
  try {
    const u = new URL(raw);
    return { origin: u.origin, hostname: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

export function resolveWebAuthnContext(req, { baseUrl, rpName }) {
  const configuredOrigin = baseUrl.replace(/\/$/, "");
  const configuredHost = hostFromUrl(baseUrl);
  const rpIdFromEnv = process.env.RP_ID?.trim();
  const client = readClientOrigin(req);

  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = forwardedHost || req.get("host") || "";
  const proxyHost = hostHeader.split(":")[0].toLowerCase();

  let proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!proto) {
    proto = req.secure ? "https" : "http";
  }

  if (client?.hostname) {
    const matchesConfigured =
      configuredHost && client.hostname === configuredHost;
    const matchesEnv = rpIdFromEnv && client.hostname === rpIdFromEnv.toLowerCase();
    const proxyBroken = isProxyInternalHost(proxyHost);

    if (matchesConfigured || matchesEnv || (proxyBroken && client.hostname.includes("."))) {
      return {
        rpName,
        rpId: rpIdFromEnv || client.hostname,
        origin: client.origin,
        hostname: client.hostname,
      };
    }
  }

  if (proxyHost && !isProxyInternalHost(proxyHost)) {
    const origin = hostHeader ? `${proto}://${hostHeader}` : configuredOrigin;
    return {
      rpName,
      rpId: rpIdFromEnv || proxyHost,
      origin,
      hostname: proxyHost,
    };
  }

  if (configuredHost) {
    const origin = configuredOrigin.startsWith("http")
      ? configuredOrigin
      : `https://${configuredHost}`;
    return {
      rpName,
      rpId: rpIdFromEnv || configuredHost,
      origin,
      hostname: configuredHost,
    };
  }

  const fallbackHost = proxyHost || "localhost";
  return {
    rpName,
    rpId: rpIdFromEnv || fallbackHost,
    origin: hostHeader ? `${proto}://${hostHeader}` : `http://${fallbackHost}`,
    hostname: fallbackHost,
  };
}
