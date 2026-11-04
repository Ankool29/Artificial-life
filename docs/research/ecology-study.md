# Étape 5 — végétation vivante : protocole, mesures et limites

## Conclusion limitée à ces essais

La végétation évolue sans créature : dans les douze jardins favorables sans agent, des graines germent, deviennent adultes, fructifient, se reproduisent et meurent. À une heure, il reste 15 à 35 plantes vivantes. Dans les milieux pauvres et les plantations très concentrées, la population disparaît sans remplacement automatique.

Avec Luma, les fruits entrent dans la perception et la digestion ordinaires. La consommation réduit les stocks disponibles et exporte des ressources du domaine végétal. Elle peut aussi libérer une place pour un nouveau fruit. Ces mécanismes ne constituent pas une mémoire de la plante chez Luma. La persistance sur une heure et les survies observées ne prouvent ni stabilité à long terme ni amélioration générale de survie.

Les règles et l’audit préalable sont décrits dans [ecology.md](../ecology.md). Le cerveau, les décisions, le métabolisme, les recettes alimentaires et l’attribution durable de l’étape 4.2 ne sont pas modifiés.

## Code et reproduction

- Référence avant modification : `f3e087752512657427c1d31231e58bdb39d113d4`.
- Physique : `src/sim/ecology.ts`, notamment `updateEcology`, `plantSeed`, `recordFruitIngestion`, `ecologicalStocks`, `ecologySummary`.
- Intégration : `src/sim/world.ts`, `createLivingWorld`, `setCreaturePresence`, `step` ; `src/sim/food.ts` réutilise exactement les recettes et le placement historiques.
- Protocole exécutable : `src/experiments/ecology.ts`, `prepareEcologyCase`, `runEcologyCase`, `ecologicalParity`, `ecologicalBenchmark`.
- Enregistrement : `tests/ecology-science.test.mjs` ; agrégation et contrôles d’appariement : `scripts/analyze-ecology.py`.
- Données : [ecology-results.json](ecology-results.json), 96 états initiaux et finaux complets, 121 relevés par trajectoire, résumés, mesures de temps brutes, métadonnées et agrégats. Aucun résultat pilote n’y est mélangé.

```sh
npm ci
RUN_ECOLOGY_STUDY=1 ECOLOGY_OUT=/tmp/luma-ecology-study.json npx vitest run tests/ecology-science.test.mjs
python3 scripts/analyze-ecology.py /tmp/luma-ecology-study.json
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
```

Les expériences facultatives sont exclues du `npm test` ordinaire. Le test `ecology-results.test.mjs` vérifie néanmoins tous les états publiés, leurs compteurs et les premières mesures rejouées. Pour un essai rapide distinct, `ECOLOGY_PILOT=1` ne produit qu’une répétition et ne peut pas être publié par l’agrégateur.

Empreinte SHA-256 des fichiers `src/sim/*.ts`, dans l’ordre alphabétique des noms puis de leur contenu : `6ab0fff30e5ffdbe0f29c468364c0088a568d24e61272a676b8fa1cd3677617e`. Runtime mesuré : Node 24.19.0, Linux x64. Les temps CPU varient entre exécutions ; les trajectoires biologiques sont reproductibles dans le même runtime. Le JSON comporte aussi l’empreinte du fichier brut d’entrée de l’agrégateur.

## Plan expérimental et interventions

Huit situations × douze terrains `ecology-e0` à `ecology-e11` = **96 trajectoires**, chacune de **36 000 ticks de 100 ms**, soit une heure simulée après conditionnement éventuel. Six génomes `ecology-g0` à `ecology-g5`, chacun sur deux terrains consécutifs ; même couple terrain/génome pour les huit situations. C’est un plan apparié, pas un croisement complet génome × terrain ni une estimation de significativité statistique.

| Situation | Conditions et interventions initiales |
| --- | --- |
| Favorable | Neuf graines, trois variétés ; eau 60 et minéraux 18 par zone ; lumière 1 ; apports eau 0,14 et minéraux 0,0015 par zone/s ; Luma présente et douze aliments historiques initiaux |
| Pauvre | Même placement et individu ; eau 0,5 et minéraux 0,02 par zone ; lumière 0,1 ; aucun apport ultérieur |
| Forte compétition | 36 graines dans une seule zone : grille 6 × 6, pas de 9 unités autour de (275,305) ; milieu favorable |
| 36 graines réparties | Même population, variétés et réserves introduites ; grille 6 × 6 de (60,60) à (540,620) ; contrôle de l’effet de concentration |
| Prélèvement supérieur au renouvellement | Une plante ambre en (300,340), minéraux 2,8 par zone, aucun apport minéral, aucun aliment initial ; Luma introduite seulement après production de deux fruits réels |
| Témoin du prélèvement | Jardin strictement identique au précédent, même conditionnement et mêmes deux fruits ; Luma reste hors du jardin |
| Sans créature | État favorable identique, seul `creaturePresent` devient faux ; aucun calcul corporel ou cognitif, aucun prélèvement par un agent |
| Sans plantes | Même individu et douze aliments initiaux, milieu favorable mais aucune graine ; contrôle sans renouvellement végétal |

Les appariements favorable/sans créature et prélèvement/témoin sont validés par égalité complète des états initiaux après neutralisation du seul indicateur de présence. Le conditionnement dure 155 s dans les 24 cas de prélèvement/témoin. Il fait évoluer réellement le sol et la plante, sans nourrir, déplacer ou entraîner l’individu conservé à l’extérieur. Ce temps ne fait pas partie de l’heure mesurée.

Aucune nourriture n’est ajoutée durant les mesures. Aucun levier ni objet n’est installé par ce protocole écologique ; leur compatibilité est vérifiée séparément par les tests d’intégration et les expériences instrumentales de régression. Les fruits restent soumis au plafond partagé de 48 aliments. Les plantes continuent après un décès, tandis que le corps mort ne continue pas sa digestion.

Les compteurs sont soustraits à leur valeur au début de l’heure. Les deux fruits du conditionnement expliquent donc que quatre fruits puissent être consommés pour seulement deux produits pendant l’observation. La disponibilité et le temps sans fruit sont intégrés à **chaque tick** ; stades, sol, états corporels et taille sérialisée sont relevés toutes les 30 s. Les stocks d’aliments initiaux sont distincts des fruits végétaux.

## Résultats mesurés

Toutes les valeurs de ce tableau sont des **moyennes par trajectoire d’une heure**, n = 12 par ligne. « Population » compte les plantes vivantes, graines incluses ; les cadavres sont comptés séparément par stade dans les données.

| Situation | Population finale | Germinations | Graines descendantes | Morts naturelles | Fruits produits | Fruits consommés | Fruits décomposés | Luma vivante à 1 h |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Favorable | 27,50 | 167,08 | 161,00 | 142,50 | 435,75 | 75,58 | 340,42 | 12/12 |
| Pauvre | 0 | 0 | 0 | 9 | 0 | 0 | 0 | 0/12 |
| Forte compétition | 0 | 36 | 0 | 36 | 0 | 0 | 0 | 0/12 |
| 36 graines réparties | 17,50 | 137,33 | 103,33 | 121,83 | 430,33 | 80,17 | 337,92 | 10/12 |
| Prélèvement > renouvellement | 0 | 0 | 0 | 1 | 2 | 4 | 0 | 0/12 |
| Témoin du prélèvement | 0,42 | 4,83 | 4,83 | 5,42 | 6,67 | 0 | 8,50 | Sans agent |
| Sans créature | 24,92 | 162,08 | 155,75 | 139,83 | 392,92 | 0 | 371,83 | Sans agent |
| Sans plantes | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0/12 |

Exemples d’effectifs totaux : les douze jardins sans créature produisent **4 715 fruits**, **1 869 graines descendantes**, **1 945 germinations** et **1 678 morts naturelles**. Les douze jardins favorables avec Luma enregistrent **907 consommations végétales** pour **5 229 fruits produits**. Les taux moyens par minute simulée sont publiés dans `aggregation.scenarios[].eventRatesPerSimulationMinute` ; ce sont des nombres d’événements divisés par le temps, pas des probabilités par plante à risque.

### Ressources et disponibilité

| Situation | Eau finale du sol | Minéraux finaux du sol | Fruits disponibles en moyenne temporelle | Fraction du temps sans fruit végétal |
| --- | ---: | ---: | ---: | ---: |
| Favorable | 1 366,86 | 421,47 | 18,85 | 3,30 % |
| Pauvre | 11,40 | 2,30 | 0 | 100 % |
| Forte compétition | 2 499,55 | 592,20 | 0 | 100 % |
| 36 graines réparties | 1 684,59 | 466,30 | 18,69 | 3,30 % |
| Prélèvement > renouvellement | 2 499,55 | 68,60 | 0,0084 | 99,16 % |
| Témoin du prélèvement | 2 473,24 | 69,32 | 0,4233 | 80,09 % |
| Sans créature | 1 404,14 | 460,60 | 19,10 | 3,30 % |
| Sans plantes | 2 499,55 | 585,00 | 0 | 100 % |

Il s’agit des sommes sur 25 zones, pas des stocks accessibles à une seule plante. Un sol peut finir très rempli **après** la mort des plantes qui ne prélèvent plus. Dans le scénario concentré, les zones non occupées ne partagent pas leur eau ou leurs minéraux avec la zone surchargée. On ne peut donc pas conclure à une abondance locale à partir du total final.

Sans agent, la population moyenne passe de 9 au départ à 36 à 600 s, puis 24,17 à 1 800 s et 24,92 à 3 600 s ; les fruits disponibles passent de 0 à 18 à 180 s, 33,42 à 600 s et 21,08 à la fin. Cette succession, avec naissances et morts, distingue une végétation autonome d’un décor ou d’un simple distributeur périodique.

### Prélèvement contrôlé et épuisement

Les deux jardins commencent avec les mêmes deux fruits et la même plante adulte. Moyennes n = 12 :

| Temps après introduction éventuelle | Produits depuis départ, avec Luma | Consommés avec Luma | Fruits au sol avec Luma | Fruits au sol sans Luma |
| --- | ---: | ---: | ---: | ---: |
| 30 s | 1 | 2 | 1 | 2 |
| 60 s | 1 | 3 | 0 | 2 |
| 90 s | 2 | 3,75 | 0,25 | 2 |
| 180 s | 2 | 4 | 0 | 0 |

À 60 s, la consommation dépasse la production nouvelle et a épuisé la réserve disponible. Sans consommation, les deux fruits limitent la nouvelle fructification, puis pourrissent normalement. À 180 s, le témoin a deux descendants en moyenne, contre zéro avec Luma : l’affectation des réserves entre fruits et graines et le retour minéral par décomposition diffèrent.

**Limite majeure :** les douze jardins prélevés et onze témoins sur douze s’éteignent à l’heure. La consommation modifie réellement disponibilité, exports et reproduction, mais cet essai ne prouve pas qu’elle est à elle seule la cause des extinctions. Le témoin, lui aussi privé d’apport minéral, est fragile. Aucun rééquilibrage n’est appliqué pour sauver l’un des groupes.

### Individus et survie

Les douze individus favorables restent vivants à une heure ; sans plantes, tous meurent entre 386,5 et 583,2 s dans cette cohorte. Dans le jardin à 36 graines réparties, deux meurent à 1 490,4 et 3 558,6 s. Dans le protocole de prélèvement, les décès se situent entre 305,6 et 395,1 s après introduction. Les relevés contiennent énergie, toxicité et santé ; le protocole ne classe pas rétrospectivement une cause unique de décès.

Ces comparaisons sont conditionnelles aux recettes, abondances, graines et durées choisies. Les trajectoires changent avec le génome et le terrain ; les deux facteurs ne sont pas entièrement croisés, donc leur variance propre n’est pas estimée. Aucune amélioration générale de survie ou préférence végétale innée n’est revendiquée.

## Bilans, bornes et performances

L’énergie stockée, l’eau et les minéraux sont suivis entre sol, litière, plante, fruit en formation et fruit détaché. Photosynthèse, apports, semis du joueur, respiration, évaporation, débordements et exports vers l’animal ont des termes explicites. Le résidu absolu maximal **échantillonné** sur la campagne est **1,46 × 10⁻⁸ unité**, sous la tolérance expérimentale de 10⁻⁴. Tous les états finaux passent la validation des identités, bornes, recettes et bilans. Cela ne constitue pas une conservation atomique des toxines ni un modèle complet des excréments.

Les limites sont 36 plantes incluant graines et cadavres, 25 zones, 48 aliments partagés ; un fruit payé reste dans son bourgeon si le monde est plein. La boucle écologique à 1 Hz est bornée par O(P² + P×F) pour la proximité et les fruits, avec P ≤ 36 et F ≤ 48. Le cerveau continue à 10 Hz. Aucun historique végétal croissant n’est conservé dans le jeu.

Micro-mesure sans rendu, sans observatoire et sans agent : même terrain, amorçage de 300 s, puis sept répétitions de 10 000 ticks par condition après échauffement. Les mesures sont prises hors de la boucle de sérialisation et d’échantillonnage de la campagne.

| Condition | Médiane pour 10 000 ticks | Minimum–maximum | État JSON final | Plantes vivantes finales |
| --- | ---: | ---: | ---: | ---: |
| Extension écologique, sans plantes | 12,83 ms | 9,60–13,38 ms | 5 105 caractères | 0 |
| Extension écologique, avec végétation | 27,01 ms | 26,06–32,18 ms | 17 534 caractères | 26 |

Le plus grand état sérialisé **échantillonné** dans les 96 trajectoires mesure **26 831 caractères**, pour une limite d’import de 100 000. Ce coût de stockage et les limites d’effectifs ne sont **pas** une mesure du tas JavaScript en mémoire. La micro-mesure Linux/Node n’inclut ni canvas, ni DOM, ni gestion thermique, ni navigateur Android physique. Elle indique un coût borné faible dans cet environnement, sans garantir un nombre d’images par seconde sur S25 Ultra.

## Vérifications et limites de portée

- **153 tests ordinaires réussis**, trois campagnes longues facultatives ignorées par défaut. Les tests historiques restent exécutés, notamment les résultats instrumentaux de l’étape 4.2.
- La campagne écologique facultative réussit et publie les 96 trajectoires. Une comparaison tick par tick sur 6 000 ticks conserve un état JSON identique avec l’observatoire activé ou suspendu.
- Tests ciblés : chaque ressource limitante isolée ; concurrence proportionnelle ; cycle complet sans agent ; extinction sans remplacement ; bornes sur une heure ; bilans ; blocage d’un bourgeon au plafond alimentaire ; sauvegarde avec population végétale et budget maximal d’évidence instrumentale simultanés ; ingestion ordinaire sans provenance cachée ; reprise au milieu d’une seconde ; captures et archives du laboratoire ; imports corrompus ; croissance après décès et absence de résurrection.
- Compilation TypeScript/Vite réussie avec chemins `/Artificial-life/`. Les workflows et dépendances restent inchangés.
- **46 tests navigateur réussis** : semis tactile, consultation, apports et retrait, absence de débordement horizontal en portrait, sauvegarde, laboratoire et croissance après décès. Le navigateur utilise une émulation Pixel 7 et un viewport ordinateur ; ce n’est pas un essai sur téléphone physique.

Le sol en grille provoque des frontières abruptes ; il n’existe ni diffusion, saisons, météo, pollinisation ni excrétion animale. Les fruits non végétaux gardent leur comportement historique sans péremption. Les trois plantes ont la même physiologie, mais le coût de leurs fruits dépend de leur recette : des disponibilités différentes peuvent donc émerger sans préférence cognitive programmée. Les descendants héritent de la variété, pas d’un génome végétal détaillé. La durée de vie et les flux sont des paramètres de prototype, pas des valeurs botaniques calibrées.

La capacité globale peut empêcher la reproduction même dans une zone favorable ; les morts visibles occupent une place pendant 45 s. Les corps animaux archivés ne participent pas aux bilans végétaux. Les profils inactifs et le temps hors ligne n’évoluent pas. Une future mémoire spatiale ou anticipation du renouvellement doit faire l’objet d’une étape cognitive explicite ; elle n’est pas introduite ici. Les apparitions végétales peuvent conserver les ambiguïtés perceptives instrumentales connues : le cerveau ne reçoit jamais `PlantFruit.plantId`.
