export function requireAuth(req, res, next) {
  if (req.session?.user?.method === "email") {
    return next();
  }
  res.status(401).json({ error: "Niet ingelogd" });
}

export function isAuthenticated(req) {
  return req.session?.user?.method === "email";
}
