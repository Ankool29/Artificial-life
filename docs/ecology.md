# Végétation vivante — étape 5

## Audit préalable

Référence : `f3e087752512657427c1d31231e58bdb39d113d4`, après fusion de l’étape 4.2.

- `src/sim/world.ts` : ticks de 100 ms ; physique des machines avant perception, mouvement puis ingestion et métabolisme. Le monde classique s’arrête au décès.
- `Food`, `addFood` et `FOOD_RECIPES` : identité stable, position, signal et chimie ; plafond de 48 aliments. Les plantes réutilisent ces aliments.
- `perception.ts` : seuls identité, signal, distance et position atteignent le cerveau ; ni composition ni producteur.
- `decisions.ts` et `metabolism.ts` : déplacement autonome, capacité digestive, faim et renforcement alimentaire ; aucune modification de ces règles n’est prévue.
- `instrumental.ts` : preuves perceptives durables jusqu’au bolus, hypothèses incertaines et bilans partiels. Les productions végétales doivent rester de simples apparitions perçues ; aucune provenance privilégiée ne sera ajoutée.
- `persistence.ts` : validation avant import, monde v2 et extension instrumentale versionnée, limite globale de 100 000 caractères.
- `laboratory.ts` : profils indépendants et terrains reproductibles. Une capture écologique doit conserver plantes, sol, phase et RNG écologique.
- `renderer.ts` : décor végétal actuellement procédural et sans état biologique. Le rendu ne doit jamais consommer le hasard de simulation.

## Architecture retenue

Une extension écologique optionnelle conserve les plantes et un sol en 25 zones. Le module physique ne reçoit pas la créature : ses entrées sont les ressources, les plantes, les aliments physiques et l’allocateur d’identités. Il possède un RNG indépendant et travaille à une seconde biologique par mise à jour.

Les anciennes sauvegardes sans extension conservent leur simulation classique. Les nouveaux jardins peuvent activer l’écologie ; leur temps continue après le décès ou en l’absence de créature. La présence de Luma est une commande explicite, pas une réponse automatique à la pénurie.

L’eau et les minéraux du sol sont finis localement. Les prélèvements concurrents sont proportionnels aux demandes, avant la croissance individuelle. Lumière, hydratation et disponibilité minérale influencent photosynthèse, développement et reproduction. Les flux d’entrée, sorties et transferts internes sont comptabilisés.

Les graines fondatrices sont introduites lors d’une commande de création ou de semis. Les graines suivantes coûtent des réserves au parent. Aucune plante ne réapparaît pour nourrir Luma. Les fruits utilisent les trois recettes historiques et leur production ne donne aucune récompense cognitive.

## Règles biologiques et unités

Les unités sont celles d’un modèle de jeu, pas des grammes ou des watts. La structure végétale est comptée en énergie immobilisée. Les minéraux du sol sont distincts du champ `Food.nutrients`, qui mesure l’énergie nutritive des baies. Il ne s’agit pas d’une chimie atomique complète.

Une plante conserve identité, position, variété, âge, stade, santé, réserves énergétiques, structure, eau et minéraux internes, durée de vie, fruit en formation, compteur de graines et délai reproductif. Les trois variétés ont la même physiologie végétale ; leur fruit conserve sa recette historique.

| Paramètre | Première version |
| --- | --- |
| Cadence écologique | Une mise à jour par seconde, sur les ticks existants de 100 ms |
| Sol | 5 × 5 zones, sans diffusion entre zones |
| Capacité | 36 plantes, graines et cadavres inclus ; 48 aliments physiques partagés avec les machines |
| Réserves par plante | Énergie 0–80 ; structure 0–40 ; eau 0–8 ; minéraux 0–4 |
| Sol par zone | Eau 0–100 ; minéraux disponibles 0–40 ; litière énergétique 0–1 000 ; minéraux de litière 0–100 |
| Conditions initiales ordinaires | Eau 60, minéraux 18 par zone ; neuf graines réparties, avec léger décalage reproductible |
| Lumière | Flux réglable 0–1,5 ; défaut 1 |
| Apport hydrique | Source externe constante par zone, défaut 0,14 unité/s, réglable 0–0,5 |
| Apport minéral | Altération externe simplifiée, défaut 0,0015 unité/s, réglable 0–0,05 |
| Graine | Import ou transfert de 4 énergie, 0,2 minéral et 0,25 eau |
| Germination | Âge ≥ 8 s, eau interne ≥ 1,2, lumière locale ≥ 0,18 ; progression dépendant du milieu et des voisins à moins de 22 unités |
| Maturité | Structure ≥ 28 et âge ≥ 80 s |
| Sénescence | À 80 % de la longévité ; photosynthèse réduite et reproduction arrêtée |
| Longévité | 720–1 080 s, tirée dans le RNG écologique ; ensuite perte de santé liée à l’âge |
| Viabilité d’une graine dormante | Après 240 s sans germination, santé décroissante ; aucune dormance éternelle |
| Fruit | Un fruit en formation par plante ; 20 unités de développement, ralenties par les déficits ; au plus deux fruits au sol par parent |
| Coût d’un fruit | Énergie nutritive + 5 + 0,8 × dose toxique ; 0,4 minéral et 0,6 eau ; coûts prélevés avant formation |
| Fruit détaché | Aliment normal de masse 10 ; décomposition après 180 s, uniquement pour les fruits végétaux |
| Reproduction | Au plus une graine par 120 s de phase adulte favorable ; coût transféré au descendant plus 1 énergie dissipée ; dispersion de 20–75 unités, bornée par le terrarium |
| Mort | Eau rendue au sol, énergie et minéraux transférés à la litière ; cadavre visible 45 s, puis retrait sans nouvelle perte de ressources |

Les cycles végétaux sont volontairement beaucoup plus rapides que ceux de plantes réelles. La longévité n’est ni un gène de Luma ni une personnalité végétale prédéfinie. Les descendants héritent de leur variété ; leur longévité est une variation aléatoire reproductible.

### Prélèvements et croissance

Dans chaque zone, les demandes d’eau et de minéraux sont calculées pour toutes les plantes avant leur répartition proportionnelle. Une plante précoce dans le tableau ne peut pas prélever tout le stock avant les autres. Les racines ne traversent pas les frontières de zone dans cette version.

La lumière locale vaut `lumière / (1 + 0,3 × structure normalisée des voisines de la zone)`. L’hydratation est bornée par `eau interne / 2` ; la disponibilité minérale par `minéraux internes / (0,2 + 0,06 × structure)`. Le produit de ces facteurs intervient dans le développement et la fructification. La photosynthèse dépend aussi de la surface foliaire, de la santé et de la sénescence. Le gain réellement stocké, limité par la réserve de 80, constitue l’entrée énergétique ; la lumière non convertie n’est pas comptée comme énergie biologique.

La croissance transfère des réserves vers la structure, sans créer d’énergie. Les minéraux restent dans le pool interne qui représente ensemble les fractions solubles et structurelles. Ils ne disparaissent pas lorsqu’ils sont incorporés au tissu. La fructification et les graines en prélèvent effectivement. Un manque sévère d’eau, d’énergie ou de minéraux endommage la santé. Un individu peut rester chétif, ne pas fructifier ou mourir.

Un fruit intégralement formé attend si les deux places de son parent ou les 48 places alimentaires sont occupées. Ses ressources restent immobilisées dans le bourgeon : aucune nouvelle dépense répétée ni création d’aliment au-delà du plafond. Le plafond alimentaire est une contrainte technique du prototype ; il ne représente pas à lui seul une capacité écologique réelle.

### Bilans de ressources

Chaque budget enregistre `stock initial + entrées − sorties`. La somme doit égaler les stocks actuels :

- Eau : sol + plantes + fruits en formation + fruits détachés.
- Minéraux : sol disponible + litière + plantes + fruits en formation + fruits détachés.
- Énergie : réserves + structure + fruits en formation + fruits détachés + litière énergétique.

Les entrées sont les semis du joueur, les apports d’eau/minéraux et l’énergie effectivement photosynthétisée. Les sorties sont l’évaporation, la transpiration, la respiration, les coûts de synthèse, la décomposition énergétique, le débordement, les retraits du joueur et les fruits ingérés. La décomposition restitue les minéraux à raison de 0,02 unité/s par zone ; 1 % de l’énergie de litière est dissipé par seconde. Tout débordement des stocks est compté comme sortie, sans troncature silencieuse.

L’ingestion exporte les réserves du fruit hors du système végétal, vers la biologie existante de Luma. L’excrétion et la restitution des minéraux par une créature ne sont pas simulées. Les aliments initiaux, déposés manuellement ou produits par une machine restent extérieurs à ces budgets végétaux. Leur chimie et leur durée d’existence historique ne changent pas. Une disparition externe d’un fruit végétal est comptée séparément de sa consommation.

## Interface et compatibilité

Les nouveaux jardins et nouveaux profils ont une végétation fondatrice. Un ancien monde chargé reste classique ; l’onglet **Végétation → Introduire neuf graines** l’active explicitement sans changer le génome, les souvenirs ou le RNG des décisions. **Semer** apporte une nouvelle graine ; **Consulter** sélectionne une plante au toucher ou dans la liste ; **Retirer** exporte ses ressources. Les fruits détachés restent accessibles à Luma par les mécanismes ordinaires.

La **Vue écologique détaillée** affiche les stocks locaux, les stades, les bilans et les commandes de lumière/apports. L’arrosage et les minéraux ajoutés à une zone sont des interventions enregistrées dans les budgets. **Avancer 60 s** avance le monde réel, donc également Luma si elle est présente et vivante.

**Luma dans le jardin**, décoché, retire l’agent actif ; son profil conservé dans l’archive n’est ni déplacé, ni nourri, ni digéré, ni utilisé pour le calcul végétal. Ce choix évite de perdre génome et apprentissages lors d’une expérience sans créature. L’absence invalide seulement la couverture d’une fenêtre d’observation interrompue. Une créature morte ne ressuscite pas lorsqu’on la rend présente.

L’écologie est une extension optionnelle versionnée du monde v2. Elle sauvegarde sol, plantes, fruits, budgets, phase et RNG. Une capture du laboratoire conserve aussi l’âge et le temps écologique ; un nouvel essai remet le temps et le corps de l’individu à zéro, mais conserve cet environnement physique identique. Les profils inactifs, le jeu en pause et les onglets masqués n’avancent pas : autonomie vis-à-vis de la créature ne signifie pas progression hors ligne.

## Capacités laissées à une étape ultérieure

Luma ne perçoit pas les plantes comme des objets à cibler et n’acquiert pas de mémoire spatiale, d’anticipation de récolte ou de calendrier de renouvellement. Un retour vers un emplacement peut provenir d’une baie visible et de ses préférences alimentaires, pas d’une compréhension du cycle végétal. Une apparition près d’une action récente peut toujours produire les ambiguïtés ou coïncidences connues de l’étape 4.2 ; le cerveau ne reçoit pas le parent physique d’un fruit.

Pas de météo, saisons, pollinisation, herbivorie des feuilles, transport du sol, collisions végétales, génétique végétale détaillée ni décomposition des cadavres animaux. Le bilan suit trois ressources abstraites ; il n’établit pas une conservation atomique de toutes les substances. Les mesures et limites sont détaillées dans [le rapport expérimental](research/ecology-study.md), avec [les 96 trajectoires brutes](research/ecology-results.json).

[Aperçu du jardin sans créature en portrait](previews/ecology-garden-android-portrait.png) · [Palette végétale et observation détaillée](previews/ecology-panel-android-portrait.png)
