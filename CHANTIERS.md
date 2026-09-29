# CHANTIERS — PPTX-CREATOR

État au 29/09/2026.

## Décisions à trancher

Aucune.

## Chantiers restants, par priorité

1. **Vérification terrain de l'import .docx** (mode "Adapter un PPTX
   existant", `docs/js/doc-extract.js`). Testé le 28/09/2026 dans un bac à
   sable Node (JSZip + `@xmldom/xmldom`, pas le navigateur) contre un `.docx`
   construit à la main (XML minimal), pas un export réel Word/LibreOffice :
   cas nominal (Titre/Sous-titre/Titre 1/Titre 2/Titre 3/listes à puces,
   détection du récapitulatif) et cas d'erreur (aucun style de titre)
   passent tous les deux. **Hypothèse non vérifiée** : la détection de style
   (`normalizeStyleId` dans `doc-extract.js`) suppose que Word et LibreOffice
   écrivent l'id de style anglais (`Heading1`, `Title`...) même en interface
   française — pas confirmé sur un vrai fichier exporté par l'un ou l'autre.
   À tester avec un vrai `.docx` déposé dans l'outil en ligne avant de
   considérer le chantier clos.

## Points à ne pas défaire

- `sectionIndex` sur les slides du mode "Depuis un thème"
  (`scratch-build.js`) : la section est connue à la génération, ne pas la
  laisser redeviner par `classifyContentSlides()` (heuristique réservée
  aux sources importées, où la section n'est pas connue). Vérifié le
  29/09/2026 sur un deck régénéré depuis l'outil en ligne ("Créer une
  adresse mail…") : chaque slide dans sa partie, notions avant étapes
  numérotées, conseils en fin de partie (consigne du prompt respectée sur
  cette génération — une seule, pas une garantie).

- Le mode "Adapter un PPTX existant" (`docs/index.html` id `mode-pptx`,
  dropzone `#file-input`, accepte `.pptx` et `.docx`) route selon
  l'extension : `.pptx` → `docs/js/source-extract.js` (lecture par position
  des formes/`xfrm` dans le XML des slides), `.docx` →
  `docs/js/doc-extract.js` (lecture par styles de paragraphe Word). Les deux
  produisent la même forme de modèle (`title`/`programme`/`contentSlides`/
  `closing`, voir l'en-tête de `build.js:227`) consommée par
  `assembleDeck()` — `generateDeckFromModel()` dans `build.js` est le point
  d'entrée partagé, ne pas dupliquer la logique de rendu si un troisième
  format source doit être ajouté un jour.
- `.doc` (Word 97-2003, format binaire OLE2, pas du XML) est **refusé**
  côté dropzone (`app.js`) avec un message renvoyant vers un
  réenregistrement en `.docx` — décision prise le 28/09/2026 : pas de
  bibliothèque JS fiable pour le lire côté navigateur, et un parseur maison
  (format OLE2/FIB) n'aurait pas pu être vérifié dans cet environnement. Ne
  pas réintroduire de tentative de lecture `.doc` sans un vrai fichier de
  test et un moyen de vérifier le résultat.
- L'import `.docx` ne lit que le texte et la structure (styles de titre) :
  les images éventuellement présentes dans le `.docx` source ne sont pas
  extraites — chaque diapositive de contenu retombe sur la bibliothèque
  d'illustrations comme n'importe quelle diapositive `.pptx` sans image
  propre (`pickImage()` dans `build.js`).
