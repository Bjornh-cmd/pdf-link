const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function resolveWebAuthnContext(req, { baseUrl, rpName }) {
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const hostHeader = forwardedHost || req.get("host") || "";
  const hostname = hostHeader.split(":")[0].toLowerCase();

  let proto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!proto) {
    proto = req.secure ? "https" : "http";
  }

  const requestOrigin = hostHeader
    ? `${proto}://${hostHeader}`
    : baseUrl.replace(/\/$/, "");

  let rpId;
  if (process.env.RP_ID?.trim()) {
    rpId = process.env.RP_ID.trim();
  } else if (hostname) {
    rpId = hostname;
  } else {
    try {
      rpId = new URL(baseUrl).hostname;
    } catch {
      rpId = "localhost";
    }
  }

  if (DEV_HOSTS.has(hostname) && DEV_HOSTS.has(rpId) && hostname !== rpId) {
    rpId = hostname;
  }

  return {
    rpName,
    rpId,
    origin: requestOrigin,
    hostname,
  };
}
