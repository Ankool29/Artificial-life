# Validation du prototype

Vérifications locales de l’étape 3 réalisées le 3 novembre 2026, Node.js 24.19.0.

| Vérification | Résultat |
| --- | --- |
| `npm test` | 65 tests réussis : 43 conservés et 22 sur diversité, hérédité, profils, expériences et compatibilité |
| `npm run build` | TypeScript strict et bundle Vite réussis |
| `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | 20 scénarios réussis : 10 sur Pixel 7 émulé, 10 sur ordinateur |
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
- Les génomes sont reproductibles indépendamment du terrain ; tous les loci varient dans leurs bornes. Les descendants héritent de paramètres avec mutations limitées, sans souvenirs ni état interne.
- Des génomes issus de graines réelles, soumis aux mêmes expériences, peuvent apprendre des bilans opposés pour le même aliment ou objet. Les tests contrôlent aussi un paramètre physiologique à la fois et distinguent les effets de l’histoire individuelle.
- Les profils inactifs ne reçoivent aucun tick. Les essais neufs d’un même terrain partagent contenu physique, RNG et état initial, sans modifier leurs originaux.
- Une sauvegarde v2 en cours d’interaction continue à l’identique pendant 300 ticks par comparaison avec un état de référence produit par le moteur de l’étape 2.
- Les archives complètes du laboratoire, ascendance et terrains compris, sont validées et restaurées. Les tests navigateur vérifient création, changement de profil, avance exacte, essais comparatifs et export/import complet.

## Budget observé et limites

Le bundle de production de l’étape 3 est d’environ **19 Ko de JavaScript gzip** et **5,4 Ko de CSS gzip**, hors polices facultatives. Aucun framework UI ou moteur physique n’est chargé. Le moteur et le rendu conservent leurs fréquences ; la perception parcourt au plus 48 aliments et 12 objets. Jusqu’à huit profils sont stockés, mais un seul monde reçoit des ticks.

L’émulation Pixel 7 vérifie la mise en page et les interactions dans Chromium. Elle ne remplace pas une mesure de consommation, de batterie, de cadence d’images ou de comportement des téléchargements sur un appareil Android physique. Ces mesures restent à faire. Les rendus de référence sont dans `docs/previews/`.

Le workflow GitHub Actions est fourni. Son résultat distant doit être consulté sur la pull request ; les résultats ci-dessus sont ceux des commandes locales.
