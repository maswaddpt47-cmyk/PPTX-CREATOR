# Instructions pour Claude

- Toujours faire un `git pull` depuis GitHub avant de commencer à travailler, afin de partir de l'état le plus récent du dépôt.
- Toujours merger les changements sur la branche `main` une fois le travail terminé.

## Règles de collaboration avec Claude

### Côté Claude

**Patterns récurrents — priorité haute**
1. Ne jamais présenter une explication technique plausible comme un fait : marquer explicitement "hypothèse non vérifiée" dans le code, les commits et les messages, tant qu'aucune preuve (log, capture, test réel) ne la confirme.
2. Ne jamais déclarer "c'est réparé", "c'est en ligne" ou "testé" sans vérification réelle du chemin critique (déploiement, rendu navigateur, test exécuté) — pas une lecture de code qui "devrait marcher".
3. Sur toute demande d'audit ou de correction d'un bug de calcul/latence, livrer un audit systématique (tous les points d'impact) avant la première correction, pas des trouvailles ponctuelles au fil des questions.
4. Signaler explicitement toute déviation d'une spec fournie ou toute décision de design prise seul, au moment où elle est prise — jamais en note après coup.
5. Poser une question de clarification dès qu'une demande est réellement ambiguë ou sous-spécifiée (contenu non précisé, "adapte" vs "applique", référence visuelle absente) plutôt que de trancher en silence ou produire un placeholder.
6. Sur tout appel Bash touchant un repo précis en contexte multi-repo, utiliser `cd /chemin/complet &&` systématiquement ; vérifier `git status`/`git log` et la cohérence CLAUDE.md vs instructions de session avant d'agir, pas après.
6bis. Toujours faire un `git pull` avant de lire ou modifier le moindre fichier, même si le repo semble à jour — l'oubli est une cause récurrente d'écrasement de travail (SpeedDial). Respecter la politique de push définie dans le CLAUDE.md du projet (push direct sur `main` vs branche de travail imposée) et signaler tout conflit avec les instructions de session avant d'agir, pas après (Mentimeter, Dashboard PIX, FICHES-GENERATOR).
7. Après toute reprise de session ou résumé de contexte, relire l'état réel du fichier concerné avant de le modifier ou de le renvoyer — ne jamais présumer qu'un correctif précédent est encore en place.
7bis. Utiliser des dates explicites (JJ/MM ou JJ/MM/AAAA) plutôt que des termes relatifs ("hier", "aujourd'hui", "la semaine dernière", "demain") dans les réponses — la perception du temps de Claude vient du contexte injecté en début de session, pas d'une horloge en temps réel, et devient peu fiable sur une session qui s'étale sur plusieurs jours ou plusieurs reprises.
8. Avant de pousser un changement visuel (CSS/layout), vérifier mentalement les interactions connues à risque (stacking context, overflow, position sticky/fixed) sur les zones sensibles existantes.

**Bonnes pratiques à maintenir**
9. Continuer à demander l'avis de Claude avant toute action à fort impact (déploiement, architecture, migration de données) et exécuter vite dès validation courte reçue.
10. Continuer à privilégier la preuve concrète (logs, captures, Network DevTools, console) sur la déduction théorique pour tout diagnostic.

### Côté utilisateur

**Patterns récurrents — priorité haute**
1. Donner le contexte temporel et les tentatives déjà faites dès le premier message ("ça marchait hier", "j'ai déjà testé X", "je pensais avoir réglé ça avec Y") plutôt qu'après coup.
2. Pour un bug visuel ou "bizarre", ajouter une ligne de description du symptôme précis (ou une capture annotée) plutôt qu'une formule vague.
3. Signaler explicitement en début de message tout changement d'état fait hors session (redéploiement, config, branche renommée, settings modifiés).
4. Pour les demandes ouvertes ("plus", "mieux", "améliore"), préciser le critère de succès attendu (différent de l'existant / même chose mais plus visible).
5. Donner un retour de validation réelle après test terrain, même court ("testé, ça marche" / "ça casse en fait") — sans ce signal, Claude ne peut recouper ses inférences.

**Bonnes pratiques à maintenir**
6. Continuer à valider court et vite sur le travail bien cadré ("ok", "la totale") — ça marche bien tant que la portée est claire.
7. Continuer à recadrer immédiatement dès qu'une mauvaise direction est repérée — c'est efficace et limite les dégâts.
