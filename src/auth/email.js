import crypto from "node:crypto";
import express from "express";
import { Resend } from "resend";
import { getEmailTokens, saveEmailTokens } from "./store.js";

const TOKEN_TTL_MS = 15 * 60 * 1000;
const emailRequestCounts = new Map();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function checkEmailRateLimit(ip) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  let entry = emailRequestCounts.get(ip);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
    emailRequestCounts.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= max;
}

async function pruneExpiredTokens(tokens) {
  const now = Date.now();
  return tokens.filter((t) => t.expiresAt > now);
}

export function createEmailRouter({ baseUrl, allowedEmail, emailFrom, resendApiKey }) {
  const router = express.Router();
  const resend = resendApiKey ? new Resend(resendApiKey) : null;

  router.post("/request", async (req, res) => {
    const ip = getClientIp(req);
    if (!checkEmailRateLimit(ip)) {
      return res.status(429).json({ error: "Te veel verzoeken. Probeer later opnieuw." });
    }

    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const allowed = allowedEmail.trim().toLowerCase();

    const okMessage = { ok: true, message: "Controleer je e-mail voor de inloglink." };

    if (!email || email !== allowed) {
      return res.json(okMessage);
    }

    if (!resend) {
      return res.status(503).json({ error: "E-mail is niet geconfigureerd." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    const stored = await getEmailTokens();
    const tokens = await pruneExpiredTokens(stored.tokens || []);
    tokens.push({ hash: tokenHash, email, expiresAt, used: false });
    await saveEmailTokens({ tokens });

    const verifyUrl = `${baseUrl.replace(/\/$/, "")}/api/auth/email/verify?token=${encodeURIComponent(token)}`;

    try {
      await resend.emails.send({
        from: emailFrom,
        to: email,
        subject: "Inloglink — PDF Link",
        html: `
          <p>Klik op de link om in te loggen en PDF's te uploaden:</p>
          <p><a href="${verifyUrl}">Inloggen</a></p>
          <p>Deze link is 15 minuten geldig en kan één keer gebruikt worden.</p>
        `,
      });
    } catch (err) {
      console.error("Resend error:", err);
      return res.status(500).json({ error: "Kon e-mail niet versturen." });
    }

    res.json(okMessage);
  });

  router.get("/verify", async (req, res) => {
    const token = String(req.query.token || "");
    if (!token) {
      return res.redirect("/?error=invalid_token");
    }

    const tokenHash = hashToken(token);
    const stored = await getEmailTokens();
    const tokens = await pruneExpiredTokens(stored.tokens || []);
    const index = tokens.findIndex((t) => t.hash === tokenHash && !t.used);

    if (index === -1) {
      return res.redirect("/?error=invalid_token");
    }

    const record = tokens[index];
    tokens[index] = { ...record, used: true };
    await saveEmailTokens({ tokens });

    req.session.user = { method: "email", email: record.email };
    req.session.save((err) => {
      if (err) {
        console.error(err);
        return res.redirect("/?error=session");
      }
      res.redirect("/?logged_in=1");
    });
  });

  return router;
}
