# CHANTIERS — PPTX-CREATOR

État au 29/09/2026.

## Décisions à trancher

Aucune.

## Chantiers restants, par priorité

Aucun. (Import .docx Word FR confirmé par l'utilisateur le 30/09/2026 sur
"Prompt Entretien IA.docx" ; LibreOffice jamais testé — à rouvrir si un
export LibreOffice est refusé.)

## Points à ne pas défaire

- Import .docx : style de titre reconnu par son *nom* dans
  `word/styles.xml` ("heading 1"), pas par son id — Word FR écrit l'id
  `Titre1` (constaté le 30/09/2026). Ne pas revenir à un test sur l'id.
- Diapo sans cartouche mais avec une intro (`renderContentSlide()`,
  `build.js`) : l'intro devient l'unique cartouche. L'alerte « contenu de
  cette diapositive » est réservée aux diapos réellement vides.

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
