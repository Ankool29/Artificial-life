# Publier Luma avec GitHub Pages

## Activer Pages dans le dépôt

1. Avec un compte administrateur, ouvrir [Settings → Pages](https://github.com/Ankool29/Artificial-life/settings/pages).
2. Dans **Build and deployment**, sélectionner **GitHub Actions** comme **Source**. Ne pas choisir « Deploy from a branch ».
3. Vérifier que GitHub Actions est autorisé dans **Settings → Actions → General**. Si une liste d’actions autorisées est utilisée, elle doit inclure `actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, `actions/configure-pages` et `actions/deploy-pages`.
4. Si l’environnement `github-pages` possède des règles de déploiement, autoriser `main`. Des approbations manuelles configurées sur cet environnement suspendront la publication jusqu’à leur validation.
5. Relire puis fusionner la PR de configuration lorsque vous souhaitez activer ce comportement. La PR n’est pas fusionnée automatiquement.

Le premier push sur `main` contenant ce workflow lance la publication. Si Pages a été activé après ce push, ouvrir **Actions → Deploy Luma to GitHub Pages → Run workflow**, sélectionner **main**, puis lancer le workflow. Le lancement manuel depuis une autre branche est ignoré.

Une fois le job `deploy` réussi, GitHub affiche l’URL dans l’environnement `github-pages` et dans Settings → Pages. L’adresse attendue pour ce dépôt est :

**https://ankool29.github.io/Artificial-life/**

Cette adresse n’est utilisable qu’après activation de Pages et réussite d’un déploiement. Cette PR ne publie pas elle-même le prototype.

## Fonctionnement du workflow

Le fichier `.github/workflows/pages.yml` est distinct de `.github/workflows/ci.yml`, qui reste inchangé et continue d’exécuter les tests moteur, TypeScript, Vite et les tests navigateur.

- Déclencheurs : chaque push sur `main`, y compris une fusion de PR, et lancement manuel depuis `main`.
- Le job `build` utilise Node.js 24, installe exactement le lockfile avec `npm ci`, compile avec `npm run build`, puis charge **uniquement `dist/`** avec `actions/upload-pages-artifact`.
- Le job `deploy` attend le build, vérifie la configuration Pages et publie avec `actions/deploy-pages` dans l’environnement `github-pages`.
- Le build dispose uniquement de `contents: read`. Les droits `pages: write` et `id-token: write` sont limités au job de publication. Le jeton temporaire GitHub Actions et OIDC suffisent ; aucun secret personnel n’est à créer.
- Le groupe de concurrence `github-pages` laisse finir une publication active. Si plusieurs exécutions attendent, GitHub conserve la plus récente en attente.
- Les pull requests exécutent la CI habituelle et ne déclenchent aucune publication. Le déploiement compile séparément ; il n’attend pas le résultat du workflow CI. Utiliser une règle de protection de `main` exigeant la réussite de `Prototype checks / verify` si la fusion doit être bloquée tant que les tests ne passent pas.

## Chemins Vite

`vite.config.ts` définit `base: "/Artificial-life/"` pour `vite build` et `vite preview`. L’HTML produit référence donc ses scripts et styles sous `/Artificial-life/assets/`, en respectant la casse du nom du dépôt. Le serveur de prévisualisation sert ces mêmes chemins.

Le serveur de développement conserve sa base locale `./` : `npm run dev` et les tests navigateur existants continuent d’utiliser la racine `/`.

Pour vérifier le site compilé :

```sh
npm ci
npm test
npm run build
npm run preview
```

Ouvrir **http://localhost:4173/Artificial-life/**, puis vérifier le jardin, les boutons et l’absence d’erreurs 404 sur les fichiers JavaScript/CSS. `dist/` est un produit de build ignoré par Git ; le workflow le reconstruit à chaque exécution.

Pour un autre sous-chemin d’hébergement, remplacer la base de production ou utiliser `npm run build -- --base=/autre-chemin/`.

## Diagnostic

- **Pages non configuré / site introuvable dans le job `deploy`** : sélectionner Source **GitHub Actions** dans Settings → Pages, puis relancer le workflow sur `main`.
- **Publication en attente** : vérifier les règles d’approbation ou de branche de l’environnement `github-pages`.
- **Erreur d’autorisation** : vérifier les restrictions d’Actions du dépôt ou de l’organisation et les permissions du job `deploy`. Ne pas remplacer le jeton temporaire par un jeton personnel.
- **Page sans styles ou erreur 404 d’asset** : utiliser l’URL avec `/Artificial-life/`, y compris la barre finale, et vérifier que le build publié provient de la configuration Vite de cette branche.
- **Workflow absent de l’onglet Actions** : il apparaîtra dans la liste des workflows manuels après son arrivée sur la branche par défaut `main`.

Les mécanismes de simulation, les sauvegardes et les tests ne sont pas modifiés par cette configuration. Les sauvegardes locales dépendent de l’origine du navigateur : celles de `localhost` ne sont pas partagées automatiquement avec `ankool29.github.io`. Utiliser l’export/import JSON pour les transférer.
