import crypto from "node:crypto";
import express from "express";
import { Resend } from "resend";
import { getEmailTokenList, saveEmailTokenList } from "./store.js";

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

function pruneExpiredTokens(tokens) {
  const now = Date.now();
  return tokens.filter((t) => t.expiresAt > now);
}

function formatFromAddress(emailFrom) {
  const trimmed = emailFrom.trim();
  if (trimmed.includes("<")) return trimmed;
  return `PDF Link <${trimmed}>`;
}

export function createEmailRouter({ baseUrl, allowedEmail, emailFrom, resendApiKey }) {
  const router = express.Router();
  const resend = resendApiKey ? new Resend(resendApiKey) : null;
  const from = formatFromAddress(emailFrom);

  router.post("/request", async (req, res) => {
    const ip = getClientIp(req);
    if (!checkEmailRateLimit(ip)) {
      return res.status(429).json({ error: "Te veel verzoeken. Probeer later opnieuw." });
    }

    const allowed = allowedEmail.trim().toLowerCase();
    const requested = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const email = requested && requested === allowed ? requested : allowed;

    const okMessage = {
      ok: true,
      message: `Controleer ${allowed} voor de inloglink.`,
    };

    if (!resend) {
      return res.status(503).json({ error: "E-mail is niet geconfigureerd." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    const tokens = pruneExpiredTokens(await getEmailTokenList());
    tokens.push({ hash: tokenHash, email, expiresAt, used: false });
    await saveEmailTokenList(tokens);

    const verifyUrl = `${baseUrl.replace(/\/$/, "")}/api/auth/email/verify?token=${encodeURIComponent(token)}`;

    try {
      const { data, error } = await resend.emails.send({
        from,
        to: email,
        subject: "Inloglink — PDF Link",
        html: `
          <p>Klik op de link om in te loggen en PDF's te uploaden:</p>
          <p><a href="${verifyUrl}">Inloggen</a></p>
          <p>Deze link is 15 minuten geldig en kan één keer gebruikt worden.</p>
        `,
      });

      if (error) {
        console.error("Resend API error:", error);
        const domainIssue =
          error.statusCode === 403 &&
          String(error.message || "").toLowerCase().includes("domain");
        return res.status(500).json({
          error: domainIssue
            ? "Afzenderdomein is niet geverifieerd bij Resend. Voeg support.snubstad.nl toe onder Domains, of gebruik tijdelijk onboarding@resend.dev (alleen test)."
            : "Kon e-mail niet versturen. Controleer Resend API-key en afzender.",
        });
      }

      console.log("Resend: e-mail verstuurd", { id: data?.id, to: email });
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
    const tokens = pruneExpiredTokens(await getEmailTokenList());
    const index = tokens.findIndex((t) => t.hash === tokenHash && !t.used);

    if (index === -1) {
      return res.redirect("/?error=invalid_token");
    }

    const record = tokens[index];
    tokens[index] = { ...record, used: true };
    await saveEmailTokenList(tokens);

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
