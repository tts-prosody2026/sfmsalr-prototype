// ---------- Config ----------
const WORD_LIMIT = 1000;

// ---------- DOM ----------
const textEl       = document.getElementById("text");
const formatEl     = document.getElementById("format");
const btn          = document.getElementById("speakBtn");
const spinner      = document.getElementById("spinner");
const btnLabel     = document.getElementById("btnLabel");
const player       = document.getElementById("player");
const errorEl      = document.getElementById("error");
const downloadLink = document.getElementById("downloadLink");

// Optional meters (script checks existence)
const wordInfo = document.getElementById("wordInfo");
const charInfo = document.getElementById("charInfo");
const wordBar  = document.getElementById("wordBar");

// ---------- Helpers ----------
function tokenizeWords(str) {
  return str.trim().length ? str.trim().split(/\s+/u).filter(Boolean) : [];
}
function countWords(str) { return tokenizeWords(str).length; }
function trimToWordLimit(str, limit) {
  const words = tokenizeWords(str);
  if (words.length <= limit) return str;
  return words.slice(0, limit).join(" ") + " ";
}

function updateMeters() {
  if (!textEl) return;
  const words = countWords(textEl.value);
  const chars = textEl.value.trim().length;
  const pct   = Math.min(100, Math.round((words / WORD_LIMIT) * 100));

  if (wordInfo) wordInfo.textContent = `${words} / ${WORD_LIMIT} words`;
  if (charInfo) charInfo.textContent = `${chars} chars`;
  if (wordBar)  wordBar.style.width = pct + "%";

  if (errorEl) {
    if (words >= WORD_LIMIT * 0.9 && words < WORD_LIMIT) {
      errorEl.textContent = "Approaching 1000-word limit.";
      errorEl.classList.remove("hidden");
    } else if (words >= WORD_LIMIT) {
      errorEl.textContent = "Trimmed to 1000 words.";
      errorEl.classList.remove("hidden");
    } else {
      errorEl.classList.add("hidden");
      errorEl.textContent = "";
    }
  }
}

function enforceLimitDuringInput() {
  if (!textEl) return;
  const val = textEl.value;
  if (countWords(val) > WORD_LIMIT) {
    const caretEnd = textEl.selectionEnd || val.length;
    textEl.value = trimToWordLimit(val, WORD_LIMIT);
    textEl.selectionStart = textEl.selectionEnd = Math.min(caretEnd, textEl.value.length);
  }
  updateMeters();
}

// ---------- Main TTS ----------
async function speak() {
  if (!textEl || !formatEl || !player || !btn || !spinner || !btnLabel || !errorEl || !downloadLink) {
    console.warn("Missing required elements.");
    return;
  }

  errorEl.classList.add("hidden");
  downloadLink.classList.add("hidden");

  // Revoke old object URL
  if (player.src && player.src.startsWith("blob:")) {
    URL.revokeObjectURL(player.src);
  }
  player.pause();
  player.removeAttribute("src");
  player.load();

  // Enforce limit & update meters before sending
  textEl.value = trimToWordLimit(textEl.value, WORD_LIMIT);
  updateMeters();

  const text = textEl.value.trim();
  if (!text) {
    errorEl.textContent = "Please enter some text.";
    errorEl.classList.remove("hidden");
    return;
  }

  const fmt = formatEl.value;

  btn.disabled = true;
  spinner.classList.remove("hidden");
  btnLabel.textContent = "Synthesizing...";

  try {
    const resp = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, format: fmt }),
    });

    if (!resp.ok) {
      let msg = "";
      try { msg = await resp.text(); } catch {}
      throw new Error(`Server error (${resp.status}): ${String(msg).slice(0, 300)}`);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);

    player.src = url;
    player.currentTime = 0;
    player.load();

    await new Promise((resolve) => {
      const ready = () => {
        player.removeEventListener("canplaythrough", ready);
        resolve();
      };
      player.addEventListener("canplaythrough", ready, { once: true });
    });

    // Small guard to avoid first-frame clipping
    await new Promise((r) => setTimeout(r, 150));

    try { await player.play(); } catch { /* user can hit Play */ }

    // Enable download
    const ext = blob.type.includes("wav") ? "wav" : "mp3";
    downloadLink.href = url;
    downloadLink.download = `tts-${Date.now()}.${ext}`;
    downloadLink.classList.remove("hidden");
  } catch (err) {
    errorEl.textContent = (err && err.message) ? err.message : "Unknown error";
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    spinner.classList.add("hidden");
    btnLabel.textContent = "Speak";
  }
}

// ---------- Events ----------
if (textEl) {
  textEl.addEventListener("input", enforceLimitDuringInput);
  updateMeters();
}

if (btn) btn.addEventListener("click", speak);

// Ctrl/Cmd + Enter to Speak
document.addEventListener("keydown", (e) => {
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  if ((isMac ? e.metaKey : e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    if (!btn?.disabled) speak();
  }
});

console.log("✅ app.js (1000-word limit) loaded");
