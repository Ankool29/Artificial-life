# Étape 3 · Laboratoire de diversité individuelle

## Audit avant modification

Les modules `genome`, `types`, `metabolism`, `curiosity`, `decisions`, `world` et `persistence` ont été relus avant modification. Les **43 tests** du moteur de l’étape 2 ont été exécutés avec succès. Une sauvegarde v2 en pleine interaction et son état attendu après 300 ticks ont été produits avec ce moteur de référence, conservé depuis `origin/main`, pour vérifier la continuation exacte après les changements.

Le génome précédent avait six loci. Vitesse, perception, assimilation, détoxification et plasticité variaient déjà et étaient réellement utilisés. L’exploration était utilisée par les décisions alimentaires, mais sa valeur était toujours 0,12. La dépense métabolique, la vitesse de digestion, la sensibilité aux toxines et les réponses aux objets étaient identiques entre individus.

La détoxification avait un effet précis et limité : elle faisait baisser les toxines accumulées et pouvait permettre la régénération, sans réduire le dommage appliqué à l’absorption. La nouvelle sensibilité aux toxines agit sur ce dommage. Les deux mécanismes restent distincts.

## Treize paramètres exprimés

Les intervalles suivants concernent les nouveaux génomes v2. Ce sont des paramètres d’un modèle simplifié, en unités arbitraires, sans catégorie alimentaire ou objet préféré dans le génome.

| Locus | Intervalle de génération | Effet dans le moteur |
| --- | --- | --- |
| `speed` | 28–46 | Distance parcourue par tick ; coût de locomotion proportionnel à `speed/38` pour les nouveaux génomes |
| `vision` | 170–245 | Rayon de perception des aliments et objets |
| `efficiency` | 0,7–1 | Fraction énergétique des nutriments effectivement assimilée |
| `detox` | 0,5–1,2 | Élimination des toxines par seconde, avec effet indirect sur la régénération |
| `learningRate` | 0,22–0,5 | Plasticité des mémoires alimentaires et des effets des objets |
| `exploration` | 0,06–0,22 | Probabilité d’une exploration alimentaire, auparavant constante |
| `metabolicRate` | 0,75–1,25 | Multiplicateur des dépenses énergétiques basales et de déplacement |
| `digestionRate` | 0,7–1,3 | Multiplicateur du débit digestif partagé entre les bolus |
| `toxinSensitivity` | 0,12–1,8 | Multiplicateur du dommage sanitaire causé par les toxines absorbées |
| `stimulusGain` | 0,65–1,45 | Gain appliqué à la stimulation produite par tous les objets |
| `stressSensitivity` | 0,3–1,6 | Gain appliqué aux variations de stress produites par tous les objets |
| `recoveryRate` | 0,7–1,3 | Récupération de fatigue et de stress au repos |
| `stimulationDecay` | 0,7–1,3 | Vitesse de perte spontanée de stimulation |

L’augmentation de vitesse a donc un coût énergétique ; l’assimilation ne dépasse pas 100 %. Un gain sensoriel ou une réactivité au stress ne modifie pas directement une préférence : il change les effets vécus, qui passent ensuite par l’apprentissage existant. Les mémoires commencent toujours à zéro. Aucun nom de profil, de baie ou d’objet ne sélectionne un tempérament.

## Graines et transmission

`generateGenome(graine)` utilise son propre générateur, initialisé avec le préfixe de version `genome-v2:`. Les graines génétiques et environnementales sont indépendantes. Deux génotypes sur la même graine de terrain ont les mêmes aliments initiaux et le même état du hasard environnemental ; changer le terrain ne change pas leur génome.

Le laboratoire peut aussi dériver un individu d’un parent choisi. `inheritGenome` copie ses paramètres puis applique, sur chaque locus, une probabilité de mutation de 15 %. Une mutation vaut au plus ±5 % de l’amplitude du locus, avec bornage à l’intervalle biologique. La graine de transmission utilise le préfixe `inherit-v2:`. Certains descendants peuvent donc être des clones génétiques. Un ancien génome peut servir de parent : ses nouveaux coefficients sont initialisés à 1 avant transmission et bornage.

Cette transmission est **asexuée et contrôlée dans le laboratoire** : elle n’introduit ni accouplement, ni cohabitation, ni naissance autonome. Le profil enfant conserve une copie du génome parental utilisé, même si le jardin du parent est remplacé plus tard. Corps, besoins, associations et souvenirs ne sont pas transmis ; seul le génotype l’est.

## Profils indépendants

`src/lab/laboratory.ts` gère au maximum huit profils, essais compris. Chaque profil conserve son monde complet : génome, corps, besoins, apprentissages, digestion, action en cours, terrain, objets et leur récupération, horloge et RNG. Un seul `activeId` désigne le monde que la boucle principale peut faire avancer.

Les autres profils ne vieillissent pas en arrière-plan. Le changement d’individu ne réinitialise ni le profil quitté ni celui repris. Le laboratoire affiche leurs caractéristiques et associations à partir de leurs états conservés ; il ne fait pas tourner plusieurs simulations pour remplir le tableau. Les noms sont de simples étiquettes.

## Expériences comparatives

1. Préparer un terrain dans le jardin actif, notamment en y plaçant les objets souhaités.
2. Ouvrir **le laboratoire**, puis **Mémoriser le terrain actif**. Le contenu physique, les positions, recettes, identifiants et RNG sont copiés. Les récupérations des objets sont remises à zéro pour tous les essais.
3. Sélectionner un profil, puis **Créer un essai neuf**. Une copie distincte est créée et activée ; l’original est conservé.
4. Répéter pour un autre profil en gardant le même terrain mémorisé.
5. Activer chaque essai et utiliser **Avancer de 30 s** le même nombre de fois. Chaque clic exécute exactement 300 ticks du seul profil actif, même si le temps réel du jardin est en pause.
6. Comparer les états à âge simulé égal. Pour rejouer un ancien terrain d’essai, sélectionner cet essai puis **Réutiliser le terrain de cet essai**.

Un essai neuf conserve uniquement le génome : corps initial, besoins, position centrale, action et mémoires sont réinitialisés de manière identique. Le terrain mémorisé n’inclut pas la physiologie du profil ayant servi à le préparer. Chaque essai conserve aussi sa propre copie du terrain initial pour rester reproductible après un changement de terrain dans le laboratoire.

L’empreinte affichée identifie le contenu initial pour la lecture du tableau ; elle n’est pas une preuve cryptographique. Les tests comparent les données physiques complètes. Après le départ, les environnements évoluent selon les choix : des aliments peuvent disparaître à des moments différents. Pour contrôler l’expérience, les commandes du joueur doivent être les mêmes aux mêmes ticks. L’avance exacte permet une comparaison sans intervention ; elle ne contrôle pas automatiquement les soins ultérieurs.

## Sauvegardes et limites

- Les mondes v1 et v2 avec génome v1 sont toujours acceptés. Leurs nouveaux coefficients valent **1** : le génome original n’est pas réécrit et ses préférences ne sont pas effacées. Une continuation de référence vérifie l’identité complète après 300 ticks, y compris une interaction déjà engagée.
- Le format du monde reste v2 ; le génome qu’il contient est explicitement versionné v1 ou v2. Les anciennes applications qui ne connaissent que le génome v1 ne peuvent pas lire les nouveaux génotypes.
- Le laboratoire utilise une enveloppe JSON distincte : `kind: "luma-laboratory"`, `version: 1`. L’import vérifie les profils, génomes, références parentales, sources d’essai, terrains et identifiants avant de remplacer la collection courante. Les références cycliques sont rejetées. La limite d’import est de 1,5 million de caractères ; chaque monde conserve sa propre limite de 100 000 caractères.
- La clé locale `luma.laboratory.v1` conserve tous les profils ; `luma.world.v1` reste un miroir du jardin actif et un recours pour les anciennes sauvegardes. Sans archive de laboratoire, une ancienne sauvegarde individuelle devient le premier profil.
- **Exporter un fichier JSON** exporte le jardin actif ; son import remplace seulement ce jardin. **Exporter le laboratoire** conserve la collection complète, ascendance et terrains d’essai compris ; son import remplace toute la collection. Exporter avant un remplacement si les deux collections doivent être conservées.
- Le prototype conserve jusqu’à huit profils. Les archives JSON permettent de garder plusieurs collections. Les données restent locales au navigateur et à son origine ; aucun compte ou serveur n’est ajouté.

Les fréquences restent 10 Hz pour le moteur, 30 images/s pour le rendu et 4 Hz pour le panneau. La perception reste bornée à 48 aliments et 12 objets. Les profils inactifs n’ajoutent aucun tick biologique ; le tableau n’est reconstruit que lors des actions dans le laboratoire. La compilation ajoute environ 5 Ko de JavaScript gzip. La performance sur Android physique reste à mesurer.

## Preuves automatisées

Les tests couvrent reproductibilité génétique et environnementale, variation de tous les loci, transmission bornée, absence de souvenirs hérités, labels sans effet comportemental, mécanismes physiologiques, profil inactif figé, reprise exacte, essais neufs identiques, indépendance mémoire/terrain, sauvegardes complètes et imports invalides.

Les expériences contrôlées isolent la sensibilité aux toxines puis les gains sensoriels/stress. D’autres tests utilisent directement les graines générées : `population-98` et `population-424` apprennent des bilans alimentaires de signes opposés pour la même recette ; `population-121` et `population-442` ressentent des bilans opposés face au même prisme. Ces cas résultent des paramètres biologiques, sans préférence prédéfinie. Les tests d’histoire individuelle de l’étape 2 sont conservés, et un génome moderne identique reçoit aussi des expériences alimentaires différentes.

Les tests navigateur manipulent les contrôles réels en portrait Android émulé et sur ordinateur : création, inspection, changement de profil, avance exacte, essais comparatifs, transmission, export/import complet et rechargement. Ils complètent les scénarios existants d’alimentation, d’objets et de migration.
