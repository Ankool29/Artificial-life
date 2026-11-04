# Luma · Le jardin vivant

Un jeu original d’élevage et d’observation de vie artificielle. Une créature, Milo, explore un terrarium, digère réellement ses repas et apprend à associer les aliments et les objets à leurs effets internes. Interface française, tactile et adaptée au portrait.

[Aperçu mobile](docs/previews/android-portrait.png) · [Aperçu ordinateur](docs/previews/desktop.png) · [Résultats de validation](docs/validation.md)

## Jouer en local

Node.js **22.12+** (ou 24 LTS) et npm sont requis.

```sh
npm ci
npm run dev
```

Ouvrir l’adresse affichée par Vite. Pour jouer sur Android depuis le même réseau Wi-Fi, ouvrir `http://<IP-de-votre-ordinateur>:5173` sur le téléphone ; autoriser le port dans le pare-feu local si nécessaire. Pour GitHub Pages, `npm run build` produit `dist/` avec le préfixe `/Artificial-life/`. Aucun serveur applicatif ni compte nécessaire.

1. Choisir un aliment puis toucher le jardin pour le déposer. « Semer un trio » en ajoute trois avec des positions reproductibles.
2. Observer Milo choisir, se déplacer et manger. Il n’obéit pas au doigt ; vous entretenez son environnement.
3. Attendre la digestion (environ 4 à 13 secondes selon le nombre de repas), puis comparer ses préférences dans « Observer Milo ». Plusieurs expériences font évoluer la mémoire. Les vitesses 2× et 4× accélèrent la simulation.
4. Maintenir une alimentation suffisante ; les toxines et la famine peuvent conduire à la mort. Le menu sauvegarde permet de faire éclore une nouvelle vie.

Au départ, tous les aliments sont inconnus. Dans ce premier monde, le grain solaire est nourrissant, la perle de rosée moins énergétique et la baie corail toxique. **Le cerveau ne dispose pas de cette information.** Il continue d’explorer occasionnellement même après un apprentissage négatif.

## Étape 2 : curiosité et objets

La palette **Objets** permet de déposer un carillon de graines, un coussin de mousse ou un galet prismatique, puis de les retirer en touchant leur emplacement avec **Retirer un objet**. Le jardin commence sans objets ; les anciennes sauvegardes conservent leur environnement. Jusqu’à 12 objets peuvent être présents.

Milo peut manquer de stimulation, se fatiguer et ressentir du stress. Il perçoit les objets proches sans connaître leurs effets, les approche et interagit pendant trois secondes. Les changements réellement vécus alimentent une mémoire distincte de celle des repas. Une même apparence peut donc devenir appréciée ou évitée selon ses conséquences. Les objets ont une récupération de huit secondes après une interaction.

Dans les recettes initiales, le carillon stimule avec un coût en fatigue et énergie, la mousse peut soulager fatigue et stress, tandis que le galet stimule mais peut être éprouvant. Ces propriétés sont la physique du monde, **pas des préférences accessibles aux décisions**. La satiété sensorielle, la fatigue et les expériences passées font évoluer leur intérêt. Milo peut préférer une stimulation quand il s’ennuie et un objet apaisant lorsqu’il est fatigué. Une faim urgente conserve la priorité sur l’exploration lorsqu’un aliment est choisi.

**Observer Milo** révèle les motivations, les associations alimentaires, la mémoire des objets et les effets attendus appris. La perception reste affichable à la demande. L’alimentation, la pause, les vitesses et l’export/import restent disponibles.

[Conception et analyse du moteur existant](docs/curiosity.md) · [Aperçu ordinateur](docs/previews/curiosity-desktop.png) · [Aperçu Android portrait](docs/previews/curiosity-android-portrait.png)

## Étape 3 : laboratoire de diversité individuelle

**Ouvrir le laboratoire** permet de créer et conserver jusqu’à huit profils indépendants, puis de passer de l’un à l’autre. Un seul individu évolue ; les autres gardent exactement leur corps, leurs besoins, leur mémoire et leur terrain.

Dans **Créer un individu**, saisir un nom, une **graine génétique** et une **graine de terrain**. Les treize paramètres biologiques des nouveaux génomes influencent réellement le moteur. Les noms ne définissent aucune personnalité ; les associations alimentaires et celles des objets commencent neutres. Un parent peut être choisi pour une transmission des gènes avec petites mutations reproductibles, sans héritage des souvenirs ni cohabitation.

Pour comparer, **Mémoriser le terrain actif**, sélectionner successivement deux profils et **Créer un essai neuf** pour chacun. Les originaux restent conservés. Les essais repartent avec le même corps initial, les mêmes besoins et mémoires neutres, le même terrain et le même hasard environnemental, mais leur propre génome. **Avancer de 30 s** exécute exactement 300 ticks sur le seul profil actif. Le tableau et les détails affichent caractéristiques, besoins et associations de chaque individu.

La sauvegarde locale et **Exporter le laboratoire** conservent toute la collection. L’export individuel reste disponible. Les anciennes sauvegardes deviennent un profil compatible ; leurs paramètres, préférences et mécanismes sont préservés avec des coefficients neutres pour les nouveaux traits.

[Audit des gènes, protocole et compatibilité](docs/laboratory.md) · [Laboratoire sur ordinateur](docs/previews/laboratory-desktop.png) · [Laboratoire sur Android portrait](docs/previews/laboratory-android-portrait.png)

## Étape 3.5 : observatoire de l’apprentissage

**Observatoire de l’apprentissage** ouvre un panneau facultatif : action actuelle, données de la dernière décision, perception et scores effectivement calculés, associations connues ou inconnues, conséquences mesurées, courbes et chronologie filtrable. La capture peut être suspendue ; ses données restent bornées en mémoire et ne sont pas ajoutées aux sauvegardes.

Le laboratoire permet de comparer deux profils, puis d’exécuter sur des copies isolées quatre protocoles reproductibles : préférence, aversion, changement des effets et diversité physiologique. Les originaux restent intacts. L’instrumentation conserve les règles biologiques et cognitives ainsi que le générateur aléatoire.

[Utilisation, contrat de preuve et expériences](docs/learning-observatory.md) · [Étude C3/DS ayant guidé cette étape](docs/research/creatures3-engine-study.md)

## Étape 4 : apprentissage instrumental

Dans **Objets → Machine à levier**, placez une distributrice et choisissez la baie fabriquée. Sa réserve est limitée à 12 doses, avec un délai de production et une recharge physique. Luma découvre le geste par curiosité ; la machine ne lui donne aucune récompense directe. La baie est mangée et digérée normalement.

Luma peut rapprocher une action d’une nouvelle ressource perçue, puis apprendre la valeur biologique de ses conséquences. Une absence suffisamment observée peut diminuer l’attente de production. L’observatoire distingue faits physiques, événements perçus, estimations apprises et scores réellement calculés.

Sur la cohorte publiée de 24 graines, les sondes après acquisition bénéfique mesurent 3,92 tentatives contre 0,13 chez les témoins ; après panne, la moyenne redescend à 2,38. L’extinction est incomplète et cet essai ne démontre pas un meilleur rendement alimentaire global.

[Mécanisme accessible, protocole, résultats et limites](docs/instrumental-learning.md) · [Données mesurées](docs/research/instrumental-results.json)

## Étape 4.2 : attribution des conséquences

Les liens entre action, ressource et digestion sont conservés indépendamment des épisodes récents. Les apparitions simultanées peuvent exclure une hypothèse ; les ambiguïtés impossibles à résoudre restent sans crédit biologique. L’observatoire affiche ces traces et distingue les bilans partiels à l’arrêt de vie. Les anciennes sauvegardes sont migrées sans modifier les gènes ou les associations alimentaires.

[Explication et compatibilité](docs/consequence-attribution.md) · [Comparaison ancien/nouveau, données et limites](docs/research/consequence-attribution-study.md)

## Déploiement sur GitHub Pages

Le workflow [Deploy Luma to GitHub Pages](.github/workflows/pages.yml) compile et publie `dist/` à chaque mise à jour de `main`, après activation de Pages. URL attendue : **https://ankool29.github.io/Artificial-life/**.

Un administrateur du dépôt doit sélectionner **Settings → Pages → Build and deployment → Source : GitHub Actions**. Aucune branche `gh-pages`, aucun jeton personnel ni secret supplémentaire n’est nécessaire. Le workflow CI existant reste indépendant et inchangé.

Voir [les instructions complètes](docs/github-pages.md) pour le premier déploiement, une relance manuelle et la vérification des chemins de production.

## Architecture

Le moteur dans `src/sim/` ne dépend ni du DOM, ni du canvas, ni du stockage du navigateur. Une seule créature ; aucune bibliothèque graphique ou dépendance d’exécution.

| Module                            | Responsabilité                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `types.ts`                        | Contrats versionnés, unités de monde, pas fixe de 100 ms                                       |
| `random.ts`                       | Graine textuelle et générateur pseudo-aléatoire à état explicite                               |
| `genome.ts`                       | Génomes v1/v2, treize loci exprimés, génération indépendante du terrain et transmission bornée |
| `metabolism.ts`                   | Capacité digestive, absorption différée, énergie, faim, toxines, santé, renforcement interne   |
| `brain.ts`                        | Mémoire associative par signal sensoriel, règle delta                                          |
| `perception.ts`                   | Filtrage spatial ; la composition chimique n’est jamais exposée aux décisions                  |
| `curiosity.ts`                    | Stimulation, fatigue, stress, motivations et apprentissage des effets d’interaction            |
| `objects.ts`                      | Recettes physiques, placement et retrait des objets                                            |
| `decisions.ts`                    | Arbitrage faim, curiosité, repos, apaisement, valeurs apprises et distance                     |
| `world.ts`                        | Initialisation, commandes d’ajout de nourriture, orchestration à pas fixe                      |
| `persistence.ts`                  | JSON complet et validation structurelle des imports                                            |
| `src/ui/renderer.ts`              | Dessin original et indépendant du hasard biologique                                            |
| `src/main.ts`                     | Contrôles, boucle d’horloge, interface biologique facultative et stockage                      |
| `src/lab/laboratory.ts`           | Profils indépendants, monde actif, terrains d’essai et archivage de la collection              |
| `src/ui/laboratory.ts`            | Inspection des individus et expériences comparatives sans cohabitation                         |
| `diagnostics.ts`                  | Charges de diagnostic détachées, absentes de l’état sauvegardé                                 |
| `src/observatory/`                | Capture bornée et protocoles sur copies isolées                                                |
| `src/ui/observatory.ts`           | Dernière décision, associations, chronologie et comparaison de deux profils                    |
| `devices.ts`                      | Physique indépendante des distributeurs : réserve, production, recharge                        |
| `instrumental.ts`                 | Perception, transitions, épisodes et crédit biologique différé                                 |
| `instrumental-persistence.ts`     | Validation de l’extension cognitive et physique optionnelle                                    |
| `src/experiments/instrumental.ts` | Cohorte reproductible, témoins et sondes à état corporel identique                             |

Voir [la conception détaillée](docs/architecture.md) pour les équations, compromis et pistes d’évolution.

## Sauvegardes et déterminisme

- Sauvegarde automatique locale de tous les profils toutes les 15 secondes et au masquage/à la fermeture de la page, ainsi qu’après les actions du laboratoire. Restauration au prochain lancement, sans faire avancer le temps d’absence ou des profils inactifs.
- Sauvegarde manuelle, chargement local, export et import JSON depuis l’icône en haut à droite. Les imports invalides conservent le jardin courant.
- Le JSON conserve le génome, les bolus en cours de digestion, la mémoire, l’action, les échéances de décision et l’état du générateur.
- Le format actuel est **v2**. Les sauvegardes **v1** sont migrées automatiquement : valeurs biologiques, préférences alimentaires, digestion, action, temps et hasard sont conservés ; les besoins et la mémoire des objets sont ajoutés sans tirage aléatoire. Les v2 conservent aussi les objets, leur récupération et une interaction en cours. La clé locale existante est conservée pour retrouver les jardins déjà sauvegardés.
- Les nouveaux génomes sont versionnés v2 à l’intérieur des mondes ; les génomes v1 continuent d’utiliser leurs équations d’origine. L’archive complète du laboratoire possède son propre format versionné et conserve aussi les ascendants génétiques et les terrains initiaux des essais.
- Les machines introduisent une extension instrumentale optionnelle versionnée, sans changer le format de base des anciens mondes. Les délais physiques, mémoires, épisodes et crédits de digestion sont conservés ; l’historique de diagnostic reste uniquement en mémoire.
- Une même graine **et la même séquence de commandes aux mêmes ticks** reproduisent l’évolution dans le même runtime. Le temps mural, la fréquence d’affichage et l’ouverture du panneau ne modifient pas la simulation.
- L’onglet masqué et les dialogues suspendent la simulation. Pause et vitesse sont des préférences d’affichage, pas un état biologique sauvegardé.
- Les fonctions trigonométriques peuvent différer de quelques bits entre moteurs JavaScript : une identité binaire entre moteurs différents n’est pas garantie.

## Vérifier

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Les tests vérifient les interactions complètes entre perception, choix, ingestion, digestion et mémoire ; l’inversion des préférences lorsque la chimie change ; le déterminisme après reprise en pleine digestion ; la validation des sauvegardes ; les limites de capacité ; la famine et les invariants sur de longues simulations. Les tests navigateur couvrent le format mobile, les contrôles et les sauvegardes. Le workflow GitHub Actions exécute les deux suites et la compilation.

Sur un système fournissant déjà Chromium : `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`.

## Périmètre du prototype

Il s’agit d’un modèle biologique simplifié : la transmission et les mutations sont contrôlées au laboratoire, sans reproduction autonome, cohabitation, réseaux neuronaux, population, microbiome ni sélection dans le terrarium. Le génome influence les mécanismes ; il ne code pas des préférences alimentaires ou d’objets. Le cerveau est un système d’apprentissage associatif tabulaire. Les aliments ont des recettes physiques ; des compositions ou physiologies différentes produisent d’autres associations sans modifier le cerveau.

Calcul à 10 Hz, réévaluation habituelle des décisions toutes les 2 s (avec relance après une action), dessin plafonné à 30 images/s, mises à jour du panneau à 4 Hz, densité de pixels plafonnée à 2, 48 aliments et 12 objets maximum. La performance sur un appareil Android physique reste à mesurer.

Tous les dessins sont procéduraux et originaux. Aucun personnage, graphisme, son ou contenu de Creatures n’est utilisé. Les polices Google sont facultatives : la mise en page dispose de polices système de secours. Aucune télémétrie.
