import express from "express";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import {
  getCredentials,
  saveCredentials,
  getChallenge,
  setChallenge,
  deleteChallenge,
} from "./store.js";
import { isAuthenticated } from "./session.js";
import { resolveWebAuthnContext } from "./webauthn-context.js";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function toStoredCredential(credential, extra) {
  return {
    id: credential.id,
    publicKeyB64: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: extra.transports,
    deviceType: extra.deviceType,
    backedUp: extra.backedUp,
    rpId: extra.rpId,
  };
}

function fromStoredCredential(stored) {
  return {
    id: stored.id,
    publicKey: Buffer.from(stored.publicKeyB64, "base64"),
    counter: stored.counter,
    transports: stored.transports,
  };
}

async function canRegisterPasskey(req) {
  const credentials = await getCredentials();
  if (credentials.length === 0) return true;
  return isAuthenticated(req) && req.session.user?.method === "email";
}

export function createPasskeyRouter({ rpName, baseUrl }) {
  const router = express.Router();
  const defaults = { baseUrl, rpName };

  router.get("/status", async (req, res) => {
    const credentials = await getCredentials();
    const ctx = resolveWebAuthnContext(req, defaults);
    res.json({
      hasPasskeys: credentials.length > 0,
      passkeyCount: credentials.length,
      canRegisterWithoutLogin: credentials.length === 0,
      rpId: ctx.rpId,
    });
  });

  router.post("/register/options", async (req, res) => {
    if (!(await canRegisterPasskey(req))) {
      return res.status(403).json({
        error: "Log eerst in met e-mail om een passkey te configureren.",
      });
    }

    const ctx = resolveWebAuthnContext(req, defaults);
    const credentials = await getCredentials();
    const userId = "admin";
    const userName = process.env.ALLOWED_UPLOAD_EMAIL || "admin@local";

    const options = await generateRegistrationOptions({
      rpName: ctx.rpName,
      rpID: ctx.rpId,
      userName,
      userID: new TextEncoder().encode(userId),
      attestationType: "none",
      excludeCredentials: credentials.map((c) => ({
        id: c.id,
        transports: c.transports,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    await setChallenge(`reg:${userId}`, {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      rpId: ctx.rpId,
      origin: ctx.origin,
    });

    res.json(options);
  });

  router.post("/register/verify", async (req, res) => {
    if (!(await canRegisterPasskey(req))) {
      return res.status(403).json({ error: "Passkey registratie niet toegestaan." });
    }

    const userId = "admin";
    const stored = await getChallenge(`reg:${userId}`);
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Challenge verlopen." });
    }

    const credentials = await getCredentials();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: stored.challenge,
        expectedOrigin: stored.origin,
        expectedRPID: stored.rpId,
        requireUserVerification: false,
      });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: "Registratie mislukt." });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Registratie niet geverifieerd." });
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    credentials.push(
      toStoredCredential(credential, {
        transports: req.body.response?.transports,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        rpId: stored.rpId,
      }),
    );

    await saveCredentials(credentials);
    await deleteChallenge(`reg:${userId}`);

    res.json({ verified: true, message: "Passkey geconfigureerd." });
  });

  router.post("/login/options", async (req, res) => {
    const ctx = resolveWebAuthnContext(req, defaults);
    const credentials = await getCredentials();
    if (credentials.length === 0) {
      return res.status(400).json({
        error: "Nog geen passkey. Log in met e-mail om er een te instellen.",
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: ctx.rpId,
      allowCredentials: credentials.map((c) => ({
        id: c.id,
        transports: c.transports,
      })),
      userVerification: "preferred",
    });

    await setChallenge("auth", {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
      rpId: ctx.rpId,
      origin: ctx.origin,
    });

    res.json(options);
  });

  router.post("/login/verify", async (req, res) => {
    const stored = await getChallenge("auth");
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Challenge verlopen." });
    }

    const credentials = await getCredentials();
    const credentialId = req.body?.id;
    const dbStored = credentials.find((c) => c.id === credentialId);
    if (!dbStored) {
      return res.status(400).json({ error: "Onbekende passkey." });
    }
    const dbCred = fromStoredCredential(dbStored);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: stored.challenge,
        expectedOrigin: stored.origin,
        expectedRPID: stored.rpId,
        credential: dbCred,
        requireUserVerification: false,
      });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ error: "Inloggen mislukt." });
    }

    if (!verification.verified) {
      return res.status(400).json({ error: "Inloggen niet geverifieerd." });
    }

    dbStored.counter = verification.authenticationInfo.newCounter;
    await saveCredentials(credentials);
    await deleteChallenge("auth");

    req.session.user = { method: "passkey", credentialId: dbStored.id };
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Sessie fout." });
      res.json({ verified: true });
    });
  });

  return router;
}
