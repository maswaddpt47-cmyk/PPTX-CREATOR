/* Curated library of pedagogical themes used to turn PIX assessment
   screenshots into training content. Each screenshot's OCR text is scored
   against every theme's keywords (see pix-extract.js); the best-scoring
   theme above the confidence floor is used, and only ONE slide is produced
   per theme even if several screenshots point to it — this is what avoids
   duplicate/near-duplicate slides for re-answered or lightly-reworded PIX
   questions (see build notes: FranceConnect/CAF and Calais/Alès mairie
   screenshots are literally the same underlying question template). */
(function (global) {
  "use strict";

  const THEMES = [
    {
      id: "franceconnect",
      heading: "FranceConnect",
      programmeBody: "Une seule connexion pour tous les services publics.",
      title: "FranceConnect : une seule connexion pour tous les services publics",
      intro:
        "De plus en plus de sites de services publics (Ameli, impots.gouv.fr, La Poste, CAF...) proposent de se connecter avec FranceConnect plutôt qu'avec un identifiant propre à chaque site.",
      items: [
        [
          "Qu'est-ce que c'est ?",
          "FranceConnect permet de se connecter à un service public en réutilisant le compte d'un autre service public que vous avez déjà. Plus besoin de créer et retenir un nouveau mot de passe.",
        ],
        [
          "Comment le repérer ?",
          "Sur la page de connexion, cherchez le bouton «S'identifier avec FranceConnect», en général affiché à côté du formulaire de connexion classique.",
        ],
        [
          "Quand l'utiliser ?",
          "Si vous avez déjà un compte actif sur un autre service public reconnu par FranceConnect, c'est souvent plus simple que de récupérer un ancien mot de passe.",
        ],
      ],
      keywords: ["franceconnect", "identifier"],
    },
    {
      id: "authentification",
      heading: "Authentification et identifiants",
      programmeBody: "Le principe identifiant + mot de passe, et ce qui est vraiment nécessaire.",
      title: "Se connecter en toute sécurité : identifiant et mot de passe",
      intro:
        "Se connecter à un compte en ligne (réseau social, service public...) demande de prouver que l'on est bien le titulaire du compte : c'est l'authentification.",
      items: [
        [
          "Qu'est-ce que l'authentification ?",
          "Taper son identifiant et son mot de passe permet au service de vérifier que c'est bien vous qui vous connectez, et pas une autre personne.",
        ],
        [
          "Quelles informations sont nécessaires ?",
          "Seuls l'identifiant et le mot de passe sont indispensables pour se connecter. D'autres informations demandées ailleurs sur le site ne servent pas à la connexion elle-même.",
        ],
        [
          "Un identifiant, plusieurs formes possibles",
          "Selon le site, l'identifiant peut être un email, un numéro de sécurité sociale ou un nom d'utilisateur choisi à l'inscription.",
        ],
      ],
      keywords: [
        "authentification",
        "identifiant",
        "identifiants",
        "verification",
        "boite",
        "numero",
        "securite",
        "sociale",
        "adresse",
        "postale",
        "necessaires",
      ],
    },
    {
      id: "motdepasseoublie",
      heading: "Mot de passe oublié",
      programmeBody: "La procédure de récupération, étape par étape.",
      title: "Mot de passe oublié : comment le récupérer",
      intro:
        "Presque tous les sites proposent un lien dédié pour retrouver l'accès à un compte quand on a oublié son mot de passe.",
      items: [
        [
          "Où trouver le lien ?",
          "Sur la page de connexion, cherchez «Mot de passe oublié ?», généralement sous ou à côté du champ mot de passe.",
        ],
        [
          "Que se passe-t-il ensuite ?",
          "Le site envoie un lien de réinitialisation par email, parfois par SMS, à l'adresse associée au compte.",
        ],
        [
          "Bon réflexe",
          "Ne jamais deviner un mot de passe ni recréer un compte : toujours utiliser le lien de récupération dédié.",
        ],
      ],
      keywords: ["oublie", "oubliee", "recuperer", "reinitialisation"],
    },
    {
      id: "santeenligne",
      heading: "Santé en ligne",
      programmeBody: "Ameli, Mon Espace Santé, Doctolib : qui fait quoi.",
      title: "Suivre ses remboursements de santé en ligne",
      intro:
        "Plusieurs plateformes officielles gèrent la santé en ligne, mais elles n'ont pas toutes le même rôle.",
      items: [
        [
          "Ameli.fr",
          "Le site de l'Assurance Maladie permet de suivre ses remboursements, télécharger une attestation, changer de médecin traitant.",
        ],
        [
          "Mon Espace Santé",
          "Regroupe le dossier médical (documents, analyses, ordonnances) mais ne sert pas à consulter les remboursements.",
        ],
        [
          "Doctolib",
          "Sert à prendre rendez-vous avec des professionnels de santé ; ne gère ni remboursements ni dossier médical.",
        ],
      ],
      keywords: ["rembourse", "remboursement", "doctolib", "espace", "sante", "medecin", "traitant", "assurance", "maladie"],
    },
    {
      id: "formulaireadministratif",
      heading: "Formulaire administratif",
      programmeBody: "Bien remplir un formulaire d'inscription en ligne.",
      title: "Remplir un formulaire administratif en ligne",
      intro:
        "De nombreuses démarches (inscription à une activité, demande d'aide...) passent par un formulaire à compléter en ligne.",
      items: [
        ["Lire avant de remplir", "Repérez les champs obligatoires avant de commencer à écrire."],
        [
          "Informations demandées",
          "En général : identité complète, situation familiale, et informations propres à la démarche.",
        ],
        [
          "Avant d'envoyer",
          "Relisez tout avant de cliquer sur «Envoyer» : une fois validé, corriger une erreur est parfois compliqué.",
        ],
      ],
      keywords: [
        "formulaire",
        "inscription",
        "situation",
        "familiale",
        "celibataire",
        "marie",
        "divorce",
        "pacse",
        "enfants",
        "procedure",
      ],
    },
    {
      id: "siteinstitutionnel",
      heading: "Site institutionnel",
      programmeBody: "Trouver la bonne rubrique sur un site de mairie.",
      title: "Trouver la bonne rubrique sur un site institutionnel",
      intro:
        "Les sites de mairies proposent de nombreux menus ; savoir repérer la bonne rubrique fait gagner du temps.",
      items: [
        [
          "Chercher le bon mot-clé",
          "Pour une démarche, cherchez «Démarches administratives» ou «Services en ligne», souvent dans un menu de raccourcis.",
        ],
        [
          "Ne pas se laisser distraire",
          "Actualités, vidéos, bannières n'ont rien à voir avec la démarche recherchée : il faut les ignorer.",
        ],
        [
          "En cas de doute",
          "La barre de recherche (icône loupe) permet de taper directement le nom de la démarche.",
        ],
      ],
      keywords: ["demarches", "administratives", "mairie", "rubrique", "acte", "naissance", "actualites"],
    },
  ];

  global.PG_PIX_THEMES = { THEMES };
})(window);
