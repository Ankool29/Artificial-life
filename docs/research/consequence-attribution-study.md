# Étape 4.2 : attribution durable des conséquences

Date : **4 novembre 2026**. Référence : `ba5eac0ccf69ef0f421c6208da8e1dbaf3dede89`, intégration de la PR #8. Cette étude reprend les conditions de [l’enquête 4.1](hunger-dispenser-investigation.md). Le [guide accessible](../consequence-attribution.md) décrit l’utilisation et les changements.

## 1. Conclusion et périmètre

La nouvelle attribution conserve une preuve d’identité entre action, ressource et bolus au lieu de dépendre d’un épisode expirant avant le repas. Dans les trajectoires modernes, les conséquences négatives achevées issues de la machine rose sont correctement attribuées dans **170/170 cas espacés (100 %)** et **277/331 cas compacts (83,7 %)**, contre **85/196 (43,4 %)** et **10/370 (2,7 %)** avec l’ancien moteur.

Les fausses attributions observées restent à zéro dans ces trajectoires. Les contrôles volontairement ambigus montrent cependant une limite irréductible : une baie externe coïncidant avec une action peut encore entraîner une fausse association dans les deux moteurs. La nouvelle version n’utilise jamais le producteur physique pour lever cette incertitude.

Il ne s’agit pas d’une amélioration générale de la survie démontrée. Les tentatives à vide augmentent dans certaines conditions ; tous les individus des cohortes libres meurent avant une heure dans cet environnement fermé à ressources finies. Les biais de disposition, le nombre limité de terrains et l’identité perceptive idéale des ressources limitent la portée des résultats.

### Sources et intégrité

Les [mesures brutes et agrégats](attribution-results.json) contiennent les 624 trajectoires, les repas identifiés, les modèles finaux, les scores par faim, les expériences contrôlées et tous les temps du microbenchmark. Le [programme d’analyse](../../scripts/analyze-attribution.py) vérifie appariements, effectifs, parité biologique des expositions et témoins sans plasticité avant de produire ce fichier.

Empreinte SHA-256 du contenu ordonné de `src/sim/*.ts` (nom de fichier puis octets, ordre lexical) :

- Ancien : `9fcf5afcc7a366aec5627811422cb070c3a6bc4ed364bf2038e43dbddae333a3`.
- Nouveau : `c49abaad9d9116df9e733eff3af339b844b6eaaf4b5d89728af83fbd5a1bcaf8`.

Les trajectoires de référence et leurs expositions ont été mesurées le 3 novembre et conservées ; la campagne finale du nouveau moteur a été réexécutée le 4 novembre. Les deux microbenchmarks ont été mesurés successivement le 4 novembre dans le même environnement. Les données de référence ont été réutilisées sans modifier leurs résultats.

Les assertions de parité de l’observatoire et de la comparaison vide/recharge héritées du protocole 4.1 passent dans les quatre campagnes. Les répétitions du nouveau moteur ont reproduit les mêmes trajectoires ; les modifications ultérieures du codec et de la présentation n’ont pas changé les résultats comportementaux. Les empreintes publiées correspondent à la dernière exécution sur les sources livrées.

## 2. Changements ciblés du moteur

| Fonction / fichier | Changement et raison |
| --- | --- |
| [`newlyPerceivedResources`](../../src/sim/instrumental.ts) | Reconnaissance conservée pour les identités déjà perçues tant que la ressource existe ; une sortie puis une entrée en vision ne devient plus une nouvelle apparition. Le nettoyage utilise les identités pour libérer les références, jamais la provenance physique. |
| `observeResources`, `observeChange`, `resolveAttributions` dans le même fichier | Traitement groupé des apparitions d’un tick ; conservation des hypothèses compatibles avec les actions propres, dans la fenêtre et le voisinage existants. Propagation de contraintes d’exclusion, sans choix automatique de la machine la plus proche. |
| `updateEpisodes` | Les actions récentes ne sont conservées que pendant leur fenêtre d’observation de 50 ticks. Les traces de ressources sont indépendantes de ce tampon et suivent leur ressource. |
| `registerIngestion`, `reinforceInstrumental` | Copie de la preuve avec le bolus ; crédit indépendant de l’ancien épisode et du délai avant ingestion. Une attribution incertaine reste sans mise à jour de valeur. |
| `settleTerminalCredits`, [`step`](../../src/sim/world.ts) | À l’arrêt de vie, bilan instrumental partiel des seules absorptions déjà accumulées par chaque bolus inachevé. Pas de pénalité terminale, pas de mise à jour alimentaire partielle, pas de double comptage d’un bolus terminé. |
| [`instrumental-migration.ts`](../../src/sim/instrumental-migration.ts), [`instrumental-persistence.ts`](../../src/sim/instrumental-persistence.ts), [`persistence.ts`](../../src/sim/persistence.ts) | Import de l’ancienne extension, validation des identités et chronologies, protection des traces, budget d’évidence riche distinct du nombre biologique de bolus. |
| [`recorder.ts`](../../src/observatory/recorder.ts), [`ui/instrumental.ts`](../../src/ui/instrumental.ts) | Affichage des hypothèses réellement conservées, des attributions suspendues et des bilans partiels ; 24 lignes de chaînes visibles au maximum. |

Les équations de `metabolism.ts`, les gènes, `decideFood`/`decide`, les règles alimentaires et celles des objets sont inchangés. Les scores peuvent changer **parce que les valeurs instrumentales apprises changent**, ce qui constitue l’objectif de cette étape. Aucun tirage aléatoire n’est ajouté à la cognition.

### Séparer attente, identité et conséquence

L’ancien délai de crédit de 900 ticks ne décide plus de la durée de conservation d’un lien. Son nom exporté `CREDIT_WINDOW` est conservé par compatibilité, mais il borne désormais uniquement l’attention qui peut suspendre un nouvel essai en présence d’une ressource encore liée et visible. La fenêtre de recherche d’une apparition reste **50 ticks / 5 s**, la distance reste **40 unités**, et la constante d’éligibilité reste **300 ticks / 30 s**.

```text
Ancien : éligibilité = exp(−(fin_digestion − action)/300), expiration à 900 ticks
Nouveau : éligibilité = exp(−(apparition_observée − action)/300)
          puis transport de l’identité observée jusqu’au bilan du bolus
V ← clamp(V + learningRate × éligibilité × (bilan_réel − V), −2, 2)
```

Ce choix ne prétend pas supprimer toute incertitude temporelle. Il reconnaît qu’une ressource identifiée transporte la chaîne après son apparition ; attendre avant de la manger ou la digérer lentement n’en change pas l’identité. Une ancienne digestion sans date d’apparition reçoit une date **inconnue**, avec l’atténuation conservatrice correspondant à la fenêtre de 50 ticks, sans inventer un instant observé.

### Ambiguïtés : inférences autorisées et abstention

Chaque hypothèse ne contient que l’identifiant de l’action propre, sa cible perçue, sa situation et sa date. L’identifiant de cible est celui du levier actionné, **pas le champ `targetId` de l’événement physique de production**. Le cerveau reçoit les coordonnées, l’identité de la ressource et la date de perception. La véritable provenance n’intervient que dans les mesures scientifiques.

Le modèle suppose au plus une apparition attribuable par action. Exemple : actions en x = 260 et 300 ; ressource en x = 282 compatible avec les deux ; seconde ressource en x = 322 compatible seulement avec la seconde action. Cette seconde observation exclut une hypothèse de la première. L’attribution est identique dans les deux ordres d’énumération des ressources, malgré la première ressource plus proche du second levier.

Si les deux actions et les ressources sont indiscernables, les alternatives sont conservées et aucune valeur biologique n’est attribuée. Si deux ressources simultanées n’ont qu’une même action compatible, les deux sont marquées en conflit : la première dans la liste n’obtient pas arbitrairement le lien.

Le conflit se propage aux traces encore reliées et au tampon d’actions récentes : retirer une ressource contradictoire ne transforme pas une troisième ressource en attribution certaine. Une action non enregistrable sous pression mémoire laisse une courte fenêtre d’incertitude. La perte d’une alternative n’autorise donc pas à créditer arbitrairement une autre machine. Ces cas de saturation sont couverts par des tests ciblés, séparément de la cohorte naturelle.

L’indice diagnostique `1 / nombre d’hypothèses` décrit la répartition entre actions propres compatibles ; ce n’est ni une probabilité causale calibrée ni une garantie de provenance. Les causes extérieures non observées restent possibles. La contrainte d’une apparition par action devra être revue pour des objets produisant plusieurs ressources.

## 3. Campagne libre appariée

Chaque moteur exécute les **156 conditions de l’enquête 4.1**, avec apprentissage instrumental actif puis désactivé : **624 trajectoires**. Les 144 modernes croisent 12 graines génétiques `hunger-g00…11`, deux terrains `hunger-e00/e01`, deux dispositions et trois rotations des recettes. Les 12 références v1 sont séparées, leur génome étant historiquement couplé au terrain.

Disposition espacée : `(200,290)`, `(400,290)`, `(300,460)` ; compacte : `(260,325)`, `(300,325)`, `(340,325)`. Les recettes ambre/bleue/rose tournent entre les places. Les trois objets sont présents aux positions du protocole 4.1. Les 12 aliments initiaux restent présents, trois réserves de 12 sont installées au tick 0 ; aucune nourriture ni remplissage n’est ajouté dans la trajectoire libre. Horizon : 36 000 ticks ou décès.

Les conditions initiales sont identiques entre moteurs et témoins. Les rencontres ultérieures peuvent diverger à cause des apprentissages ; les dénominateurs ne sont donc pas supposés identiques. Les expositions de la section 4 isolent ce facteur.

### Attribution des repas achevés

Tableau principal : 72 trajectoires modernes par moteur et disposition, apprentissage actif. Un crédit correct exige l’identité du véritable producteur, obtenue uniquement par le diagnostic. Un bilan terminal partiel est exclu des repas achevés.

| Disposition | Moteur | Repas de machine achevés correctement attribués | Repas roses négatifs achevés correctement attribués | Faux crédits / tous les crédits, partiels inclus |
| --- | --- | ---: | ---: | ---: |
| Espacée | Ancien | 1 404/1 758 (79,9 %) | 85/196 (43,4 %) | 0/1 404 |
| Espacée | Nouveau | 1 757/1 757 (100 %) | 170/170 (100 %) | 0/1 773 |
| Compacte | Ancien | 633/1 757 (36,0 %) | 10/370 (2,7 %) | 0/633 |
| Compacte | Nouveau | 1 669/1 744 (95,7 %) | 277/331 (83,7 %) | 0/1 701 |

Les **75** repas compacts achevés restant sans crédit incluent **54** repas roses négatifs. L’abstention ne devient pas une attribution fausse pour améliorer artificiellement le taux. Zéro faux crédit observé ne signifie pas risque nul ; les repas d’une même trajectoire ne sont pas des essais statistiques indépendants.

Contrôles et génomes anciens :

| Groupe | Espacée, ancien → nouveau | Compacte, ancien → nouveau |
| --- | --- | --- |
| Modernes sans plasticité instrumentale, 72 par case | 115/225 → 225/225 | 15/386 → 325/387 |
| V1 avec plasticité, 6 par case | 7/16 → 17/17 | 0/19 → 12/15 |
| V1 sans plasticité, 6 par case | 15/27 → 27/27 | 0/20 → 15/19 |

Ces nombres portent sur les repas roses négatifs achevés. « Sans plasticité » fige P et V à zéro ; la perception, les compteurs, la reconnaissance, l’attention et l’apprentissage alimentaire continuent. Un crédit compté chez ce témoin est un lien diagnostiqué, **pas une association instrumentale acquise**. Aucun faux crédit n’est mesuré dans ces groupes non plus.

### Machines vides, consommation toxique et décès

| Mesure, 72 modernes avec apprentissage par case | Espacée, ancien → nouveau | Compacte, ancien → nouveau |
| --- | --- | --- |
| Pressions à réserve vide | 932 → 1 086 | 3 931 → 3 951 |
| Dont P ≤ 0,05 après observations | 187 → 258 | 2 710 → 2 773 |
| Baies roses ingérées, initiales incluses | 435 → 401 | 585 → 556 |
| Ingestions roses après association alimentaire déjà négative | 361 → 327 | 513 → 484 |
| Ingestions roses après valeur instrumentale déjà négative du producteur, au moins un contexte | 86 → 116 | 44 → 301 |
| Vie moyenne, secondes | 1 719,39 → 1 732,81 | 1 481,12 → 1 503,17 |
| Dernier dommage toxique / famine | 30/42 → 15/57 | 43/29 → 39/33 |
| Vivants à une heure | 0 → 0 | 0 → 0 |

La dernière mesure d’ingestion conditionnelle ne démontre pas une augmentation du risque par aversion : beaucoup plus de leviers ont maintenant reçu une valeur négative, changeant le groupe conditionné. Elle montre que l’aversion instrumentale ne constitue toujours pas une interdiction. Les témoins modernes du nouveau moteur consomment respectivement **455 et 598** baies roses, contre **401 et 556** avec plasticité.

Les tentatives à vide peuvent augmenter : une valeur positive plus forte continue à peser tant que P n’a pas suffisamment diminué, et le bonus de curiosité persiste. Le test historique à une machine retrouve **24/24** découvertes bénéfiques, mais après panne la sonde compte **2,50 tentatives** contre **2,375** auparavant ; **1/24** choisit encore `use` au premier choix contre 0 auparavant. Les tentatives diminuent toujours après panne par rapport à l’acquisition, sans extinction totale garantie. Le [nouveau relevé du protocole historique](instrumental-attribution-results.json) est séparé de son [archive originale](instrumental-results.json).

Le classement des décès décrit le dommage du **dernier tick**, pas une cause exclusive. La nourriture est finie et la faim peut succéder à des dommages toxiques. Les petites différences de durée moyenne, sans réplication indépendante et avec zéro survivant final, ne démontrent pas une amélioration générale de survie.

Le nouveau moteur émet **16 bilans partiels attribués en espacé** et **32 en compact** chez les modernes avec apprentissage. Ce sont des bilans de bolus, pas des nombres de décès : plusieurs bolus peuvent être interrompus ensemble, et certains bilans peuvent être positifs. Ils n’améliorent pas les décisions d’un individu déjà mort. Les tests vérifient le signe distinct d’un bolus bénéfique et d’un bolus toxique interrompus ensemble, et l’absence de double bilan pour un bolus achevé au tick fatal.

## 4. Expositions identiques et acquisition

Pour chaque moteur : 12 génomes × deux recettes × deux délais × apprentissage actif/inactif = **96 essais**, six expositions chacun. Total : **1 152 repas prescrits**, distincts des vies autonomes. Les gestes, la dose et l’ingestion sont imposés par le protocole pour isoler le crédit ; ils ne sont pas une démonstration de découverte autonome.

Même signal visuel `amber` dans les deux conditions : dose nutritive 28 nutriments/0 toxine et dose toxique 5 nutriments/10 toxines, masse 10. Corps réinitialisé avant chaque exposition ; énergie maintenue à 50 pendant l’attente, puis énergie 20/santé 100/toxines 0 avant ingestion. Les débuts d’exposition sont espacés d’au moins 120 ticks pour laisser la recharge physique. Associations conservées. La digestion reste réelle, sans modification d’équation.

Les empreintes du métabolisme et les états RNG sont **identiques ancien/nouveau pour chacune des 576 paires d’expositions**. Les récompenses alimentaires sont identiques. Les témoins gardent V = P = 0, tout en conservant l’apprentissage alimentaire.

| Dose, délai avant ingestion | Crédits anciens → nouveaux, apprentissage actif | V moyen après expérience 1, ancien → nouveau | V moyen après expérience 6, ancien → nouveau |
| --- | ---: | ---: | ---: |
| Nutritive, 0 s | 72 → 72 | +0,3230 → +0,3781 | +0,8919 → +0,9302 |
| Toxique, 0 s | 72 → 72 | −0,3979 → −0,4660 | −1,1070 → −1,1565 |
| Nutritive, 120 s | 0 → 72 | 0 → +0,3781 | 0 → +0,9302 |
| Toxique, 120 s | 0 → 72 | 0 → −0,4660 | 0 → −1,1565 |

Le premier crédit immédiat arrive dans les deux moteurs à une médiane de **55 ticks après l’action**, soit 5,5 s. Avec deux minutes d’attente, le nouveau l’émet à **1 255 ticks**, l’ancien n’en émet aucun. Le nouveau moteur n’accélère donc pas la digestion ; il conserve sa chaîne et applique une éligibilité plus forte.

La diversité physiologique reste visible. Avec la même dose toxique après 120 s, `g02` reçoit un bilan **−0,000426** et atteint V **−0,000399** après six repas ; `g04` reçoit un bilan borné **−2** et atteint V **−1,646467**. Aucun signal de catégorie n’impose ces différences. Les génomes complets et les courbes individuelles figurent dans les données ; les treize coefficients et les histoires libres peuvent contribuer aux différences, pas seulement la sensibilité aux toxines.

## 5. Faux positifs et situations volontairement ambiguës

Chaque situation est exécutée dans les deux ordres d’énumération des aliments, pour chaque moteur : **16 essais contrôlés**. Le producteur vrai est enregistré par l’expérimentateur et jamais communiqué au cerveau.

| Situation | Ancien : crédits corrects / faux dans les deux ordres | Nouveau : crédits corrects / faux dans les deux ordres |
| --- | --- | --- |
| Deux actions voisines, seconde apparition excluant une alternative | 1/0 puis 2/0 | 2/0 puis 2/0 |
| Deux leviers au même endroit, deux apparitions indiscernables | 0/0 puis 0/0 | 0/0 puis 0/0 |
| Une action, une sortie et une baie externe au même tick | 0/1 puis 1/0 | 0/0 puis 0/0 |
| Levier vide, seule baie externe coïncidente | 0/1 puis 0/1 | 0/1 puis 0/1 |

La dernière ligne est importante : observations d’action et de nourriture identiques à une production, provenance physique différente. Aucun algorithme limité à ces observations ne peut garantir de les distinguer. Le nouveau mécanisme n’affirme pas de certitude causale et ne résout pas ce cas en consultant le stock ou l’identité cachée du producteur. Une investigation future pourrait étudier apprentissage statistique, interventions et hypothèse de cause externe ; ce n’est pas implémenté ici.

## 6. Mémoire, calcul et compatibilité

Les tableaux instrumentaux sont bornés : 12 épisodes, 16 mémoires, 48 traces de ressources, 48 traces riches en digestion, quatre hypothèses par trace. Les entrées de digestion sans preuve suivent les bolus sans bloquer la biologie. Les épisodes récents peuvent être évincés sans détruire les snapshots. Les mémoires référencées sont protégées ; à saturation, la nouvelle attribution est abandonnée explicitement plutôt que de supprimer une alternative pour fabriquer un choix.

Dans les vies modernes avec apprentissage, le maximum observé passe de 3 à **11 liens** espacés, et de 3 à **24** compacts. Le maximum de bolus atteint **5** : l’ancienne restriction du codec à quatre n’était pas une borne physiologique. Le nouveau validateur accepte les superpositions sous la limite globale inchangée de 100 000 caractères et vérifie la masse totale. Un test et un essai navigateur couvrent le cas de cinq ; un test de saturation conserve 48 traces riches, accepte un bolus supplémentaire sans preuve et n’empêche pas son ingestion.

| Mesure | Ancien | Nouveau |
| --- | ---: | ---: |
| Charge synthétique sérialisée, caractères ASCII | 11 400 | 46 220 |
| Configuration synthétique | 24 liens, 4 bolus, 12 épisodes, 16 mémoires | 48 liens, 48 bolus, 384 hypothèses, 12 épisodes, 16 mémoires |
| Plus grande sauvegarde échantillonnée en vie moderne espacée / compacte avec apprentissage | 7 860 / 9 286 | 9 914 / 13 833 |
| Microbenchmark médian pour 5 000 ticks sans observatoire, n = 9 | 16,87 ms | 22,83 ms |
| Minimum / maximum des neuf mesures | 12,84 / 21,08 ms | 17,52 / 33,53 ms |

Le microbenchmark utilise `g00/e00/espacée/r0`, un processus neuf en mode `timing-only` pour chaque moteur, une répétition de chauffe puis neuf répétitions, sous Node 24.19.0 / Linux x64. La médiane augmente d’environ **35 %** sur ce relevé, avec une forte variabilité JIT/ordonnancement ; les trajectoires peuvent diverger, ce n’est pas une comparaison instruction par instruction. La valeur absolue nouvelle est d’environ **0,0046 ms/tick**. Les calculs de contraintes ne sont déclenchés qu’aux apparitions, pas à chaque tick. Les nombres sérialisés ne mesurent pas le tas JavaScript réel ; la charge synthétique est un scénario de budget, pas une borne absolue du corps biologique.

**Aucun benchmark matériel Android n’a été effectué.** Les **133 tests ordinaires** passent ; les deux campagnes longues nécessitent leurs variables explicites. Les **38 tests navigateur réussis** couvrent portrait Android émulé et bureau, import/export, profils, ambiguïtés, repas superposés et observatoire. Ils ne garantissent pas un débit d’images sur le S25 Ultra. La documentation et les jeux de données ne sont pas chargés par le jeu.

Migration : l’extension instrumentale v1 est acceptée puis convertie en v2, avec les coefficients génétiques, P/V, compteurs, corps et RNG conservés. Les références déjà perdues ne sont pas inventées. Les anciennes sauvegardes sans extension restent sur leur chemin habituel. Deux fixtures authentiques, capturées avec l’ancien moteur pendant attente et digestion, vérifient reprise, laboratoire et continuité déterministe. Les sauvegardes v2 ne sont pas rétrocompatibles avec l’ancien exécutable v1 ; la compatibilité promise est le chargement des anciennes sauvegardes par le nouveau jeu.

## 7. Reproduire et examiner les données

Prérequis : Node 24, dépendances du dépôt (`npm ci`), Python 3 standard. Depuis la racine de cette branche :

```bash
mkdir -p /tmp/luma-attribution-study
git worktree add --detach /tmp/luma-attribution-baseline ba5eac0ccf69ef0f421c6208da8e1dbaf3dede89
ln -s "$PWD/node_modules" /tmp/luma-attribution-baseline/node_modules

RUN_ATTRIBUTION_STUDY=1 ENGINE_LABEL=baseline-v1 LUMA_ENGINE_ROOT=/tmp/luma-attribution-baseline LUMA_STUDY_OUT=/tmp/luma-attribution-study/old-learning.json npx vitest run tests/attribution-study.test.mjs
RUN_ATTRIBUTION_STUDY=1 ENGINE_LABEL=identity-v2 LUMA_STUDY_OUT=/tmp/luma-attribution-study/new-learning.json npx vitest run tests/attribution-study.test.mjs
RUN_ATTRIBUTION_STUDY=1 ENGINE_LABEL=baseline-v1 LUMA_ENGINE_ROOT=/tmp/luma-attribution-baseline INSTRUMENTAL_LEARNING=0 LUMA_STUDY_OUT=/tmp/luma-attribution-study/old-control.json npx vitest run tests/attribution-study.test.mjs
RUN_ATTRIBUTION_STUDY=1 ENGINE_LABEL=identity-v2 INSTRUMENTAL_LEARNING=0 LUMA_STUDY_OUT=/tmp/luma-attribution-study/new-control.json npx vitest run tests/attribution-study.test.mjs

RUN_ATTRIBUTION_CONTROLS=1 ENGINE_LABEL=baseline-v1 LUMA_ENGINE_ROOT=/tmp/luma-attribution-baseline LUMA_CONTROLS_OUT=/tmp/luma-attribution-study/old-exposures.json npx vitest run tests/attribution-controls.test.mjs
RUN_ATTRIBUTION_CONTROLS=1 ENGINE_LABEL=identity-v2 LUMA_CONTROLS_OUT=/tmp/luma-attribution-study/new-exposures.json npx vitest run tests/attribution-controls.test.mjs
RUN_ATTRIBUTION_CONTROLS=1 ATTRIBUTION_TIMING_ONLY=1 ENGINE_LABEL=baseline-v1 LUMA_ENGINE_ROOT=/tmp/luma-attribution-baseline LUMA_CONTROLS_OUT=/tmp/luma-attribution-study/old-timing.json npx vitest run tests/attribution-controls.test.mjs
RUN_ATTRIBUTION_CONTROLS=1 ATTRIBUTION_TIMING_ONLY=1 ENGINE_LABEL=identity-v2 LUMA_CONTROLS_OUT=/tmp/luma-attribution-study/new-timing.json npx vitest run tests/attribution-controls.test.mjs
python3 scripts/analyze-attribution.py
```

Exécuter les deux campagnes `timing-only` **successivement et sans autres tâches lourdes** pour les temps de calcul. Le programme d’analyse retient alors leurs neuf mesures complètes, sans sélectionner le meilleur relevé ; les expositions n’ont pas besoin d’être rejouées pour mesurer seulement le calcul. Leurs durées varieront selon la machine. Les mesures comportementales sont déterministes pour ces sources et cet environnement JavaScript, sans garantie bit à bit entre tous les moteurs JavaScript.

`tests/attribution-study.test.mjs` reprend également les sondes faim/remplissage de 4.1 dans les sorties intermédiaires sous `/tmp`. L’annexe publiée de 4.2 retient les données correspondant aux sept critères de validation : trajectoires, repas, associations, scores par faim, expositions, ambiguïtés et coûts ; elle ne duplique pas ces sondes auxiliaires dans le JSON. Les fichiers complets peuvent être reconstruits par les commandes ci-dessus.

Le schéma de recherche est décrit par `columns` dans le JSON : les repas, hypothèses, transitions, états périodiques et modèles finaux utilisent des tuples pour éviter de répéter les noms de colonnes. Les champs `source` et `creditTarget` permettent de vérifier chaque attribution. `source: null` désigne un aliment initial ou extérieur. `completedNegative` est mesuré avant arrondi ; les bilans partiels portent le libellé `terminal-partial`. Les données des vies libres sont arrondies après exécution à dix décimales ; les calculs du moteur ne le sont pas. Les 30 premières transitions de chaque vie sont détaillées ; les compteurs et tous les repas ingérés sont conservés. Ce n’est pas un journal de chaque tick.

Les deux grosses campagnes sont désactivées dans `npm test` sans leurs variables explicites. La suite ordinaire exécute les unités/intégrations, le protocole historique à 96 cas et un contrôle d’intégrité des résultats publiés. Les tests navigateur restent dans le workflow CI existant ; aucun workflow n’a été remplacé.

## 8. Limites et suites possibles

- La cohorte naturelle utilise seulement deux terrains et deux dispositions. Les différences de consommation ne doivent pas être généralisées à tous les individus ou terrariums.
- Les états initiaux sont appariés ; après apprentissage, expositions et positions divergent. Les comparaisons conditionnelles « après aversion » changent de dénominateur. Les expositions prescrites isolent le crédit mais n’établissent pas une stratégie autonome optimale.
- La reconnaissance utilise les identités d’objets fournies par le prototype, sans pixels ni occlusion. La proximité spatio-temporelle ne prouve pas une production, comme le montre le contrôle de coïncidence.
- Certaines ambiguïtés restent sans crédit, volontairement. Leur taux ne doit pas être « corrigé » par le producteur caché ou une préférence par couleur.
- Une conséquence terminale mémorisée ne change pas l’avenir d’une créature morte ; l’apprentissage alimentaire partiel n’est pas introduit. Les conséquences réellement vécues peuvent être petites près de la mort à cause du bornage de santé, sans pénalité artificielle compensatrice.
- La mémoire durable augmente le coût et peut augmenter les tentatives à vide. Les prochains travaux éventuels devront séparer valeur biologique, disponibilité et exploration, avec des témoins dédiés plutôt qu’une règle de rejet définitif.
- Il reste à mesurer tas, temps de frame et sauvegardes sur Android physique. Les budgets de traces, l’interface facultative et les tests portrait limitent le risque sans remplacer cette mesure.

Les recommandations de l’enquête 4.1 concernant l’urgence alimentaire, l’exploration des aliments et l’arbitrage général ne sont pas implémentées par cette étape.
