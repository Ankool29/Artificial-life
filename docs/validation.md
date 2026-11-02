# Validation du prototype

Vérifications locales réalisées le 2 novembre 2026, Node.js 24.19.0.

| Vérification | Résultat |
| --- | --- |
| `npm test` | 24 tests réussis |
| `npm run build` | TypeScript strict et bundle Vite réussis |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | 8 scénarios réussis : 4 sur Pixel 7 émulé, 4 sur ordinateur |
| Inspection des captures | Jardin, aliments et créature visibles ; pas de débordement horizontal ; palette proche du jardin en portrait |
| `git diff --check` | Réussi |

## Ce qui est établi

- Même graine et commandes : même état après 6 000 ticks.
- Une sauvegarde en pleine digestion produit exactement la même suite que le monde resté en mémoire après 7 000 ticks supplémentaires.
- Le repas remplit un estomac, disparaît du monde et n’entraîne une association qu’à la fin de sa digestion.
- En inversant la chimie de deux signaux, la préférence s’inverse. Un signal précédemment bénéfique devient évité après plusieurs effets négatifs.
- Le choix appris peut favoriser un aliment bénéfique plus éloigné face à un aliment nuisible proche.
- Trois graines parcourent chacune 20 000 ticks, avec ajout périodique de nourriture, en conservant des états importables et bornés.
- Les tests navigateur manipulent les contrôles réels : dépôt, ajout d’un trio, pause, accélération, panneau biologique, aide, export, import valide et invalide, chargement et restauration après rechargement de la page.

## Budget observé et limites

Le bundle de production est d’environ **10,54 Ko de JavaScript gzip** et **4,34 Ko de CSS gzip**, hors polices facultatives. Aucun framework UI ou moteur physique n’est chargé.

L’émulation Pixel 7 vérifie la mise en page et les interactions dans Chromium. Elle ne remplace pas une mesure de consommation, de batterie, de cadence d’images ou de comportement des téléchargements sur un appareil Android physique. Ces mesures restent à faire. Les rendus de référence sont dans `docs/previews/`.

Le workflow GitHub Actions est fourni. Son résultat distant doit être consulté sur la pull request ; les résultats ci-dessus sont ceux des commandes locales.
