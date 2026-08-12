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

  /* Single curated theme -> the same model shape a real source deck would
     produce, so it can go straight into assembleDeck(). Kept deliberately
     small (one section, one slide) since the catalog only ever offers one
     match per free-text theme in practice. */
  function modelFromCuratedTheme(theme, titre) {
    return {
      title: { main: (titre || "").trim() || theme.title, intro: "", tags: [] },
      programme: [{ heading: theme.heading, body: theme.programmeBody }],
      contentSlides: [
        {
          title: theme.title,
          intro: theme.intro,
          items: theme.items.map(([heading, body]) => ({ heading, body })),
          image: null,
          table: null,
        },
      ],
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

  async function callClaudeApi({ theme, notes, maxSlides, titre, apiKey }) {
    if (!apiKey) {
      throw new Error(
        "Aucune clé API configurée. Renseignez votre clé API Claude dans le champ prévu pour ce mode."
      );
    }
    const prompt = buildPrompt({ theme, notes, maxSlides, titre });

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

  /* options: { theme, notes, titre, thematique, targetMinutes, apiKey } */
  async function buildScratchModel(options) {
    const maxSlides = computeMaxSlides(options.targetMinutes);
    // Match on the theme name alone, not the optional notes: the notes are
    // steering context for what to generate ("insister sur la sécurité",
    // "public débutant"…), not a topic signal — folding them into the
    // matching query risks tripping a generic keyword from an unrelated
    // curated theme (confirmed: "insister sur la sécurité" alone was enough
    // to false-match the "authentification" theme via its "securite"
    // keyword, for a request that had nothing to do with authentification).
    const match = matchTheme(options.theme);
    if (match) {
      return { model: modelFromCuratedTheme(match.theme, options.titre), source: "curated", themeHeading: match.theme.heading };
    }
    const input = await callClaudeApi({
      theme: options.theme,
      notes: options.notes,
      maxSlides,
      titre: options.titre,
      apiKey: options.apiKey,
    });
    return { model: modelFromApiResult(input, options), source: "api" };
  }

  async function generateScratchDeck(gabaritBuffer, options) {
    options = Object.assign({ titre: "", thematique: "", targetMinutes: DEFAULT_TARGET_MINUTES, notes: "" }, options);

    const gabaritPkg = await PptxPackage.fromArrayBuffer(gabaritBuffer);
    const deck = new DeckBuilder(gabaritPkg);
    await deck.init();

    const { model, source, themeHeading } = await buildScratchModel(options);
    await assembleDeck(deck, model, options);
    const blob = await deck.finalize();
    return { blob, model, source, themeHeading, slideCount: model.contentSlides.length };
  }

  global.PG_SCRATCH_BUILD = {
    generateScratchDeck,
    getStoredApiKey,
    setStoredApiKey,
    MINUTES_PER_SLIDE,
    DEFAULT_TARGET_MINUTES,
  };
})(window);
