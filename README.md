# Luma · Le jardin vivant

Un jeu original d’élevage et d’observation de vie artificielle. Une créature, Milo, explore un terrarium, digère réellement ses repas et apprend à associer leurs signaux sensoriels à leurs effets biologiques. Interface française, tactile et adaptée au portrait.

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

## Déploiement sur GitHub Pages

Le workflow [Deploy Luma to GitHub Pages](.github/workflows/pages.yml) compile et publie `dist/` à chaque mise à jour de `main`, après activation de Pages. URL attendue : **https://ankool29.github.io/Artificial-life/**.

Un administrateur du dépôt doit sélectionner **Settings → Pages → Build and deployment → Source : GitHub Actions**. Aucune branche `gh-pages`, aucun jeton personnel ni secret supplémentaire n’est nécessaire. Le workflow CI existant reste indépendant et inchangé.

Voir [les instructions complètes](docs/github-pages.md) pour le premier déploiement, une relance manuelle et la vérification des chemins de production.

## Architecture

Le moteur dans `src/sim/` ne dépend ni du DOM, ni du canvas, ni du stockage du navigateur. Une seule créature ; aucune bibliothèque graphique ou dépendance d’exécution.

| Module | Responsabilité |
| --- | --- |
| `types.ts` | Contrats versionnés, unités de monde, pas fixe de 100 ms |
| `random.ts` | Graine textuelle et générateur pseudo-aléatoire à état explicite |
| `genome.ts` | Loci nommés : locomotion, portée sensorielle, assimilation, détoxification, plasticité, exploration |
| `metabolism.ts` | Capacité digestive, absorption différée, énergie, faim, toxines, santé, renforcement interne |
| `brain.ts` | Mémoire associative par signal sensoriel, règle delta |
| `perception.ts` | Filtrage spatial ; la composition chimique n’est jamais exposée aux décisions |
| `decisions.ts` | Arbitrage faim, valeur apprise, distance et exploration |
| `world.ts` | Initialisation, commandes d’ajout de nourriture, orchestration à pas fixe |
| `persistence.ts` | JSON complet et validation structurelle des imports |
| `src/ui/renderer.ts` | Dessin original et indépendant du hasard biologique |
| `src/main.ts` | Contrôles, boucle d’horloge, interface biologique facultative et stockage |

Voir [la conception détaillée](docs/architecture.md) pour les équations, compromis et pistes d’évolution.

## Sauvegardes et déterminisme

- Sauvegarde automatique locale toutes les 15 secondes et au masquage/à la fermeture de la page. Restauration au prochain lancement, sans faire avancer le temps d’absence.
- Sauvegarde manuelle, chargement local, export et import JSON depuis l’icône en haut à droite. Les imports invalides conservent le jardin courant.
- Le JSON conserve le génome, les bolus en cours de digestion, la mémoire, l’action, les échéances de décision et l’état du générateur.
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

Il s’agit d’un modèle biologique simplifié : pas encore de reproduction, mutation, réseaux neuronaux, population, microbiome ni sélection sur plusieurs générations. Le génome influence déjà les mécanismes ; il ne code pas des préférences alimentaires. Le cerveau est un système d’apprentissage associatif tabulaire, pas un réseau neuronal. Les aliments sont fixes dans ce monde, mais des compositions modifiées produisent d’autres associations sans modifier le cerveau.

Calcul à 10 Hz, décisions au plus à 0,5 Hz, dessin plafonné à 30 images/s, mises à jour du panneau à 4 Hz, densité de pixels plafonnée à 2 et 48 aliments maximum. La performance sur un appareil Android physique reste à mesurer.

Tous les dessins sont procéduraux et originaux. Aucun personnage, graphisme, son ou contenu de Creatures n’est utilisé. Les polices Google sont facultatives : la mise en page dispose de polices système de secours. Aucune télémétrie.
