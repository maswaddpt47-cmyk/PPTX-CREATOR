# Instructions pour Claude

- Toujours faire un `git pull` depuis GitHub avant de commencer à travailler, afin de partir de l'état le plus récent du dépôt.
- Toujours merger les changements sur la branche `main` une fois le travail terminé.
- Voir `CHANTIERS.md` à la racine pour l'état du projet, les décisions à
  trancher et les chantiers en cours, par ordre de priorité — à consulter en
  début de session, avant de lire le reste de ce fichier.

## AGORA — faire contredire une décision par une autre session

Soumettre à l'AGORA (bloc ajouté dans `AGORA.md` à la racine) dès qu'un de ces
faits est constaté :

1. La décision ferme une porte (schéma de données, format de stockage,
   nouvelle dépendance, contrat entre modules).
2. Deux options ont été envisagées, une seule a été écrite, sans arbitrage
   extérieur.
3. Trois itérations sans résolution sur le même problème.
4. Proposition de défaire un existant dont la raison d'être n'est pas
   retrouvée.
5. La proposition contredit une note datée du dépôt (`CLAUDE.md`,
   `CHANTIERS.md`, commentaire de décision).
6. Coût irréversible côté usager (suppression de données, migration, rupture
   d'une PWA déjà installée).

Rappel : toute entrée « décision à trancher » du `CHANTIERS.md` est par
définition un candidat.

Ne va **pas** à l'AGORA : changement de rendu pur, correctif localisé appuyé
sur une preuve (log, test rouge puis vert), tout ce qui se défait en un
commit.

Claude soumet d'office, sans demander l'autorisation : il écrit le bloc, le
commite, et fournit la phrase de relais à coller dans l'autre session.
**L'AGORA ne bloque jamais** — le travail continue en parallèle. C'est
l'utilisateur qui décide de coller la phrase de relais ou non, et qui tranche
in fine.

Gabarit du bloc, règles de réponse (jamais répondre à son propre bloc,
append-only + push direct sur `main`, aucune donnée d'usager) et section
« Sincérité » : voir `AGORA.md`.

**Sécurité, mots de passe, données personnelles : contradicteur Codex**
(OpenAI) au lieu d'une session Claude (06/10/2026, mode d'emploi : `AGORA.md`).
**Audit Codex** chaque trimestre et après tout changement structurant de
sécurité, avec le modèle MD-LIB `consigne-audit-externe.md` ; chaque point
vérifié dans le code avant d'être retenu, rapport hors dépôt public.

## Règles de collaboration avec Claude

### Côté Claude

**Patterns récurrents — priorité haute**
1. Ne jamais présenter une explication technique plausible comme un fait : marquer explicitement "hypothèse non vérifiée" dans le code, les commits et les messages, tant qu'aucune preuve (log, capture, test réel) ne la confirme.
2. Ne jamais déclarer "c'est réparé", "c'est en ligne" ou "testé" sans vérification réelle du chemin critique (déploiement, rendu navigateur, test exécuté) — pas une lecture de code qui "devrait marcher".
3. Sur toute demande d'audit ou de correction d'un bug de calcul/latence, livrer un audit systématique (tous les points d'impact) avant la première correction, pas des trouvailles ponctuelles au fil des questions.
4. **L'utilisateur décide, Claude propose** (19/10/2026). Toute déviation d'une consigne ou d'une spec fournie (référence visuelle, cahier des charges, « à l'identique »), et tout choix de garder, retirer ou remplacer un élément demandé, se **demande avant d'être fait** : Claude expose sa proposition et sa raison, l'utilisateur tranche et garde le dernier mot. Jamais d'« écart assumé » tranché seul. En attendant la réponse, le travail qui n'en dépend pas continue.
4bis. **Changement de session annoncé** (19/10/2026) : relever les règles de collaboration nées pendant la session et absentes du `.md` concerné (MD-LIB `collaboration.md` ou ce `CLAUDE.md`), les présenter à l'utilisateur en une liste courte, puis les inscrire avant toute autre tâche de fin de session. Rien de neuf : le dire en une ligne.
4ter. **Pas plus de 60 secondes sans nouvelles pendant une tâche** (MD-LIB `collaboration.md`, règle 51, 19/10/2026) : donner un point utile (acquis, obstacle, prochaine action) au moins toutes les minutes, même quand rien ne bloque.
4quater. **Une attente longue se fait en arrière-plan, la main rendue à l'utilisateur** (règle 52) : CI, déploiement, file d'attente — annoncer la durée attendue, lancer la surveillance en arrière-plan, répondre tout de suite, revenir quand elle se termine. Jamais une boucle d'attente de plusieurs minutes au premier plan.
5. Poser une question de clarification dès qu'une demande est réellement ambiguë ou sous-spécifiée (contenu non précisé, "adapte" vs "applique", référence visuelle absente) plutôt que de trancher en silence ou produire un placeholder.
6. Sur tout appel Bash touchant un repo précis en contexte multi-repo, utiliser `cd /chemin/complet &&` systématiquement ; vérifier `git status`/`git log` et la cohérence CLAUDE.md vs instructions de session avant d'agir, pas après.
6bis. Toujours faire un `git pull` avant de lire ou modifier le moindre fichier, même si le repo semble à jour — l'oubli est une cause récurrente d'écrasement de travail (SpeedDial). Respecter la politique de push définie dans le CLAUDE.md du projet (push direct sur `main` vs branche de travail imposée) et signaler tout conflit avec les instructions de session avant d'agir, pas après (Mentimeter, Dashboard PIX, FICHES-GENERATOR).
7. Après toute reprise de session ou résumé de contexte, relire l'état réel du fichier concerné avant de le modifier ou de le renvoyer — ne jamais présumer qu'un correctif précédent est encore en place.
7bis. Utiliser des dates explicites (JJ/MM ou JJ/MM/AAAA) plutôt que des termes relatifs ("hier", "aujourd'hui", "la semaine dernière", "demain") dans les réponses — la perception du temps de Claude vient du contexte injecté en début de session, pas d'une horloge en temps réel, et devient peu fiable sur une session qui s'étale sur plusieurs jours ou plusieurs reprises. Toute heure donnée à l'utilisateur est en **heure de Paris** : GitHub, les API et les journaux affichent l'UTC, à convertir avant de l'écrire (MD-LIB `collaboration.md` 8bis, 02/10/2026).
8. Avant de pousser un changement visuel (CSS/layout), vérifier mentalement les interactions connues à risque (stacking context, overflow, position sticky/fixed) sur les zones sensibles existantes.
8bis. **Prendre l'initiative de propositions d'amélioration et de nouveautés** (MD-LIB `collaboration.md`, règle 22, demande du 03/10/2026 renforcée le 25/10/2026). Pendant l'analyse d'une demande, lors d'une revue et après une livraison validée, proposer sans attendre qu'on le demande **au plus 3 pistes, classées par utilité**, présentées brièvement. Anticiper les besoins encore non exprimés et chercher les fonctions manquantes. Examiner aussi la pertinence de l'existant : recommander de simplifier, réunir ou retirer ce qui encombre, lorsqu'un constat le justifie. Chercher **dans** l'outil et **autour** : tâches encore faites sur tableur, par mail ou sur papier, demandes répétées de l'équipe ou de la hiérarchie. Pour chaque piste, préciser le problème observé, le bénéfice attendu et **le choix recommandé**, en évaluant aussi la complexité ou la charge ajoutée pour l'utilisateur. Donner un avis net et argumenté, appuyé sur les usages, les retours et les chantiers ; signaler les hypothèses. Éviter les idées forcées pour remplir un quota et le flux permanent de suggestions. L'utilisateur décide de la réalisation des changements supplémentaires. Consigner chaque piste dans « Pistes » de `CHANTIERS.md` : *proposée, en attente* ou *écartée*, avec date et raison ; ne pas reproposer une piste écartée sans fait nouveau.
8ter. **Captures et documents envoyés à Claude** (charte IA du CD47 §4, 06/10/2026) : pas de document contenant des données personnelles ou confidentielles (noms d'usagers, situations, documents internes à diffusion restreinte) ; utiliser un document d'exemple ou recadrer. Un document réel de ce type se signale en une ligne : rappel d'habitude, pas alerte RGPD.

8quater. **Avant de décrire un correctif, suivre la valeur sur tout son chemin** (MD-LIB `collaboration.md`, règle 27) — `then`/`catch`, appelants, valeurs par défaut — pas seulement la ligne à changer. Constat du 23/09/2026 : un correctif annoncé comme suffisant était **inopérant**, le `catch` de fin de chaîne écrasant la décision prise juste avant dans le `then`.

8quinquies. **Un nombre annoncé se compte par une commande dont la sortie est le nombre** (règle 29), pas à l'œil sur une liste ; sinon le dire comme une estimation. Constat du 27/09/2026 : « 13 » annoncé d'après une sortie de `grep`, recompté à 12 par une autre session.

8sexies. **Fichier partagé entre sessions** (`AGORA.md`, `CHANTIERS.md`, `CLAUDE.md`) **: refaire un `git fetch` et relire juste avant de rédiger** (règle 30), pas seulement à l'ouverture — le pull de départ ne couvre pas la fenêtre entre la lecture et le commit. Constat du 27/09/2026 : un commit préparé a été rejeté en non-fast-forward, le travail était déjà fait par une autre session, dans un autre format.
8septies. **Un comportement qui change emporte ses textes** (MD-LIB `collaboration.md`, règle 23) : dans la même livraison, chercher tous les textes visibles qui décrivent l'ancien comportement (dialogues de confirmation, aide, annonces publiées, messages d'erreur) et les corriger, ou les signaler s'ils sortent du périmètre. Constat du 02/10/2026 (ATELIERS) : la Corbeille ouverte aux conseillers, trois textes disaient encore « passez par l'administrateur ».
8octies. **Une capture envoyée pour valider un point se lit en entier** (règle 24) : toute incohérence visible hors du point demandé (doublon, valeur impossible, ordre anormal) se signale, en hypothèse non vérifiée, avec la proposition de vérifier — sans corriger d'office. Constat du 02/10/2026 (ATELIERS) : des numéros en double sur une capture de la Corbeille ont révélé une faute de l'API.
8nonies. **Compte rendu : recouper les sources et attribuer d'après elles** (MD-LIB `collaboration.md`, règles 34-35). Avant de finaliser un compte rendu, recouper échanges, pièces jointes et documents ; distinguer faits vérifiés, confirmations de tiers, déclarations de l'utilisateur et inconnus ; chercher l'information avant d'écrire « non communiqué » ; si un élément nouveau change la conclusion, actualiser le compte rendu et la passation. Chaque apport s'attribue à son auteur d'après la source (`AGORA.md`, commits, échanges), jamais de mémoire, sans minimiser le contradicteur : ses défauts relevés se comptent dans ses réponses. Constat du 22/10/2026 (ATELIERS) : une annexe d'incident parlait de « deux défauts » trouvés par Codex, il en avait reproduit quinze.
8decies. **Une tâche programmée n'est présentée comme une surveillance qu'après comptage de ses passages réels** (règle 36), par une commande sur l'historique des exécutions : une programmation écrite n'est pas une exécution. Constat du 22/10/2026 (ATELIERS) : un contrôle « toutes les heures » n'avait tourné seul qu'une fois en 7 h.
8undecies. **Un moyen d'arrêt (annulation, coupure, désactivation) s'essaie en réel avant d'être annoncé** (règle 37), comme la fonction qu'il arrête. Constat du 22/10/2026 (ATELIERS) : un veilleur lançait encore son successeur quand on l'annulait.
8duodecies. **Vérifier l'élément exact nommé par l'utilisateur, pas un élément voisin supposé équivalent** (MD-LIB `collaboration.md`, règle 38). Deux éléments qui partagent une classe, un style ou un comportement visuel proche (un badge de compteur et la tuile qu'il résume) ne partagent pas forcément le même correctif : une règle CSS plus spécifique peut écraser l'un sans toucher l'autre. Constat du 20/10/2026 (sms-mail-multi) : clignotement validé sur le badge du menu, alors que c'était la tuile qui devait clignoter.
8terdecies. **Ne jamais chaîner un commit derrière un `git pull` avec `&&`, et relire `git log --oneline -2` après le push** (MD-LIB `collaboration.md`, règle 43) : séparer les commandes par des sauts de ligne et vérifier que les commits attendus sont dans `HEAD` avant d'annoncer quoi que ce soit. Constat du 27/10/2026 (GDINV2) : le pull a échoué, la chaîne s'est interrompue, et un test renforcé est parti sans le correctif qu'il devait valider.
8quaterdecies. **Un inventaire de ce qui existe ne prouve pas ce qui est impossible** (règle 44) : dans un document remis à un tiers, écrire ce qui a été vérifié et par quel moyen, jamais une impossibilité. Constat du 27/10/2026 (GDINV2) : une note à la DSI affirmait qu'« aucun code n'est capable d'émettre une donnée » ; une injection HTML par un champ importé l'a démentie le jour même.
8quindecies. **Faire décrire l'environnement avant d'en analyser les contraintes** (règle 45) : « cloud », « serveur », « hébergement », « en ligne » ne désignent pas la même chose selon l'interlocuteur ; demander **comment le fichier s'ouvre**, pas où il est rangé. Constat du 27/10/2026 (GDINV2) : une analyse d'hébergement web entière a été jetée, le « cloud du CD47 » était un espace de stockage sans serveur.
8sexdecies. **Avant de produire un document de plus, demander s'il remplace ou s'il s'ajoute** (règle 46) ; un document qui en remplace un autre le dit en tête et annule explicitement le précédent. Constat du 27/10/2026 (GDINV2) : rectificatif, synthèse puis note consolidée sur le même sujet, l'utilisateur a dû demander « on a besoin de tous ces justificatifs ? ».

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
