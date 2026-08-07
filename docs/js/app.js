(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const fileNameEl = document.getElementById("file-name");
  const titreInput = document.getElementById("titre");
  const thematiqueInput = document.getElementById("thematique");
  const generateBtn = document.getElementById("generate-btn");
  const statusEl = document.getElementById("status");

  let sourceFile = null;

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? ` ${kind}` : "");
  }

  function setFile(file) {
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("Le fichier doit être un .pptx.", "error");
      return;
    }
    sourceFile = file;
    fileNameEl.textContent = file.name;
    generateBtn.disabled = false;
    setStatus("");
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
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    setFile(file);
  });

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  generateBtn.addEventListener("click", async () => {
    if (!sourceFile) return;
    generateBtn.disabled = true;
    setStatus("Génération en cours…");
    try {
      const gabaritBuffer = base64ToArrayBuffer(window.PG_GABARIT_BASE64);
      const sourceBuffer = await sourceFile.arrayBuffer();

      const { blob } = await window.PG_BUILD.generateDeck(gabaritBuffer, sourceBuffer, {
        titre: titreInput.value,
        thematique: thematiqueInput.value,
      });

      const outName = sourceFile.name.replace(/\.pptx$/i, "") + " - mis en forme.pptx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus(
        `Livrable généré : ${outName}\nVérifiez les messages d'alerte rouge éventuels avant diffusion.`,
        "success"
      );
    } catch (err) {
      console.error(err);
      setStatus(`Erreur : ${err.message}`, "error");
    } finally {
      generateBtn.disabled = false;
    }
  });
})();
