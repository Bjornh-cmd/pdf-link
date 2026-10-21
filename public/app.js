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
  if (data.user?.email && loginEmailEl) {
    loginEmailEl.textContent = data.user.email;
  }
  setAuthenticated(data.authenticated);
  return data;
}

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
