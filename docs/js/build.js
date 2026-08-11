/* Orchestrates the full pipeline: gabarit + source ArrayBuffers -> final
   .pptx Blob. Ties together ooxml.js (package plumbing), gabarit.js (slide
   edits specific to the Département 47 template) and source-extract.js /
   classifier.js (reading and grouping the uploaded deck). */
(function (global) {
  "use strict";

  const { PptxPackage, DeckBuilder, NS, firstTag } = window.PG_OOXML;
  const G = window.PG_GABARIT;
  const { extractSourceModel, tokenize } = window.PG_SOURCE;
  const { classifyContentSlides } = window.PG_CLASSIFIER;

  // Shared session-pacing assumption (per the user's own "3 min/section"
  // instruction) and target-duration -> slide-cap conversion, reused by
  // every mode's build module so "durée cible" behaves identically
  // everywhere it appears.
  const MINUTES_PER_SLIDE = 3;
  const DEFAULT_TARGET_MINUTES = 60;
  function computeMaxSlides(targetMinutes) {
    const minutes = targetMinutes > 0 ? targetMinutes : DEFAULT_TARGET_MINUTES;
    return Math.max(1, Math.floor(minutes / MINUTES_PER_SLIDE));
  }

  const KNOWN_RESOURCES = [
    {
      title: "Cybermalveillance.gouv.fr — assistance et prévention numérique",
      url: "cybermalveillance.gouv.fr",
      keywords: ["securite", "phishing", "hamecon", "spam", "mot", "passe", "pirat", "arnaque", "frauduleux", "suspect"],
    },
    {
      title: "CNIL — protéger sa vie privée en ligne",
      url: "cnil.fr",
      keywords: ["confidentialite", "donnees", "prive", "vie", "securite"],
    },
    {
      title: "France Services — accompagnement aux démarches numériques",
      url: "france-services.gouv.fr",
      keywords: ["accompagnement", "numerique", "administratif", "demarche", "service"],
    },
    {
      title: "PIX — évaluer et certifier ses compétences numériques",
      url: "pix.fr",
      keywords: ["competence", "certification", "pix", "apprendre", "formation"],
    },
    {
      title: "Aide en ligne Gmail (Google)",
      url: "support.google.com/mail",
      keywords: ["gmail", "google"],
    },
    {
      title: "Aide en ligne Outlook (Microsoft)",
      url: "support.microsoft.com/office/outlook",
      keywords: ["outlook", "microsoft"],
    },
    {
      title: "Aide en ligne Proton Mail",
      url: "proton.me/support/mail",
      keywords: ["proton"],
    },
  ];

  function pickLienSuggestions(model) {
    const corpus = [
      model.title.main,
      model.title.intro,
      ...model.programme.map((c) => `${c.heading} ${c.body}`),
    ].join(" ");
    const tokens = new Set(tokenize(corpus));
    const scored = KNOWN_RESOURCES.map((res) => ({
      res,
      score: res.keywords.reduce((n, k) => n + (tokens.has(k) ? 1 : 0), 0),
    }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 4).map((s) => ({ title: s.res.title, url: s.res.url }));
  }

  /* Minimal PNG/JPEG dimension sniffers — needed to place the source's
     illustration in its image slot without distorting its aspect ratio
     (this environment has no <img> to measure). Unsupported formats fall
     back to filling the slot as-is. */
  function getImageDimensions(bytes, ext) {
    try {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (ext === "png" && bytes.length >= 24 && dv.getUint32(0) === 0x89504e47) {
        const width = dv.getUint32(16);
        const height = dv.getUint32(20);
        if (width > 0 && height > 0) return { width, height };
      }
      if (ext === "jpg" || ext === "jpeg") {
        // Standalone markers carry no length field (and, critically, no
        // dimensions) — RST0-RST7 only ever appear inside entropy-coded
        // scan data, but TEM (0x01) can legitimately appear in the header.
        // Treating any of these as "has a 2-byte length to skip", like a
        // naive scanner would, desyncs the walk and can return garbage
        // width/height read from unrelated bytes instead of stopping.
        const STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);
        let offset = 2;
        while (offset + 9 < bytes.length) {
          if (dv.getUint8(offset) !== 0xff) break;
          const marker = dv.getUint8(offset + 1);
          if (marker === 0xd8 || marker === 0xd9 || STANDALONE.has(marker)) {
            offset += 2;
            continue;
          }
          if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            const height = dv.getUint16(offset + 5);
            const width = dv.getUint16(offset + 7);
            if (width > 0 && height > 0) return { width, height };
            break;
          }
          offset += 2 + dv.getUint16(offset + 2);
        }
      }
    } catch (e) {
      /* fall through to null */
    }
    return null;
  }

  /* dims of 0 (or a getImageDimensions parsing miss that slipped through)
     would otherwise divide-by-zero into Infinity/NaN offsets — invalid
     OOXML that PowerPoint silently strips on open. Falling back to the
     slot as-is is exactly what happens when dims is null already. */
  function fitContain(slot, imgW, imgH) {
    if (!(imgW > 0) || !(imgH > 0)) return slot;
    const slotAspect = slot.cx / slot.cy;
    const imgAspect = imgW / imgH;
    let cx, cy;
    if (imgAspect > slotAspect) {
      cx = slot.cx;
      cy = slot.cx / imgAspect;
    } else {
      cy = slot.cy;
      cx = slot.cy * imgAspect;
    }
    return { x: slot.x + (slot.cx - cx) / 2, y: slot.y + (slot.cy - cy) / 2, cx, cy };
  }

  function slideText(slide) {
    const parts = [slide.title, slide.intro];
    for (const item of slide.items || []) parts.push(item.heading, item.body);
    return parts.join(" ");
  }

  /* Slides with no image of their own (common in real decks — not every
     slide has one) get a chance to borrow a similarity-matched illustration
     from the persistent library (illustration-library.js) before falling
     back to no illustration at all. A slide's own extracted image always
     wins when it has one. */
  async function pickImage(slide) {
    if (slide.image) return slide.image;
    if (!window.PG_ILLUSTRATIONS) return null;
    const match = await window.PG_ILLUSTRATIONS.findBestMatch(slideText(slide));
    return match ? { bytes: match.bytes, ext: match.ext } : null;
  }

  async function renderContentSlide(deck, slide) {
    if (slide.table) {
      const clone = await deck.cloneSlide(7);
      const doc = await deck.loadSlideDoc(clone.num);
      G.insertTable(doc, {
        title: slide.title,
        intro: slide.intro,
        headerRow: slide.table.headerRow,
        rows: slide.table.rows,
        missingTitle: !slide.title,
      });
      deck.saveSlideDoc(clone.num, doc);
      return clone;
    }

    const image = await pickImage(slide);
    // importMedia() returns null for an unrecognized image format (e.g. a
    // codec PowerPoint itself wouldn't render) — treat that exactly like no
    // image at all rather than embedding a part PowerPoint will refuse to
    // read and strip on open.
    const mediaPath = image ? deck.importMedia(image.bytes, image.ext) : null;
    const clone = await deck.cloneSlide(7);
    const doc = await deck.loadSlideDoc(clone.num);
    const hasImage = !!mediaPath;
    const items = slide.items.length
      ? slide.items
      : [{ heading: "", body: G.alertText("contenu de cette diapositive") }];
    const { imageSlot } = G.fillCardLayout(doc, {
      title: slide.title,
      intro: slide.intro,
      items,
      missingTitle: !slide.title,
      hasImage,
    });
    deck.saveSlideDoc(clone.num, doc);

    if (hasImage) {
      const rId = await deck.addSlideImageRel(clone.num, mediaPath);
      const dims = getImageDimensions(image.bytes, image.ext);
      const rect = dims ? fitContain(imageSlot, dims.width, dims.height) : imageSlot;
      const doc2 = await deck.loadSlideDoc(clone.num);
      const spTree = firstTag(doc2, NS.p, "spTree");
      spTree.appendChild(G.buildPicture(doc2, { ...rect, rId }));
      deck.saveSlideDoc(clone.num, doc2);
    }

    return clone;
  }

  /* Renders a content model (title/programme/contentSlides/closing — the
     same shape extractSourceModel() produces) into an already-init()'d
     DeckBuilder and sets the deck's final slide order. Shared by both
     generateDeck() (source = an uploaded PPTX) and generatePixDeck() in
     pix-build.js (source = OCR'd PIX screenshots matched against the theme
     library) so the two entry points don't duplicate the rendering pipeline. */
  async function assembleDeck(deck, model, options) {
    const doc1 = await deck.loadSlideDoc(1);
    const titre = options.titre.trim() || model.title.main;
    G.setTitle(doc1, titre, { missing: !titre, fieldLabel: "titre de l'atelier" });
    G.setEyebrow(doc1, options.thematique);
    deck.saveSlideDoc(1, doc1);

    const doc5 = await deck.loadSlideDoc(5);
    if (model.programme.length) {
      G.setSommaireItems(doc5, model.programme.map((c) => c.heading));
    } else {
      G.setSommaireItems(doc5, [G.alertText("sommaire — aucune section détectée dans la source")]);
    }
    deck.saveSlideDoc(5, doc5);

    const orderedRelIds = [
      deck.relIdForExistingSlide(1),
      deck.relIdForExistingSlide(2),
      deck.relIdForExistingSlide(3),
      deck.relIdForExistingSlide(4),
      deck.relIdForExistingSlide(5),
    ];

    const groups = classifyContentSlides(model.contentSlides, model.programme);
    for (let ci = 0; ci < groups.length; ci++) {
      const groupSlides = groups[ci];
      if (!groupSlides.length) continue;

      if (model.programme.length) {
        const divider = await deck.cloneSlide(6);
        const divDoc = await deck.loadSlideDoc(divider.num);
        G.setDividerTitle(divDoc, model.programme[ci].heading);
        deck.saveSlideDoc(divider.num, divDoc);
        orderedRelIds.push(divider.relId);
      }

      for (const slide of groupSlides) {
        const rendered = await renderContentSlide(deck, slide);
        orderedRelIds.push(rendered.relId);
      }
    }

    if (model.closing) {
      const rendered = await renderContentSlide(deck, model.closing);
      orderedRelIds.push(rendered.relId);
    }

    const doc9 = await deck.loadSlideDoc(9);
    G.setLiensSuggestions(doc9, pickLienSuggestions(model));
    deck.saveSlideDoc(9, doc9);
    orderedRelIds.push(deck.relIdForExistingSlide(9));

    orderedRelIds.push(deck.relIdForExistingSlide(10));

    deck.setFinalOrder(orderedRelIds);
    return { groups };
  }

  async function generateDeck(gabaritBuffer, sourceBuffer, options) {
    options = Object.assign({ titre: "", thematique: "", targetMinutes: DEFAULT_TARGET_MINUTES }, options);

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();

    const sourcePkg = await PptxPackage.fromArrayBuffer(sourceBuffer);
    const model = await extractSourceModel(sourcePkg);

    // Trim to the target session length, keeping the source's own slide
    // order (earliest content first) — the closing/recap slide and the
    // gabarit's fixed pages don't count against the budget, only the
    // content slides being presented do.
    const maxSlides = computeMaxSlides(options.targetMinutes);
    const droppedCount = Math.max(0, model.contentSlides.length - maxSlides);
    if (droppedCount) model.contentSlides = model.contentSlides.slice(0, maxSlides);

    const { groups } = await assembleDeck(deck, model, options);
    const blob = await deck.finalize();
    return { blob, model, groups, keptCount: model.contentSlides.length, droppedCount };
  }

  global.PG_BUILD = {
    generateDeck,
    assembleDeck,
    renderContentSlide,
    getImageDimensions,
    pickLienSuggestions,
    MINUTES_PER_SLIDE,
    DEFAULT_TARGET_MINUTES,
    computeMaxSlides,
  };
})(window);
