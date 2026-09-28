# CHANTIERS — PPTX-CREATOR

État au 28/09/2026 — commit de référence `ab583e3`.

## Décisions à trancher

- **Import d'un fichier .doc/.docx dans le mode "Adapter un PPTX existant".**
  Deux options proposées à l'utilisateur le 28/09/2026, sans réponse retenue :
  étendre le dropzone existant (`docs/index.html#mode-pptx`) en détectant le
  type de fichier déposé, ou ajouter un nouvel onglet dédié avec un parseur
  Word séparé. Périmètre du format à trancher aussi : `.docx` seul (même
  famille technique zip+XML que le `.pptx`, réutilise JSZip déjà présent) ou
  `.doc` + `.docx` (le `.doc` binaire demande une librairie de parsing
  supplémentaire). Rien à soumettre à l'AGORA tant que le choix n'est pas fait
  — la décision n'est pas encore prise, donc aucun critère du §2 d'`agora.md`
  n'est rempli.

## Chantiers restants, par priorité

1. Trancher l'approche d'import .doc/.docx (ci-dessus), puis l'implémenter :
   `docs/js/source-extract.js` lit actuellement la structure OOXML des slides
   (formes/`xfrm`) — un `.doc`/`.docx` nécessite un parseur de
   paragraphes/titres distinct, pas une extension du parseur existant.

## Points à ne pas défaire

- Le mode "Adapter un PPTX existant" (`docs/index.html` id `mode-pptx`,
  dropzone `#file-input` limité à `.pptx`) s'appuie sur
  `docs/js/source-extract.js`, qui extrait le contenu par position des formes
  (`xfrm`) dans le XML des slides — pas de parsing texte brut. Toute
  extension à un autre format source (Word, etc.) doit passer par un
  parseur séparé ; adapter ce fichier pour lire du texte brut casserait
  l'extraction PPTX existante (positionnement, tableaux détectés par
  position).
