/**
 * Light client-side gate for private use.
 * Installed Home Screen / standalone PWA: unlock once (localStorage).
 * Regular browser tab: unlock per session (sessionStorage).
 */

const APP_PASSWORD = "Not4RealWorld";
const UNLOCK_KEY = "mynattrack_unlock_v1";
const UNLOCK_TOKEN = "ok";

/** True when running as installed web app (iPad Home Screen, etc.). */
function isInstalledWebApp() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari legacy flag
  return window.navigator.standalone === true;
}

function storage() {
  return isInstalledWebApp() ? localStorage : sessionStorage;
}

function isUnlocked() {
  try {
    return storage().getItem(UNLOCK_KEY) === UNLOCK_TOKEN;
  } catch {
    return false;
  }
}

function unlockWithPassword(password) {
  if (String(password ?? "") !== APP_PASSWORD) return false;
  try {
    storage().setItem(UNLOCK_KEY, UNLOCK_TOKEN);
  } catch {
    /* still allow this session in memory */
  }
  return true;
}

/**
 * Show lock UI until the correct password is entered (or already unlocked).
 * @returns {Promise<void>}
 */
export function ensureUnlocked() {
  if (isUnlocked()) {
    document.documentElement.classList.add("app-unlocked");
    document.documentElement.classList.remove("app-locked");
    const gate = document.getElementById("auth-gate");
    if (gate) gate.hidden = true;
    return Promise.resolve();
  }

  document.documentElement.classList.add("app-locked");
  document.documentElement.classList.remove("app-unlocked");

  const gate = document.getElementById("auth-gate");
  const form = document.getElementById("auth-form");
  const input = document.getElementById("auth-password");
  const error = document.getElementById("auth-error");

  if (!gate || !form || !input) {
    return Promise.reject(new Error("Auth gate missing from page"));
  }

  gate.hidden = false;
  input.value = "";
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  return new Promise((resolve) => {
    const onSubmit = (e) => {
      e.preventDefault();
      if (unlockWithPassword(input.value)) {
        form.removeEventListener("submit", onSubmit);
        document.documentElement.classList.add("app-unlocked");
        document.documentElement.classList.remove("app-locked");
        gate.hidden = true;
        resolve();
        return;
      }
      if (error) {
        error.hidden = false;
        error.textContent = "Incorrect password";
      }
      input.select();
    };
    form.addEventListener("submit", onSubmit);
    requestAnimationFrame(() => input.focus());
  });
}
