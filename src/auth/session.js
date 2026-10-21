export function requireAuth(req, res, next) {
  if (req.session?.user) {
    return next();
  }
  res.status(401).json({ error: "Niet ingelogd" });
}

export function isAuthenticated(req) {
  return Boolean(req.session?.user);
}
