const authSection = document.getElementById("auth-section");
const uploadSection = document.getElementById("upload-section");
const alertEl = document.getElementById("alert");
const emailForm = document.getElementById("email-form");
const loginEmailEl = document.getElementById("login-email");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadResult = document.getElementById("upload-result");
const viewUrlInput = document.getElementById("view-url");
const downloadUrlInput = document.getElementById("download-url");
const passkeyLoginHint = document.getElementById("passkey-login-hint");
const passkeyLoginBtn = document.getElementById("passkey-login-btn");
const passkeySettings = document.getElementById("passkey-settings");
const passkeySettingsDesc = document.getElementById("passkey-settings-desc");
const passkeyRegisterBtn = document.getElementById("passkey-register-btn");
const passkeySettingsStatus = document.getElementById("passkey-settings-status");

function showAlert(message, type = "error") {
  alertEl.textContent = message;
  alertEl.className = `alert ${type}`;
  alertEl.classList.remove("hidden");
}

function hideAlert() {
  alertEl.classList.add("hidden");
}

const pdfLibraryEl = document.getElementById("pdf-library");
const libraryEmptyEl = document.getElementById("library-empty");

function setAuthenticated(authenticated) {
  authSection.classList.toggle("hidden", authenticated);
  uploadSection.classList.toggle("hidden", !authenticated);
  if (authenticated) {
    loadPdfLibrary();
  }
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
  showAlert("Link gekopieerd.", "success");
}

async function loadPdfLibrary() {
  if (!pdfLibraryEl) return;
  const res = await fetch("/api/pdfs", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) {
    showAlert(data.error || "Kon PDF-lijst niet laden.");
    return;
  }

  pdfLibraryEl.innerHTML = "";
  const pdfs = data.pdfs || [];
  libraryEmptyEl.classList.toggle("hidden", pdfs.length > 0);

  for (const pdf of pdfs) {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="pdf-item-main">
        <p class="pdf-item-name"></p>
        <p class="pdf-item-meta"></p>
      </div>
      <div class="pdf-item-actions">
        <a class="btn btn-ghost" href="" target="_blank" rel="noopener">Openen</a>
        <button type="button" class="btn btn-ghost" data-copy-view>Kopieer bekijken</button>
        <button type="button" class="btn btn-primary" data-copy-download>Kopieer download</button>
      </div>
    `;
    li.querySelector(".pdf-item-name").textContent = pdf.originalName;
    li.querySelector(".pdf-item-meta").textContent = `${formatDate(pdf.uploadedAt)} · ${formatSize(pdf.sizeBytes)}`;
    li.querySelector("a").href = pdf.viewUrl;
    li.querySelector("[data-copy-view]").addEventListener("click", () => copyText(pdf.viewUrl));
    li.querySelector("[data-copy-download]").addEventListener("click", () => copyText(pdf.downloadUrl));
    pdfLibraryEl.appendChild(li);
  }
}

document.querySelectorAll("[data-workspace]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-workspace]").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const name = tab.dataset.workspace;
    document.getElementById("workspace-upload").classList.toggle("hidden", name !== "upload");
    document.getElementById("workspace-library").classList.toggle("hidden", name !== "library");
    if (name === "library") loadPdfLibrary();
  });
});

async function loadWebAuthn() {
  return import("/vendor/simplewebauthn/index.js");
}

function passkeyRequestBody() {
  return JSON.stringify({ clientOrigin: window.location.origin });
}

function assertRpIdMatchesPage(options) {
  const rpId = options?.rp?.id;
  if (!rpId) return null;
  if (rpId === window.location.hostname) return null;
  return `Passkey-domein mismatch: server "${rpId}", browser "${window.location.hostname}". Zet BASE_URL in Coolify op ${window.location.origin}.`;
}

async function refreshAuth() {
  const res = await fetch("/api/auth/status", { credentials: "include" });
  const data = await res.json();
  if (data.user?.email && loginEmailEl) {
    loginEmailEl.textContent = data.user.email;
  }
  setAuthenticated(data.authenticated);
  await updatePasskeyPanels(data);
  return data;
}

async function refreshPasskeyStatus() {
  const res = await fetch("/api/auth/passkey/status");
  if (!res.ok) return null;
  return res.json();
}

async function updatePasskeyPanels(authData) {
  const status = await refreshPasskeyStatus();
  if (!status) return;

  if (!authData?.authenticated) {
    if (status.hasPasskeys) {
      passkeyLoginHint.textContent =
        "Log in met Windows Hello, Face ID of een security key.";
      passkeyLoginBtn.classList.remove("hidden");
    } else {
      passkeyLoginHint.textContent =
        "Nog geen passkey. Log eerst in met e-mail en configureer een passkey onder Upload.";
      passkeyLoginBtn.classList.add("hidden");
    }
    return;
  }

  const isEmailSession = authData.user?.method === "email";
  passkeySettings.classList.toggle("hidden", !isEmailSession);

  if (!isEmailSession) return;

  if (status.hasPasskeys) {
    passkeySettingsDesc.textContent =
      "Je passkey is actief. Je kunt voortaan ook via het tabblad Passkey inloggen.";
    passkeyRegisterBtn.classList.add("hidden");
    passkeySettingsStatus.textContent = "Status: geconfigureerd";
  } else {
    passkeySettingsDesc.textContent =
      "Registreer een passkey om later zonder e-mail in te loggen.";
    passkeyRegisterBtn.classList.remove("hidden");
    passkeySettingsStatus.textContent = "Status: niet geconfigureerd";
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
  const res = await fetch("/api/auth/email/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({}),
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
  let startRegistration;
  try {
    ({ startRegistration } = await loadWebAuthn());
  } catch {
    showAlert("Passkey-module kon niet laden. Vernieuw de pagina.");
    return;
  }
  const optRes = await fetch("/api/auth/passkey/register/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: passkeyRequestBody(),
  });
  const options = await optRes.json();
  if (!optRes.ok) {
    showAlert(options.error || "Registratie niet mogelijk.");
    return;
  }
  const rpMismatch = assertRpIdMatchesPage(options);
  if (rpMismatch) {
    showAlert(rpMismatch);
    return;
  }
  let attResp;
  try {
    attResp = await startRegistration({ optionsJSON: options });
  } catch (err) {
    showAlert(String(err?.message || err) || "Passkey-registratie geannuleerd of mislukt.");
    return;
  }
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
  showAlert(verData.message || "Passkey geconfigureerd.", "success");
  await refreshAuth();
}

async function passkeyLogin() {
  hideAlert();
  let startAuthentication;
  try {
    ({ startAuthentication } = await loadWebAuthn());
  } catch {
    showAlert("Passkey-module kon niet laden. Vernieuw de pagina.");
    return;
  }
  const optRes = await fetch("/api/auth/passkey/login/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: passkeyRequestBody(),
  });
  const options = await optRes.json();
  if (!optRes.ok) {
    showAlert(options.error || "Inloggen niet mogelijk.");
    return;
  }
  const rpMismatch = assertRpIdMatchesPage(options);
  if (rpMismatch) {
    showAlert(rpMismatch);
    return;
  }
  let attResp;
  try {
    attResp = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    showAlert(String(err?.message || err) || "Inloggen geannuleerd.");
    return;
  }
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
  await loadPdfLibrary();
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
  showAlert("Je bent ingelogd. Je kunt nu een passkey configureren.", "success");
  history.replaceState({}, "", "/");
}

try {
  const configRes = await fetch("/api/config");
  if (configRes.ok) {
    const config = await configRes.json();
    if (config.loginEmail && loginEmailEl) {
      loginEmailEl.textContent = config.loginEmail;
    }
  }
  await refreshAuth();
} catch (err) {
  console.error(err);
  authSection.classList.remove("hidden");
  uploadSection.classList.add("hidden");
  showAlert("Kon de pagina niet volledig laden. Vernieuw de pagina.");
}
