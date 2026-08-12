/* "Depuis un thème" mode: no source PPTX and no PIX screenshots — just a
   theme name, a target duration, and optional observations. Two content
   sources, tried in this order (see CLAUDE.md decision — curated first,
   API only as a fallback, never blended within one deck):

   1. The curated PIX theme library (pix-themes.js), matched via the same
      matchTheme() keyword scoring pix-extract.js already uses on OCR text
      — free, offline, no data leaves the browser. Only usable when the
      catalog happens to already cover the requested theme.
   2. The Claude API (Messages API, tool use forced to a fixed JSON shape),
      called directly from the browser with the user's own API key —
      the one deliberate exception to "nothing leaves the browser" in this
      app, opt-in and clearly labelled as such in the UI.

   Either path produces the same {title, programme, contentSlides, closing}
   model shape extractSourceModel()/buildPixModel() produce, so build.js's
   assembleDeck() renders it with no new rendering logic. */
(function (global) {
  "use strict";

  const { PptxPackage, DeckBuilder } = window.PG_OOXML;
  const { assembleDeck, computeMaxSlides, MINUTES_PER_SLIDE, DEFAULT_TARGET_MINUTES } = window.PG_BUILD;
  const { matchTheme } = window.PG_PIX_EXTRACT;
  const { THEMES } = window.PG_PIX_THEMES;
  const { tokenize } = window.PG_SOURCE;

  /* matchTheme()'s keyword-count scoring (MIN_SCORE=2 distinct keyword
     hits) was tuned for OCR'd screenshot text, which is naturally long and
     redundant. A short typed theme name often can't reach 2 keyword hits
     even against its own theme — confirmed in production: typing "Santé
     en ligne" verbatim (the theme's own heading) scored only 1 ("sante";
     "ligne" isn't a keyword and shouldn't be, it's far too generic)
     and fell through to the API unnecessarily. This adds a fast path in
     front of it: if the query's tokens are a subset of a theme's own
     heading/title tokens (or vice versa), that's effectively the user
     typing the theme's own name — a much stronger, still low-risk signal
     than a handful of shared keywords, since it requires full containment
     rather than a couple of incidental hits. */
  function matchThemeForScratch(themeQuery) {
    const queryTokens = new Set(tokenize(themeQuery));
    if (queryTokens.size) {
      const isSubset = (a, b) => a.size > 0 && [...a].every((tok) => b.has(tok));
      const exact = THEMES.find((t) => {
        const headingTokens = new Set(tokenize(t.heading));
        const titleTokens = new Set(tokenize(t.title));
        return (
          isSubset(queryTokens, headingTokens) ||
          isSubset(headingTokens, queryTokens) ||
          isSubset(queryTokens, titleTokens) ||
          isSubset(titleTokens, queryTokens)
        );
      });
      if (exact) return { theme: exact, score: Infinity };
    }
    const fallback = matchTheme(themeQuery);
    if (!fallback) return null;
    // Guard against a long, compound, multi-topic query matching a narrow
    // theme through just a couple of incidentally shared generic keywords.
    // Confirmed in production: a real request combining 3 distinct asks
    // ("Démarches administratives : comment s'y retrouver ?", "service-
    // public.fr", "Créer son Identité Numérique" — clearly meant as
    // several separate themes) matched "Site institutionnel" via just the
    // 2 shared words "demarches"/"administratives", producing a single
    // slide instead of a properly-sized deck covering the actual request.
    // matchTheme()'s MIN_SCORE=2 is an absolute floor tuned for OCR text;
    // for a typed query, also require the matched keywords to explain a
    // meaningful share of the query itself, not just clear that floor.
    const coverage = fallback.score / queryTokens.size;
    return coverage >= 0.3 ? fallback : null;
  }

  const API_KEY_STORAGE_KEY = "pg-anthropic-api-key";
  const API_MODEL = "claude-sonnet-5";
  const API_URL = "https://api.anthropic.com/v1/messages";
  const API_VERSION = "2023-06-01";

  function getStoredApiKey() {
    try {
      return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function setStoredApiKey(key) {
    try {
      if (key) localStorage.setItem(API_KEY_STORAGE_KEY, key);
      else localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch {
      // Storage blocked (private mode, locked-down profile) — the key just
      // won't persist across reloads; not fatal to a single generation.
    }
  }

  /* One or more curated themes -> the same model shape a real source deck
     would produce, so it can go straight into assembleDeck(). Each theme
     becomes its own programme section — assembleDeck() already renders a
     dedicated divider + its own cards per section, so a "family" of
     related themes (see pix-themes.js's `group` field — e.g. "Santé en
     ligne" plus its "Mon Espace Santé"/"Doctolib" companions) comes out as
     a multi-section deck, each section laid out as if it were its own
     standalone presentation, with zero new rendering logic. */
  function modelFromCuratedThemes(themes, titre) {
    return {
      title: { main: (titre || "").trim() || themes[0].title, intro: "", tags: [] },
      programme: themes.map((t) => ({ heading: t.heading, body: t.programmeBody })),
      contentSlides: themes.map((t) => ({
        title: t.title,
        intro: t.intro,
        items: t.items.map(([heading, body]) => ({ heading, body })),
        image: null,
        table: null,
      })),
      closing: null,
    };
  }

  const DECK_TOOL = {
    name: "build_deck_content",
    description:
      "Fournit le contenu structuré d'un support de formation, prêt à être mis en forme en diapositives.",
    input_schema: {
      type: "object",
      properties: {
        titleMain: { type: "string", description: "Titre principal de l'atelier." },
        titleIntro: { type: "string", description: "Une phrase d'accroche pour la page de titre." },
        sections: {
          type: "array",
          description: "2 à 4 grandes sections thématiques de l'atelier, dans l'ordre de présentation.",
          items: {
            type: "object",
            properties: {
              sectionHeading: { type: "string", description: "Titre court de la section (sommaire)." },
              sectionSummary: { type: "string", description: "Une phrase résumant la section (sommaire)." },
              slides: {
                type: "array",
                description: "Diapositives de contenu de cette section.",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    intro: { type: "string", description: "Optionnel : une phrase d'introduction avant les cartouches." },
                    items: {
                      type: "array",
                      description: "3 à 5 cartouches titre/texte pour cette diapositive.",
                      items: {
                        type: "object",
                        properties: {
                          heading: { type: "string" },
                          body: { type: "string" },
                        },
                        required: ["heading", "body"],
                      },
                    },
                  },
                  required: ["title", "items"],
                },
              },
            },
            required: ["sectionHeading", "sectionSummary", "slides"],
          },
        },
        closing: {
          type: "object",
          description: "Diapositive de récapitulatif final.",
          properties: {
            title: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { heading: { type: "string" }, body: { type: "string" } },
                required: ["heading", "body"],
              },
            },
          },
          required: ["title", "items"],
        },
      },
      required: ["titleMain", "sections"],
    },
  };

  function buildPrompt({ theme, notes, maxSlides, titre }) {
    let prompt =
      `Tu prépares le contenu d'un atelier d'inclusion numérique pour des adultes peu à l'aise avec ` +
      `le numérique (public d'un Département français, médiation numérique). Thème demandé : "${theme}".\n\n` +
      `Consignes :\n` +
      `- Français clair, phrases courtes, zéro jargon non expliqué.\n` +
      `- Ton pratique et concret : quoi faire, comment, dans quel ordre — pas de discours théorique.\n` +
      `- Découpe le thème en sections cohérentes, chacune avec quelques diapositives de contenu.\n` +
      `- Prévois au total environ ${maxSlides} diapositive(s) de contenu (hors page de titre, sommaire, ` +
      `dividers de section et récapitulatif final).\n` +
      `- Termine par une diapositive de récapitulatif ("closing") avec les points clés à retenir.\n`;
    if (titre) prompt += `- Le titre de l'atelier est déjà fixé : "${titre}" — n'en propose pas d'autre.\n`;
    if (notes && notes.trim()) {
      prompt += `\nObservations complémentaires à prendre en compte : ${notes.trim()}\n`;
    }
    prompt += `\nAppelle l'outil build_deck_content avec le contenu structuré.`;
    return prompt;
  }

  function modelFromApiResult(input, options) {
    const sections = Array.isArray(input.sections) ? input.sections : [];
    const contentSlides = [];
    const programme = [];
    for (const section of sections) {
      programme.push({ heading: section.sectionHeading || "", body: section.sectionSummary || "" });
      for (const slide of section.slides || []) {
        contentSlides.push({
          title: slide.title || "",
          intro: slide.intro || "",
          items: (slide.items || []).map((it) => ({ heading: it.heading || "", body: it.body || "" })),
          image: null,
          table: null,
        });
      }
    }
    // Defense in depth: the prompt asks for the right count, but don't trust
    // it blindly — trim to the target duration the same way every other
    // mode does, in case the model overshoots.
    const trimmed = contentSlides.slice(0, options.maxSlides);

    let closing = null;
    if (input.closing && input.closing.title) {
      closing = {
        title: input.closing.title,
        intro: "",
        items: (input.closing.items || []).map((it) => ({ heading: it.heading || "", body: it.body || "" })),
        image: null,
        table: null,
      };
    }

    return {
      title: { main: (options.titre || "").trim() || input.titleMain || "", intro: input.titleIntro || "", tags: [] },
      programme,
      contentSlides: trimmed,
      closing,
    };
  }

  async function callClaudeApi({ theme, notes, maxSlides, titre, apiKey, onStatus }) {
    if (!apiKey) {
      throw new Error(
        "Aucune clé API configurée. Renseignez votre clé API Claude dans le champ prévu pour ce mode."
      );
    }
    const prompt = buildPrompt({ theme, notes, maxSlides, titre });

    // A ~30-slide request can take the API the better part of a minute —
    // confirmed in production: with no feedback during that wait, it was
    // impossible to tell a slow-but-working generation from a hung one.
    if (onStatus) {
      onStatus(
        `Génération du contenu par l'API Claude (${maxSlides} diapositive(s) demandée(s)) — ` +
          "ça peut prendre 30 à 60 secondes pour une séance longue…"
      );
    }

    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: API_MODEL,
          max_tokens: 8192,
          tools: [DECK_TOOL],
          tool_choice: { type: "tool", name: DECK_TOOL.name },
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      throw new Error(
        "Impossible de joindre l'API Claude (réseau bloqué sur ce poste ?) : " + err.message
      );
    }

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body && body.error && body.error.message ? body.error.message : "";
      } catch {
        /* ignore body parse failure, fall back to status text below */
      }
      throw new Error(`Erreur API Claude (${res.status}) : ${detail || res.statusText}`);
    }

    const data = await res.json();
    const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === DECK_TOOL.name);
    if (!toolUse) {
      throw new Error("Réponse de l'API Claude inattendue (pas de contenu structuré reçu).");
    }
    return toolUse.input;
  }

  /* options: { theme, notes, titre, thematique, targetMinutes, apiKey, forceApi } */
  async function buildScratchModel(options) {
    const maxSlides = computeMaxSlides(options.targetMinutes);
    // Match on the theme name alone, not the optional notes: the notes are
    // steering context for what to generate ("insister sur la sécurité",
    // "public débutant"…), not a topic signal — folding them into the
    // matching query risks tripping a generic keyword from an unrelated
    // curated theme (confirmed: "insister sur la sécurité" alone was enough
    // to false-match the "authentification" theme via its "securite"
    // keyword, for a request that had nothing to do with authentification).
    const match = options.forceApi ? null : matchThemeForScratch(options.theme);
    if (match) {
      // A theme can belong to a `group` of related themes (see
      // pix-themes.js) — pull in the whole family, in catalog order, so
      // e.g. matching "Santé en ligne" also brings its "Mon Espace Santé"
      // and "Doctolib" companions rather than just the one theme whose
      // keywords happened to score highest.
      const group = match.theme.group;
      const groupThemes = group ? THEMES.filter((t) => t.group === group) : [match.theme];
      // Same duration budget every other mode respects — a 3-section
      // family can still overshoot a short target, so trim from the end
      // (catalog order: overview first, most-detailed companions last).
      const themes = groupThemes.slice(0, maxSlides);
      return {
        model: modelFromCuratedThemes(themes, options.titre),
        source: "curated",
        reason: "curated",
        themeHeading: themes.map((t) => t.heading).join(" + "),
      };
    }
    const input = await callClaudeApi({
      theme: options.theme,
      notes: options.notes,
      maxSlides,
      titre: options.titre,
      apiKey: options.apiKey,
      onStatus: options.onStatus,
    });
    // Distinguish "asked for the richer API version on purpose" from "the
    // library had nothing for this theme" — the status message reads very
    // differently depending on which one actually happened.
    const reason = options.forceApi && matchThemeForScratch(options.theme) ? "api-forced" : "api-no-match";
    return { model: modelFromApiResult(input, options), source: "api", reason };
  }

  async function resolveAmbianceBytes(ambianceFiles) {
    const out = [];
    for (const file of ambianceFiles || []) {
      const buf = await file.arrayBuffer();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      out.push({ bytes: new Uint8Array(buf), ext });
    }
    return out;
  }

  async function generateScratchDeck(gabaritBuffer, options) {
    options = Object.assign(
      { titre: "", thematique: "", targetMinutes: DEFAULT_TARGET_MINUTES, notes: "", forceApi: false },
      options
    );

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();

    const { model, source, reason, themeHeading } = await buildScratchModel(options);

    // User-supplied images take priority over the illustration library —
    // useful when the generated text's own phrasing (especially from the
    // API) doesn't literally overlap with anything already in the library,
    // which otherwise leaves most slides with no illustration at all.
    // Round-robin, same as pix-build.js/merge-build.js. Slides left
    // without one still fall through to the library via pickImage().
    const ambianceBytes = await resolveAmbianceBytes(options.ambianceFiles);
    if (ambianceBytes.length) {
      model.contentSlides.forEach((slide, i) => {
        if (!slide.image) slide.image = ambianceBytes[i % ambianceBytes.length];
      });
    }

    await assembleDeck(deck, model, options);
    const blob = await deck.finalize();
    return { blob, model, source, reason, themeHeading, slideCount: model.contentSlides.length };
  }

  global.PG_SCRATCH_BUILD = {
    generateScratchDeck,
    getStoredApiKey,
    setStoredApiKey,
    MINUTES_PER_SLIDE,
    DEFAULT_TARGET_MINUTES,
  };
})(window);
