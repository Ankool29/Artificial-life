# Étape 5.1 — observatoire écologique et diagnostic de mortalité

## Périmètre et audit

Base : `b91d73c8069a4eaf9172147f57fe6fd4772974b4`, étape 5 fusionnée. Les scénarios observés par le joueur ne sont pas disponibles sous forme d’états ou de traces ; ils motivent l’instrumentation, sans justifier une modification des règles ou une explication rétrospective certaine.

| Fonction auditée | Ce qu’elle calcule effectivement |
| --- | --- |
| `ecology.ts:updateEcology` | Prélèvements locaux, ombrage, énergie, stades, germination, fruits, dispersion et pertes de santé. Les stocks sont effacés lors de `die` ; les facteurs doivent donc être capturés avant cet effacement. |
| `metabolism.ts:metabolize` | Dépense énergétique, absorption des bolus, pertes de santé dues aux doses toxiques, détoxification, perte de santé lorsque l’énergie est < 1 et récupération sous conditions. |
| `world.ts:step` | Perception, décision, mouvement, ingestion, métabolisme et arrêt lorsque la santé atteint zéro. Il ne calcule pas de cause unique de décès. |
| `perception.ts:perceive` | Test de distance ≤ rayon génétique. Aucun obstacle, connaissance chimique, origine végétale ou calcul de trajet n’est fourni au cerveau. |
| `decisions.ts:decide` | Arbitrage réellement exécuté ; le diagnostic existant fournit les aliments perçus, distances, motivations, branche et action choisie. |
| `persistence.ts`, `laboratory.ts` | Mondes et collections versionnés. Les anciens formats n’ont pas de journal de mortalité à reconstruire. |

Les modifications de ces fonctions ajoutent uniquement des paramètres/callbacks de diagnostic facultatifs et la lecture de valeurs déjà calculées. Les expressions de décision, de métabolisme, d’écologie, les seuils et tirages aléatoires sont inchangés. Aucun nouveau champ n’est ajouté à `World`, au génome, à l’extension écologique ou à une sauvegarde du laboratoire.

## Utilisation

**Observatoire écologique et mortalité** ouvre un panneau facultatif. La capture est active par défaut pour disposer des minutes précédant un décès, même si le panneau n’a jamais été ouvert. Fermer le panneau masque son rendu et conserve la capture ; décocher **Enregistrer passivement** suspend son historique. La reprise crée un nouveau segment avec une lacune explicite. Après rechargement, la capture est de nouveau active par défaut.

Le panneau présente :

- les populations **vivantes** par variété, graines comprises ;
- les fruits végétaux disponibles, séparés des aliments manuels et des machines ;
- les sommes d’eau et de minéraux du sol, sur un axe numérique commun mais dans leurs unités abstraites distinctes ;
- dans les détails : stades par variété, occupation des 25 zones, compteurs, facteurs de mortalité, événements et état corporel récent ;
- après un décès : un rapport avec faits, hypothèses et limites séparés.

Une variété possédant encore une graine ou une plante vivante n’est pas déclarée éteinte parce qu’elle n’a plus de fruits. Inversement, des fruits détachés peuvent persister après la disparition de toutes ses plantes. Une absence au premier relevé n’est pas un événement d’extinction enregistré. Les retraits par le joueur ne sont pas comptés comme des morts naturelles.

**Exporter le relevé scientifique JSON** exporte la session bornée, ses valeurs, événements et le rapport éventuel. Cet export est une donnée de diagnostic, pas un fichier de sauvegarde importable dans le jeu.

## Capture strictement passive

`src/observatory/ecological.ts:EcologicalObservatory` conserve ses contextes dans une `WeakMap<World, Context>`. Le moteur ne lit jamais ces contextes. La méthode `step` appelle une fois le tick normal, recueille les traces puis échantillonne les états ; désactivée, elle transmet directement le tick normal. Elle peut composer son callback avec celui de l’observatoire d’apprentissage existant.

Les trois chemins jouables utilisent ce même adaptateur : horloge principale, avance écologique de 60 s et avance du laboratoire de 30 s. Les copies scientifiques restent indépendantes. Le panneau et les graphiques ne font avancer aucun monde et ne consomment aucun hasard.

Les contrats physiques de diagnostic vivent dans `src/sim/ecological-diagnostics.ts`, les contrats de session dans `src/observatory/ecological-types.ts`. `src/ui/ecological-observatory.ts` ne lit que ces données. Le rendu des graphiques écologiques est réutilisé tant que le dernier relevé ne change pas ; les détails sont rendus seulement quand ils sont ouverts. Les segments interrompus ne sont pas reliés. Les périodes sans créature sont exclues des courbes d’activité corporelle.

### Mortalité végétale

Le callback de mort conserve la plante **avant** que `die` remette ses réserves à zéro, ainsi que la perte calculée et les conditions actives :

| Clé brute | Sens exact |
| --- | --- |
| `dormantExpired` | Graine encore dormante après 240 s ; contribution de dormance expirée. |
| `waterDeficit` | Plante non dormante dont l’eau interne est < 0,5 au calcul des dégâts. |
| `energyDeficit` | Plante non dormante dont les réserves énergétiques sont < 0,2. |
| `mineralDeficit` | Plante non dormante dont le facteur de nutrition est < 0,15. |
| `oldAge` | Âge dépassant la longévité individuelle. |

Plusieurs facteurs peuvent être actifs à la fois. Les compteurs par facteur comptent les morts où cette condition était active ; leur somme peut dépasser le nombre de morts. Ils ne partagent pas arbitrairement la responsabilité et ne désignent pas une cause historique unique. Les réserves, stades, descendants observés et ressources locales permettent d’examiner les hypothèses de remplacement insuffisant ou de compétition, sans les inventer.

### Les cinq niveaux alimentaires

| Niveau | Donnée et portée |
| --- | --- |
| Physiquement présent | Tous les `Food` du monde ; quantité, catégorie et dose nutritive physique. Cette composition est un diagnostic, jamais une entrée ajoutée au cerveau. |
| Perceptible selon le rayon | Appel passif à la même fonction `perceive`, avec identités et distances. Il ne déclenche aucune décision. Après un décès, c’est un test géométrique sur le dernier corps, pas une perception active. |
| Conditions d’accès immédiat | Distance ≤ 9 et capacité stomacale suffisante pour la masse. Ces conditions sont nécessaires mais ne prouvent ni choix ni ingestion. Le temps `(distance − 9) / vitesse`, borné à zéro, est une durée théorique sans obstacle ; il ne prédit pas l’action, la péremption ou la survie. |
| Effectivement consommé | Callback d’ingestion réussi, identité, variété, masse et dose physique ; les refus pour estomac plein ne deviennent pas des repas. |
| Effectivement absorbé | Quantité nutritive retirée au bolus, dose toxique absorbée et gain réel d’énergie **après rendement et saturation**. Ce gain peut être inférieur à la dose nutritive. |

Les dernières décisions conservent les observations effectivement utilisées par `decide`, distinctes du relevé passif de rayon. Le rapport garde en plus la dernière trace complète de décision et ses scores réellement calculés, ainsi que les associations alimentaires à l’arrêt, clairement séparées des valeurs utilisées lors du choix. Les actions exécutées sont échantillonnées à la seconde et lors des changements, avec déplacement réellement mesuré sur ce tick de 100 ms. Leur liste n’est pas une intégrale de toutes les distances parcourues.

### Rapport de décès

Le dernier tick métabolique enregistre les pertes **réellement appliquées**, après bornage : dépense énergétique, perte de santé par absorption toxique, perte par déficit énergétique et récupération. Le rapport distingue ces contributions du critère d’arrêt `health <= 0`. Une perte toxique peut précéder un épuisement énergétique ; le dernier tick ne résume pas nécessairement toute la trajectoire.

Le rapport fige l’état corporel, les aliments, l’écosystème, les décisions et les intervalles d’absorption conservés au moment de l’arrêt. La végétation peut ensuite continuer sans modifier ce rapport. Un monde déjà mort au début de capture, ou un décès survenu pendant sa suspension, produit un rapport marqué **passé inconnu** : aucun dernier tick, repas ou choix antérieur n’est reconstitué. Son état écologique est celui de la consultation, pas un état inventé à la date de mort.

Les explications conjecturales sont dans **Hypothèses à examiner**. Par exemple, nourriture restante hors du rayon et manque d’ingestion peuvent être compatibles, sans prouver qu’un trajet antérieur était impossible. Aucune règle d’évitement, préférence végétale, réduction de faim ou alimentation corrective n’est introduite.

## Limites de mémoire

| Donnée par monde | Limite |
| --- | --- |
| Relevés écologiques | 180, normalement espacés de 5 s, soit environ 15 min ; un relevé forcé par intervention peut réduire cette durée |
| Relevés corporels | 180, normalement espacés de 1 s, soit environ 3 min |
| Chronologie | 256 événements ; nombre d’entrées évincées affiché |
| Ingestions / décisions / exécutions | 64 / 96 / 180 entrées ; leurs durées couvertes peuvent différer |
| Aliments détaillés dans un relevé corporel ordinaire | Les huit plus proches parmi les perceptibles ; décompte total et indicateur de troncature conservés |
| Rapport de décès | 120 000 caractères au maximum ; détail terminal complet jusqu’à 48 aliments |
| Stockage local des rapports | Jusqu’à huit profils, enveloppe de 1 000 000 caractères |

Le rapport réduit d’abord les anciennes identités alimentaires, puis les anciennes décisions/actions ; il sous-échantillonne au besoin la courbe en conservant ses extrémités. Ces réductions sont annoncées. **Les totaux d’absorption des relevés originaux restent conservés séparément**, avant réduction de la courbe : ils ne sont pas recalculés en sommant seulement les points restants. Les inspections répétées au même tick ne consomment pas la capacité et ne doublent pas l’absorption.

Les compteurs par variété sont cumulés seulement pendant les périodes de capture, même lorsque leurs événements détaillés sont évincés. Les compteurs mondiaux persistants restent ceux de l’écologie ; leurs valeurs initiales peuvent précéder la capture. Un même nombre dans ces deux séries n’est attendu que si la capture commence au début des événements considérés.

## Sauvegarde et rechargement

Les formats du jeu restent identiques. Les historiques ordinaires, les dernières décisions et compteurs par variété du nouvel observatoire restent en mémoire ; ils repartent explicitement sans passé au rechargement. L’export scientifique permet de les conserver hors du jeu.

Les **rapports de décès** sont sauvegardés localement à part, sous `luma.ecological-reports.v1`, en même temps que le laboratoire. Chaque rapport est lié à l’identifiant du profil et à une empreinte du **monde complet effectivement sauvegardé**. Au rechargement, il est réattaché seulement si cette empreinte et le corps final correspondent. L’empreinte double de cohérence n’est ni une signature cryptographique ni une identité globale de créature. Une ancienne sauvegarde sans rapport est acceptée normalement, avec passé inconnu si elle contient un décès.

Les validations bornent les tableaux, nombres, catégories et profondeurs des rapports ; un rapport invalide est ignoré sans rejeter un monde valide. Les rapports d’un monde remplacé ne sont pas attribués automatiquement au suivant. Les profils inactifs gardent leurs rapports en mémoire et dans ce stockage local.

Les exports **du monde** et **du laboratoire** conservent leurs formats historiques et **n’incluent pas** le stockage de diagnostic séparé. Pour transporter le rapport vers un autre appareil, exporter également le relevé scientifique ; celui-ci se consulte comme JSON et n’est pas réimporté par cette version. Effacer les données du navigateur supprime les rapports locaux. La sauvegarde périodique reste toutes les 15 s et au masquage/à la fermeture ; une panne avant sauvegarde peut perdre les dernières données. Une erreur de quota est signalée ; le diagnostic ne contourne pas les limites de stockage du navigateur.

## Validation scientifique

Voir [le protocole et les résultats](research/ecological-observatory-study.md) et [les données brutes](research/ecological-observatory-results.json). La validation comprend parité tick par tick, traces de décision identiques, interventions sur la capture, digestion et saturation, rapports inconnus, budgets, sauvegardes, navigateur portrait et rejeu de la cohorte historique de l’étape 5.

[Aperçu portrait](previews/ecological-observatory-android-portrait.png) · [Rapport de décès en portrait](previews/ecological-death-android-portrait.png)
