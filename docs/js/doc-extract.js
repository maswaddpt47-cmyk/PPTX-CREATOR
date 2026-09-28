/* Reads a .docx (Word, zip+XML — same family as .pptx) and produces the
   same content model shape as source-extract.js's extractSourceModel():
   { title: {main, intro, tags}, programme: [{heading, body}],
     contentSlides: [{title, intro, items, image, table}], closing, tokenize }

   Section structure comes from Word's built-in heading styles (Titre 1 /
   Heading1 = section, Titre 2 / Heading2 = one content slide, Titre 3 /
   Heading3 = an item heading within that slide) — a document with no
   heading styles at all is rejected with a clear message rather than
   guessed at, the same way extractSourceModel() rejects a .pptx with under
   3 slides instead of guessing.

   Scope, explicitly: text and structure only. Images embedded in the
   source .docx are not extracted (unlike the .pptx path, which pulls each
   slide's own picture) — every content slide falls back to the
   illustration library like any .pptx slide with no picture of its own
   (build.js's pickImage()). Legacy binary .doc (Word 97-2003) is out of
   scope entirely: it isn't zip+XML, and the app never receives one (the
   dropzone rejects it before this module is called — see app.js). */
(function (global) {
  "use strict";

  const { tokenize } = window.PG_SOURCE;

  const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  function wTag(root, local) {
    return Array.from(root.getElementsByTagNameNS(W_NS, local));
  }

  function firstWTag(root, local) {
    return root.getElementsByTagNameNS(W_NS, local)[0] || null;
  }

  /* Word/LibreOffice both normally write the English style id
     ("Heading1", "Title"...) regardless of UI language, but LibreOffice can
     encode a space in it as "_20_" or "_x0020_" — normalize before
     matching. *Hypothèse non vérifiée* : testé contre un .docx construit à
     la main (XML minimal), pas un export réel de Word ni de LibreOffice —
     voir CHANTIERS.md. */
  function normalizeStyleId(id) {
    return (id || "").replace(/_x0020_/gi, " ").replace(/_20_/g, " ").trim();
  }

  function paragraphStyleId(p) {
    const pPr = firstWTag(p, "pPr");
    if (!pPr) return "";
    const pStyle = firstWTag(pPr, "pStyle");
    if (!pStyle) return "";
    return normalizeStyleId(pStyle.getAttributeNS(W_NS, "val") || pStyle.getAttribute("w:val") || "");
  }

  function classifyStyle(styleId) {
    const s = styleId.toLowerCase();
    if (s === "title") return "title";
    if (s === "subtitle") return "subtitle";
    const m = s.match(/^heading\s*([1-9])$/);
    if (m) return "h" + m[1];
    return "";
  }

  /* Concatenates a paragraph's run text in document order. w:tab becomes a
     space so tab-separated runs don't glue together; everything else that
     isn't w:t text is ignored (fine for plain prose — no attempt at
     preserving rich formatting, this only needs to feed the same
     title/heading/body strings the .pptx path extracts). */
  function paragraphText(p) {
    let out = "";
    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType !== 1) continue;
        if (child.namespaceURI === W_NS && child.localName === "t") {
          out += child.textContent;
        } else if (child.namespaceURI === W_NS && child.localName === "tab") {
          out += " ";
        } else {
          walk(child);
        }
      }
    };
    walk(p);
    return out.replace(/\s+/g, " ").trim();
  }

  // Mirrors source-extract.js's CLOSING_KEYWORDS — small enough that
  // sharing it isn't worth a cross-module export.
  const CLOSING_KEYWORDS = ["recapitulat", "conclusion", "resume", "bilan"];

  function looksLikeClosing(title) {
    const norm = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return CLOSING_KEYWORDS.some((k) => norm.includes(k));
  }

  function newSlide(title) {
    return { title, intro: "", items: [], image: null, table: null };
  }

  async function parseDocxToModel(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file("word/document.xml");
    if (!docFile) {
      throw new Error("Ce fichier ne ressemble pas à un .docx valide (word/document.xml manquant).");
    }
    const xml = await docFile.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) {
      throw new Error("Impossible de lire ce .docx (XML invalide).");
    }

    const body = firstWTag(doc, "body");
    const paragraphs = wTag(body, "p")
      .map((p) => ({ style: classifyStyle(paragraphStyleId(p)), text: paragraphText(p) }))
      .filter((p) => p.text);

    const hasHeading = paragraphs.some((p) => /^h[1-9]$/.test(p.style));
    if (!hasHeading) {
      throw new Error(
        "Ce document n'utilise aucun style de titre Word (Titre 1, Titre 2...) — structurez-le avec ces styles pour qu'il puisse être découpé en diapositives."
      );
    }

    const titlePara = paragraphs.find((p) => p.style === "title");
    const subtitlePara = paragraphs.find((p) => p.style === "subtitle");
    const firstHeading = paragraphs.find((p) => /^h[1-9]$/.test(p.style));
    const title = {
      main: titlePara ? titlePara.text : firstHeading.text,
      intro: subtitlePara ? subtitlePara.text : "",
      tags: [],
    };

    const programme = [];
    const contentSlides = [];
    let currentProgramme = null;
    let currentSlide = null;
    let currentItem = null;
    let sawBodyUnderH1 = false;

    const flushSlide = () => {
      if (currentSlide) contentSlides.push(currentSlide);
      currentSlide = null;
      currentItem = null;
    };

    for (const p of paragraphs) {
      if (p === titlePara || p === subtitlePara) continue;

      if (p.style === "h1") {
        flushSlide();
        currentProgramme = { heading: p.text, body: "" };
        programme.push(currentProgramme);
        sawBodyUnderH1 = false;
        continue;
      }
      if (p.style === "h2") {
        flushSlide();
        currentSlide = newSlide(p.text);
        continue;
      }
      if (p.style === "h3") {
        if (!currentSlide) currentSlide = newSlide(currentProgramme ? currentProgramme.heading : "");
        currentItem = { heading: p.text, body: "" };
        currentSlide.items.push(currentItem);
        continue;
      }
      // Any deeper heading level (h4+) is treated as body text under the
      // current item/slide rather than opening a new nesting level — the
      // gabarit's own card layout only has title/intro/items, no
      // sub-sub-sections.

      // Plain paragraph or bullet/numbered list item.
      if (currentSlide) {
        if (currentItem) {
          currentItem.body = currentItem.body ? currentItem.body + "\n" + p.text : p.text;
        } else if (!currentSlide.intro && !currentSlide.items.length) {
          currentSlide.intro = p.text;
        } else {
          currentSlide.items.push({ heading: "", body: p.text });
        }
      } else if (currentProgramme) {
        // Content directly under a Titre 1, before any Titre 2 — keep it
        // (as the programme entry's body, for the "liens suggérés"
        // keyword matching) and also surface it as its own slide so it
        // isn't silently dropped just because the author didn't add a
        // Titre 2.
        currentProgramme.body = currentProgramme.body
          ? currentProgramme.body + "\n" + p.text
          : p.text;
        if (!sawBodyUnderH1) {
          currentSlide = newSlide(currentProgramme.heading);
          currentSlide.intro = p.text;
          sawBodyUnderH1 = true;
        } else {
          currentSlide.items.push({ heading: "", body: p.text });
        }
      }
      // A body paragraph before any heading at all (other than Titre/Sous-titre)
      // has nowhere to go and is dropped — same as a .pptx source's own
      // stray shapes outside any recognized slide layout.
    }
    flushSlide();

    let closing = null;
    if (contentSlides.length && looksLikeClosing(contentSlides[contentSlides.length - 1].title)) {
      closing = contentSlides.pop();
    }

    return { title, programme, contentSlides, closing, tokenize };
  }

  global.PG_DOC = { parseDocxToModel };
})(window);
