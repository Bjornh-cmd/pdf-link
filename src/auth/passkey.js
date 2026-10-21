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

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getOrigin(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}

function toStoredCredential(credential, extra) {
  return {
    id: credential.id,
    publicKeyB64: Buffer.from(credential.publicKey).toString("base64"),
    counter: credential.counter,
    transports: extra.transports,
    deviceType: extra.deviceType,
    backedUp: extra.backedUp,
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
  if (isAuthenticated(req) && req.session.user?.method === "email") return true;
  return false;
}

export function createPasskeyRouter({ rpName, rpId, baseUrl }) {
  const router = express.Router();
  const origin = getOrigin(baseUrl);

  router.get("/status", async (_req, res) => {
    const credentials = await getCredentials();
    res.json({
      hasPasskeys: credentials.length > 0,
      canRegisterWithoutLogin: credentials.length === 0,
    });
  });

  router.post("/register/options", async (req, res) => {
    if (!(await canRegisterPasskey(req))) {
      return res.status(403).json({ error: "Passkey registratie niet toegestaan." });
    }

    const credentials = await getCredentials();
    const userId = "admin";
    const userName = process.env.ALLOWED_UPLOAD_EMAIL || "admin@local";

    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
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
        expectedOrigin: origin,
        expectedRPID: rpId,
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
      }),
    );

    await saveCredentials(credentials);
    await deleteChallenge(`reg:${userId}`);

    req.session.user = { method: "passkey", credentialId: credential.id };
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "Sessie fout." });
      res.json({ verified: true });
    });
  });

  router.post("/login/options", async (_req, res) => {
    const credentials = await getCredentials();
    if (credentials.length === 0) {
      return res.status(400).json({ error: "Geen passkey geregistreerd." });
    }

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: credentials.map((c) => ({
        id: c.id,
        transports: c.transports,
      })),
      userVerification: "preferred",
    });

    await setChallenge("auth", {
      challenge: options.challenge,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
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
        expectedOrigin: origin,
        expectedRPID: rpId,
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
