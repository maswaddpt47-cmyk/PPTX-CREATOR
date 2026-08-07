(function () {
  "use strict";

  const titreInput = document.getElementById("titre");
  const thematiqueInput = document.getElementById("thematique");
  const generateBtn = document.getElementById("generate-btn");
  const statusEl = document.getElementById("status");

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? ` ${kind}` : "");
  }

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /* ---------- Mode switching ---------- */

  const tabPptx = document.getElementById("tab-pptx");
  const tabPix = document.getElementById("tab-pix");
  const modePptx = document.getElementById("mode-pptx");
  const modePix = document.getElementById("mode-pix");

  let mode = "pptx";

  function refreshGenerateEnabled() {
    generateBtn.disabled = mode === "pptx" ? !sourceFile : pixFiles.length === 0;
  }

  function setMode(next) {
    mode = next;
    const isPptx = mode === "pptx";
    tabPptx.classList.toggle("active", isPptx);
    tabPix.classList.toggle("active", !isPptx);
    tabPptx.setAttribute("aria-selected", String(isPptx));
    tabPix.setAttribute("aria-selected", String(!isPptx));
    modePptx.hidden = !isPptx;
    modePix.hidden = isPptx;
    setStatus("");
    refreshGenerateEnabled();
  }

  tabPptx.addEventListener("click", () => setMode("pptx"));
  tabPix.addEventListener("click", () => setMode("pix"));

  /* ---------- Mode 1: adapt an existing PPTX ---------- */

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");

  let sourceFile = null;

  function setFile(file) {
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("Le fichier doit être un .pptx.", "error");
      return;
    }
    sourceFile = file;
    fileNameEl.textContent = file.name;
    setStatus("");
    refreshGenerateEnabled();
  }

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    })
  );
  dropzone.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

  async function generateFromPptx() {
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const sourceBuffer = await sourceFile.arrayBuffer();

    const { blob } = await window.PG_BUILD.generateDeck(gabaritBuffer, sourceBuffer, {
      titre: titreInput.value,
      thematique: thematiqueInput.value,
    });

    const outName = sourceFile.name.replace(/\.pptx$/i, "") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\nVérifiez les messages d'alerte rouge éventuels avant diffusion.`,
      "success"
    );
  }

  /* ---------- Mode 2: generate from PIX screenshots ---------- */

  const pixDropzone = document.getElementById("pix-dropzone");
  const pixFileInput = document.getElementById("pix-file-input");
  const pixFileListEl = document.getElementById("pix-file-list");
  const ambianceInput = document.getElementById("ambiance-input");
  const pixSummaryEl = document.getElementById("pix-summary");

  let pixFiles = [];
  let ambianceFiles = [];

  function setPixFiles(files) {
    pixFiles = Array.from(files || []).filter((f) => /\.(png|jpe?g)$/i.test(f.name));
    pixFileListEl.textContent = pixFiles.length
      ? `${pixFiles.length} capture(s) : ${pixFiles.map((f) => f.name).join(", ")}`
      : "";
    setStatus("");
    pixSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  pixDropzone.addEventListener("click", () => pixFileInput.click());
  pixDropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pixFileInput.click();
    }
  });
  pixFileInput.addEventListener("change", () => setPixFiles(pixFileInput.files));

  ["dragenter", "dragover"].forEach((evt) =>
    pixDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      pixDropzone.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    pixDropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      pixDropzone.classList.remove("dragover");
    })
  );
  pixDropzone.addEventListener("drop", (e) => setPixFiles(e.dataTransfer.files));

  ambianceInput.addEventListener("change", () => {
    ambianceFiles = Array.from(ambianceInput.files || []);
  });

  function renderPixSummary(matchedThemeIds, unmatched) {
    const { THEMES } = window.PG_PIX_THEMES;
    const matchedThemes = THEMES.filter((t) => matchedThemeIds.includes(t.id));
    let html = "";
    if (matchedThemes.length) {
      html +=
        "<strong>Thèmes reconnus (" +
        matchedThemes.length +
        ") :</strong><ul>" +
        matchedThemes.map((t) => `<li>${t.heading}</li>`).join("") +
        "</ul>";
    } else {
      html += "<strong>Aucun thème reconnu.</strong>";
    }
    if (unmatched.length) {
      html +=
        '<p class="unmatched"><strong>Captures non reconnues (' +
        unmatched.length +
        ") :</strong></p><ul class=\"unmatched\">" +
        unmatched.map((u) => `<li>${u.filename} — ${u.reason}</li>`).join("") +
        "</ul>";
    }
    pixSummaryEl.innerHTML = html;
    pixSummaryEl.hidden = false;
  }

  async function generateFromPix() {
    setStatus("Lecture des captures (reconnaissance de texte hors-ligne)…");
    const { matchedThemeIds, unmatched } = await window.PG_PIX_EXTRACT.extractPixModel(
      pixFiles,
      (i, total, filename) => setStatus(`Lecture de la capture ${i + 1}/${total} : ${filename}`)
    );

    renderPixSummary(matchedThemeIds, unmatched);

    if (!matchedThemeIds.length) {
      setStatus(
        "Aucun thème n'a été reconnu avec assez de confiance dans ces captures. Essayez des captures plus nettes, ou complétez la bibliothèque de thèmes.",
        "error"
      );
      return;
    }

    setStatus("Génération du support en cours…");
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const { blob } = await window.PG_PIX_BUILD.generatePixDeck(
      gabaritBuffer,
      matchedThemeIds,
      unmatched,
      ambianceFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value }
    );

    const outName = (titreInput.value.trim() || "preparation-pix") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n${matchedThemeIds.length} thème(s) inclus` +
        (unmatched.length ? `, ${unmatched.length} capture(s) non reconnue(s) signalée(s) dans le récapitulatif.` : ".") +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Shared generate button ---------- */

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    try {
      if (mode === "pptx") await generateFromPptx();
      else await generateFromPix();
    } catch (err) {
      console.error(err);
      setStatus(`Erreur : ${err.message}`, "error");
    } finally {
      refreshGenerateEnabled();
    }
  });

  setMode("pptx");
})();
