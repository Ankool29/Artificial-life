# Validation du prototype

Vérifications locales réalisées le 2 novembre 2026, Node.js 24.19.0.

| Vérification | Résultat |
| --- | --- |
| `npm test` | 43 tests réussis : 24 existants et 19 pour les interactions, motivations et migrations |
| `npm run build` | TypeScript strict et bundle Vite réussis |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | 14 scénarios réussis : 7 sur Pixel 7 émulé, 7 sur ordinateur |
| Inspection des captures | Jardin, aliments et créature visibles ; pas de débordement horizontal ; palette proche du jardin en portrait |
| `git diff --check` | Réussi |

## Ce qui est établi

- Même graine et commandes : même état après 6 000 ticks.
- Une sauvegarde en pleine digestion produit exactement la même suite que le monde resté en mémoire après 7 000 ticks supplémentaires.
- Le repas remplit un estomac, disparaît du monde et n’entraîne une association qu’à la fin de sa digestion.
- En inversant la chimie de deux signaux, la préférence s’inverse. Un signal précédemment bénéfique devient évité après plusieurs effets négatifs.
- Le choix appris peut favoriser un aliment bénéfique plus éloigné face à un aliment nuisible proche.
- L’exploration alimentaire reste possible même après une association négative ; une faim urgente conserve la priorité sur les objets.
- Des effets opposés attribués aux mêmes apparences produisent des préférences et des choix d’objets opposés ; un changement de conséquences peut inverser une association.
- À mémoire identique, des besoins différents peuvent faire préférer la stimulation ou l’apaisement.
- Une véritable sauvegarde v1 garde métabolisme, bolus, mémoire alimentaire, action, horloge et RNG lors de la migration v2. Une interaction v2 en cours reprend ensuite exactement après chargement.
- Le retrait d’un objet en interaction ne crédite que les effets déjà vécus.
- Trois graines parcourent chacune 20 000 ticks, avec ajout périodique de nourriture, en conservant des états importables et bornés.
- Les tests navigateur manipulent les contrôles réels : dépôt, ajout d’un trio, pause, accélération, panneau biologique, aide, export, import valide et invalide, chargement et restauration après rechargement de la page.
- Les scénarios navigateur de l’étape 2 couvrent le placement/retrait d’objets, l’alternance avec les aliments, une interaction autonome avec souvenir persistant et l’import de la sauvegarde v1.

## Budget observé et limites

Le bundle de production de l’étape 2 est d’environ **14 Ko de JavaScript gzip** et **5 Ko de CSS gzip**, hors polices facultatives. Aucun framework UI ou moteur physique n’est chargé. Le moteur et le rendu conservent leurs fréquences ; la perception parcourt au plus 48 aliments et 12 objets.

L’émulation Pixel 7 vérifie la mise en page et les interactions dans Chromium. Elle ne remplace pas une mesure de consommation, de batterie, de cadence d’images ou de comportement des téléchargements sur un appareil Android physique. Ces mesures restent à faire. Les rendus de référence sont dans `docs/previews/`.

Le workflow GitHub Actions est fourni. Son résultat distant doit être consulté sur la pull request ; les résultats ci-dessus sont ceux des commandes locales.
