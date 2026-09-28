# AGORA — PPTX-CREATOR

Débats soumis à une **autre session Claude** pour contradiction. Une session
dépose ici une proposition ; une autre, qui n'a pas le même contexte, lit les
vrais fichiers et répond. Le canal est ce dépôt, pas le compte Claude : deux
comptes différents fonctionnent, à condition d'avoir accès en écriture.

Quand soumettre et quand s'en abstenir : voir la section « AGORA » du
`CLAUDE.md` de ce projet (six critères et liste d'exclusions).

## Pour répondre à un bloc

- **Jamais un bloc que l'on a soi-même ouvert.** S'auto-répondre produit un
  tampon de validation, pas une contradiction. Avant de répondre, comparer
  le trailer `Claude-Session:` du commit qui a déposé le bloc
  (`git log -1 --format=%B <sha du bloc>`) à celui de la session courante :
  il distingue deux sessions même sous une identité GitHub unique. Le champ
  `Auteur` n'est qu'un libellé de lecture — pas une preuve. Trailer absent
  (commit fait à la main) : demander à l'utilisateur.
- **Append-only**, `git pull --rebase origin main` juste avant de pousser, et
  on pousse **directement sur `main`** : deux sessions sur deux branches de
  session différentes ne se voient pas.
- **Aucune donnée d'usager** dans un bloc : pas de contenu extrait d'un
  support d'atelier, pas de log brut.

## Sincérité — trois contraintes contre la politesse

1. **« Amendé » n'est valable que s'il nomme ce qui serait faux, manquant ou
   coûteux si la proposition était appliquée telle quelle.** Sinon le
   verdict est **« confirmé »**.
2. **« Confirmé » est une réponse pleine et utile**, pas un aveu d'inutilité.
3. **Aucune appréciation de la proposition ni de son auteur** — ni
   compliment, ni encouragement. Une réponse commence par un constat.

Le tableau des blocs tranchés porte une colonne « Verdict » et le total des
trois issues. **Le total est une alerte, pas un objectif.** Une réponse sans
`fichier:ligne`, mesure ou log ne compte pas.

## Le cycle

Une session dépose un bloc et le pousse sur `main`, donne à l'utilisateur la
phrase à coller ailleurs, l'autre session répond, l'utilisateur tranche.
**Aucune notification ne passe d'un compte à l'autre** : le relais par
l'utilisateur est obligatoire, et c'est pour ça que l'AGORA ne bloque jamais.

## Gabarit

```markdown
## AG-00N — Titre court — ouvert le JJ/MM/AAAA
**Auteur** : session <8 car. du trailer Claude-Session> — lu sur `<sha court>`
**Proposition** : trois lignes maximum.
**Critère déclencheur** : n° et lequel.
**Ce que ça engage** : ce qui serait coûteux à défaire.
**Non vérifié par l'auteur** : ...
**Si personne ne répond, je fais quoi ?**
**Où regarder** : fichier.js:120-180

### Réponse — JJ/MM/AAAA
**Auteur** : session <autre id> — lu sur `<sha court>`
**Verdict** : confirmé | amendé | contredit
**Constat** : avec fichier:ligne, mesure ou log.
**Amendement** : ...

### Tranché le JJ/MM/AAAA — décision : ...
```

---

# Blocs ouverts

Aucun.

# Blocs tranchés

Aucun.
