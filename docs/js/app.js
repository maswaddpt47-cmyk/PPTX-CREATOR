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

  /* Wires click/keyboard/drag-drop on a dropzone to a (hidden) file input,
     calling onFiles(FileList) whenever a selection is made — shared by all
     three modes' dropzones below. */
  function wireDropzone(dropzoneEl, inputEl, onFiles) {
    dropzoneEl.addEventListener("click", () => inputEl.click());
    dropzoneEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        inputEl.click();
      }
    });
    inputEl.addEventListener("change", () => onFiles(inputEl.files));
    ["dragenter", "dragover"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzoneEl.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzoneEl.classList.remove("dragover");
      })
    );
    dropzoneEl.addEventListener("drop", (e) => onFiles(e.dataTransfer.files));
  }

  function renderThemeSummary(el, matchedThemeIds, unmatched) {
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
    el.innerHTML = html;
    el.hidden = false;
  }

  /* ---------- Mode switching ---------- */

  const tabPptx = document.getElementById("tab-pptx");
  const tabPix = document.getElementById("tab-pix");
  const tabMerge = document.getElementById("tab-merge");
  const tabMulti = document.getElementById("tab-multi");
  const modePptx = document.getElementById("mode-pptx");
  const modePix = document.getElementById("mode-pix");
  const modeMerge = document.getElementById("mode-merge");
  const modeMulti = document.getElementById("mode-multi");
  const tabs = [
    { key: "pptx", tab: tabPptx, panel: modePptx },
    { key: "pix", tab: tabPix, panel: modePix },
    { key: "merge", tab: tabMerge, panel: modeMerge },
    { key: "multi", tab: tabMulti, panel: modeMulti },
  ];

  let mode = "pptx";

  function refreshGenerateEnabled() {
    if (mode === "pptx") generateBtn.disabled = !sourceFile;
    else if (mode === "pix") generateBtn.disabled = pixFiles.length === 0;
    else if (mode === "merge") generateBtn.disabled = !mergeSourceFile || mergePixFiles.length === 0;
    else generateBtn.disabled = multiFiles.length < 2;
  }

  function setMode(next) {
    mode = next;
    for (const t of tabs) {
      const active = t.key === mode;
      t.tab.classList.toggle("active", active);
      t.tab.setAttribute("aria-selected", String(active));
      t.panel.hidden = !active;
    }
    setStatus("");
    refreshGenerateEnabled();
  }

  tabPptx.addEventListener("click", () => setMode("pptx"));
  tabPix.addEventListener("click", () => setMode("pix"));
  tabMerge.addEventListener("click", () => setMode("merge"));
  tabMulti.addEventListener("click", () => setMode("multi"));

  /* ---------- Mode 1: adapt an existing PPTX ---------- */

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");

  let sourceFile = null;

  function setFile(files) {
    const file = files && files[0];
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

  wireDropzone(dropzone, fileInput, setFile);

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

  wireDropzone(pixDropzone, pixFileInput, setPixFiles);

  ambianceInput.addEventListener("change", () => {
    ambianceFiles = Array.from(ambianceInput.files || []);
  });

  async function generateFromPix() {
    setStatus("Lecture des captures (reconnaissance de texte hors-ligne)…");
    const { matchedThemeIds, unmatched } = await window.PG_PIX_EXTRACT.extractPixModel(
      pixFiles,
      (i, total, filename) => setStatus(`Lecture de la capture ${i + 1}/${total} : ${filename}`)
    );

    renderThemeSummary(pixSummaryEl, matchedThemeIds, unmatched);

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

  /* ---------- Mode 3: enrich an old PPTX with PIX screenshots ---------- */

  const mergePptxDropzone = document.getElementById("merge-pptx-dropzone");
  const mergePptxInput = document.getElementById("merge-pptx-file-input");
  const mergePptxNameEl = document.getElementById("merge-pptx-file-name");
  const mergePixDropzone = document.getElementById("merge-pix-dropzone");
  const mergePixInput = document.getElementById("merge-pix-file-input");
  const mergePixListEl = document.getElementById("merge-pix-file-list");
  const mergeAmbianceInput = document.getElementById("merge-ambiance-input");
  const mergeSummaryEl = document.getElementById("merge-summary");
  const mergeTargetMinutesEl = document.getElementById("merge-target-minutes");
  const mergeMinutesPerSlideEl = document.getElementById("merge-minutes-per-slide");

  let mergeSourceFile = null;
  let mergePixFiles = [];
  let mergeAmbianceFiles = [];

  mergeTargetMinutesEl.value = window.PG_MERGE_BUILD.DEFAULT_TARGET_MINUTES;
  mergeMinutesPerSlideEl.textContent = window.PG_MERGE_BUILD.MINUTES_PER_SLIDE;

  function setMergeSourceFile(files) {
    const file = files && files[0];
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("Le fichier doit être un .pptx.", "error");
      return;
    }
    mergeSourceFile = file;
    mergePptxNameEl.textContent = file.name;
    setStatus("");
    refreshGenerateEnabled();
  }

  function setMergePixFiles(files) {
    mergePixFiles = Array.from(files || []).filter((f) => /\.(png|jpe?g)$/i.test(f.name));
    mergePixListEl.textContent = mergePixFiles.length
      ? `${mergePixFiles.length} capture(s) : ${mergePixFiles.map((f) => f.name).join(", ")}`
      : "";
    setStatus("");
    mergeSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  wireDropzone(mergePptxDropzone, mergePptxInput, setMergeSourceFile);
  wireDropzone(mergePixDropzone, mergePixInput, setMergePixFiles);

  mergeAmbianceInput.addEventListener("change", () => {
    mergeAmbianceFiles = Array.from(mergeAmbianceInput.files || []);
  });

  async function generateFromMerge() {
    setStatus("Lecture des captures (reconnaissance de texte hors-ligne)…");
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
    const sourceBuffer = await mergeSourceFile.arrayBuffer();

    const targetMinutes = parseInt(mergeTargetMinutesEl.value, 10) || window.PG_MERGE_BUILD.DEFAULT_TARGET_MINUTES;
    const { blob, pixResult, keptCount } = await window.PG_MERGE_BUILD.generateMergedDeck(
      gabaritBuffer,
      sourceBuffer,
      mergePixFiles,
      mergeAmbianceFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value, targetMinutes },
      (i, total, filename) => setStatus(`Lecture de la capture ${i + 1}/${total} : ${filename}`)
    );

    renderThemeSummary(mergeSummaryEl, pixResult.matchedThemeIds, pixResult.unmatched);

    const outName = (titreInput.value.trim() || "preparation-pix-enrichie") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    const minutes = keptCount * window.PG_MERGE_BUILD.MINUTES_PER_SLIDE;
    setStatus(
      `Livrable généré : ${outName}\n${keptCount} section(s) retenue(s) (~${minutes} min).` +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Mode 4: merge several old-charte PPTX into one deck ---------- */

  const multiDropzone = document.getElementById("multi-dropzone");
  const multiFileInput = document.getElementById("multi-file-input");
  const multiFileListEl = document.getElementById("multi-file-list");
  const multiSummaryEl = document.getElementById("multi-summary");

  let multiFiles = [];

  function setMultiFiles(files) {
    multiFiles = Array.from(files || []).filter((f) => /\.pptx$/i.test(f.name));
    multiFileListEl.textContent = multiFiles.length
      ? multiFiles.map((f, i) => `Source ${i + 1} : ${f.name}`).join(" · ")
      : "";
    setStatus("");
    multiSummaryEl.hidden = true;
    refreshGenerateEnabled();
  }

  wireDropzone(multiDropzone, multiFileInput, setMultiFiles);

  async function generateFromMulti() {
    setStatus(`Lecture de ${multiFiles.length} source(s)…`);
    const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);

    const { blob, sectionCount, droppedCount } = await window.PG_MULTI_BUILD.generateMultiDeck(
      gabaritBuffer,
      multiFiles,
      { titre: titreInput.value, thematique: thematiqueInput.value }
    );

    multiSummaryEl.innerHTML =
      `<strong>${sectionCount} section(s) retenue(s)</strong> à partir de ${multiFiles.length} source(s).` +
      (droppedCount
        ? `<p class="unmatched">${droppedCount} diapositive(s) écartée(s) car trop proches d'un contenu déjà retenu (source précédente prioritaire).</p>`
        : "");
    multiSummaryEl.hidden = false;

    const outName = (titreInput.value.trim() || "fusion-pptx") + " - mis en forme.pptx";
    triggerDownload(blob, outName);
    setStatus(
      `Livrable généré : ${outName}\n${sectionCount} section(s) retenue(s) à partir de ${multiFiles.length} source(s).` +
        "\nVérifiez les messages d'alerte rouge éventuels avant diffusion.",
      "success"
    );
  }

  /* ---------- Illustration library panel ---------- */

  const illustrationCountEl = document.getElementById("illustration-count");
  const illustrationGridEl = document.getElementById("illustration-grid");
  const illustrationPanel = document.getElementById("illustration-library-panel");

  async function refreshIllustrationPanel() {
    const all = await window.PG_ILLUSTRATIONS.getAllIllustrations();
    illustrationCountEl.textContent = all.length;
    if (!illustrationPanel.open) return; // avoid building object URLs while collapsed
    illustrationGridEl.innerHTML = "";
    for (const entry of all) {
      const blob = new Blob([entry.bytes], { type: `image/${entry.ext === "jpg" ? "jpeg" : entry.ext}` });
      const url = URL.createObjectURL(blob);
      const item = document.createElement("div");
      item.className = "illustration-item";
      item.innerHTML = `<img src="${url}" alt="" /><div class="illustration-label"></div>`;
      item.querySelector(".illustration-label").textContent = entry.label;

      const actions = document.createElement("div");
      actions.className = "illustration-item-actions";

      const dlBtn = document.createElement("button");
      dlBtn.type = "button";
      dlBtn.textContent = "Télécharger";
      dlBtn.addEventListener("click", () => {
        const safeName = (entry.label || "illustration").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
        triggerDownload(blob, `${safeName}.${entry.ext}`);
      });
      actions.appendChild(dlBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Supprimer";
      delBtn.addEventListener("click", async () => {
        await window.PG_ILLUSTRATIONS.deleteIllustration(entry.id);
        refreshIllustrationPanel();
      });
      actions.appendChild(delBtn);

      item.appendChild(actions);
      illustrationGridEl.appendChild(item);
    }
  }

  illustrationPanel.addEventListener("toggle", refreshIllustrationPanel);
  refreshIllustrationPanel();

  const illustrationExportBtn = document.getElementById("illustration-export-btn");
  const illustrationImportInput = document.getElementById("illustration-import-input");

  illustrationExportBtn.addEventListener("click", async () => {
    const json = await window.PG_ILLUSTRATIONS.exportLibrary();
    triggerDownload(new Blob([json], { type: "application/json" }), "bibliotheque-illustrations.json");
  });

  illustrationImportInput.addEventListener("change", async () => {
    const file = illustrationImportInput.files && illustrationImportInput.files[0];
    illustrationImportInput.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { total, imported, skipped } = await window.PG_ILLUSTRATIONS.importLibrary(text);
      await refreshIllustrationPanel();
      setStatus(`Bibliothèque importée : ${imported}/${total} nouvelle(s) illustration(s) ajoutée(s)${skipped ? ` (${skipped} déjà présente(s))` : ""}.`, "success");
    } catch (err) {
      setStatus(`Erreur d'import : ${err.message}`, "error");
    }
  });

  /* ---------- Shared generate button ---------- */

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    try {
      if (mode === "pptx") await generateFromPptx();
      else if (mode === "pix") await generateFromPix();
      else if (mode === "merge") await generateFromMerge();
      else await generateFromMulti();
      await refreshIllustrationPanel();
    } catch (err) {
      console.error(err);
      setStatus(`Erreur : ${err.message}`, "error");
    } finally {
      refreshGenerateEnabled();
    }
  });

  setMode("pptx");
})();
