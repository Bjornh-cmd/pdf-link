import {
  startAuthentication,
  startRegistration,
} from "https://esm.sh/@simplewebauthn/browser@13.1.1";

const authSection = document.getElementById("auth-section");
const uploadSection = document.getElementById("upload-section");
const alertEl = document.getElementById("alert");
const emailForm = document.getElementById("email-form");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadResult = document.getElementById("upload-result");
const viewUrlInput = document.getElementById("view-url");
const downloadUrlInput = document.getElementById("download-url");
const passkeyHint = document.getElementById("passkey-hint");
const passkeyRegisterBtn = document.getElementById("passkey-register-btn");
const passkeyLoginBtn = document.getElementById("passkey-login-btn");

function showAlert(message, type = "error") {
  alertEl.textContent = message;
  alertEl.className = `alert ${type}`;
  alertEl.classList.remove("hidden");
}

function hideAlert() {
  alertEl.classList.add("hidden");
}

function setAuthenticated(authenticated) {
  authSection.classList.toggle("hidden", authenticated);
  uploadSection.classList.toggle("hidden", !authenticated);
}

async function refreshAuth() {
  const res = await fetch("/api/auth/status", { credentials: "include" });
  const data = await res.json();
  setAuthenticated(data.authenticated);
  return data;
}

async function refreshPasskeyUi() {
  const res = await fetch("/api/auth/passkey/status");
  const data = await res.json();
  if (data.canRegisterWithoutLogin) {
    passkeyHint.textContent =
      "Nog geen passkey op deze server. Registreer eenmalig of log in met e-mail.";
    passkeyRegisterBtn.classList.remove("hidden");
  } else if (data.hasPasskeys) {
    passkeyHint.textContent = "Gebruik je passkey om in te loggen.";
    passkeyRegisterBtn.classList.add("hidden");
  } else {
    passkeyHint.textContent = "Log eerst in met e-mail om een passkey te registreren.";
    passkeyRegisterBtn.classList.add("hidden");
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const name = tab.dataset.tab;
    document.getElementById("panel-email").classList.toggle("hidden", name !== "email");
    document.getElementById("panel-passkey").classList.toggle("hidden", name !== "passkey");
  });
});

emailForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();
  const email = new FormData(emailForm).get("email");
  const res = await fetch("/api/auth/email/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) {
    showAlert(data.error || "Verzoek mislukt.");
    return;
  }
  showAlert(data.message, "success");
});

async function passkeyRegister() {
  hideAlert();
  const optRes = await fetch("/api/auth/passkey/register/options", {
    method: "POST",
    credentials: "include",
  });
  const options = await optRes.json();
  if (!optRes.ok) {
    showAlert(options.error || "Registratie niet mogelijk.");
    return;
  }
  const attResp = await startRegistration({ optionsJSON: options });
  const verRes = await fetch("/api/auth/passkey/register/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(attResp),
  });
  const verData = await verRes.json();
  if (!verRes.ok) {
    showAlert(verData.error || "Registratie mislukt.");
    return;
  }
  showAlert("Passkey geregistreerd. Je bent ingelogd.", "success");
  await refreshAuth();
  await refreshPasskeyUi();
}

async function passkeyLogin() {
  hideAlert();
  const optRes = await fetch("/api/auth/passkey/login/options", {
    method: "POST",
    credentials: "include",
  });
  const options = await optRes.json();
  if (!optRes.ok) {
    showAlert(options.error || "Inloggen niet mogelijk.");
    return;
  }
  const attResp = await startAuthentication({ optionsJSON: options });
  const verRes = await fetch("/api/auth/passkey/login/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(attResp),
  });
  const verData = await verRes.json();
  if (!verRes.ok) {
    showAlert(verData.error || "Inloggen mislukt.");
    return;
  }
  showAlert("Ingelogd met passkey.", "success");
  await refreshAuth();
}

passkeyRegisterBtn.addEventListener("click", passkeyRegister);
passkeyLoginBtn.addEventListener("click", passkeyLogin);

document.getElementById("logout-btn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  uploadResult.classList.add("hidden");
  hideAlert();
  await refreshAuth();
  await refreshPasskeyUi();
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  if (file) uploadFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) uploadFile(file);
  fileInput.value = "";
});

async function uploadFile(file) {
  hideAlert();
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    showAlert("Alleen PDF-bestanden zijn toegestaan.");
    return;
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    showAlert(data.error || "Upload mislukt.");
    return;
  }
  viewUrlInput.value = data.viewUrl;
  downloadUrlInput.value = data.downloadUrl;
  uploadResult.classList.remove("hidden");
  showAlert("PDF geüpload. Deel de links hieronder.", "success");
}

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-copy");
    const input = document.getElementById(id);
    await navigator.clipboard.writeText(input.value);
    showAlert("Link gekopieerd.", "success");
  });
});

const params = new URLSearchParams(window.location.search);
if (params.get("error") === "invalid_token") {
  showAlert("Ongeldige of verlopen inloglink.");
  history.replaceState({}, "", "/");
} else if (params.get("logged_in") === "1") {
  showAlert("Je bent ingelogd.", "success");
  history.replaceState({}, "", "/");
}

await refreshAuth();
await refreshPasskeyUi();
