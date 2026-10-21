const AUTH_METHODS = new Set(["email", "passkey"]);

export function requireAuth(req, res, next) {
  if (req.session?.user && AUTH_METHODS.has(req.session.user.method)) {
    return next();
  }
  res.status(401).json({ error: "Niet ingelogd" });
}

export function isAuthenticated(req) {
  return Boolean(req.session?.user && AUTH_METHODS.has(req.session.user.method));
}
