# Étape 5.1 — expériences d’observation écologique et de mortalité

## Ce que démontre cette campagne

L’observatoire distingue une absence de fruits d’une disparition végétale et enregistre les contributions réellement appliquées aux pertes de santé. **48 essais appariés** ne montrent aucune divergence comportementale ou aléatoire entre capture active et inactive. Les **96 trajectoires de l’étape 5** sont également rejouées : états initiaux, finaux et 121 relevés par trajectoire identiques aux données précédemment publiées.

Les cas contrôlés reproduisent des décès avec nourriture hors du rayon, avec nourriture visible insuffisamment nutritive et avec nourriture au contact mais absorption toxique. Un essai ordinaire en milieu renouvelable montre aussi un décès avec 14 aliments encore présents. Cela réfute l’équivalence « nourriture présente = survie possible garantie », sans démontrer une cause pour les trois parties du joueur dont nous n’avons pas les traces.

Aucune règle biologique, écologique ou cognitive n’est changée pour obtenir ces résultats. La capture ne produit pas de nourriture, ne protège pas une variété et ne modifie ni préférences, ni seuils, ni hasard.

## Références et reproduction

Base : `b91d73c8069a4eaf9172147f57fe6fd4772974b4`. Contrat et limites : [ecological-observatory.md](../ecological-observatory.md).

- `src/sim/ecology.ts:updateEcology` : événements physiques et facteurs de perte de santé avant effacement des réserves d’une plante morte.
- `src/sim/metabolism.ts:metabolize` : doses réellement absorbées et pertes de santé après bornage.
- `src/sim/world.ts:step` : décision, exécution, ingestion, arrêt et callbacks facultatifs.
- `src/observatory/ecological.ts` : `availability`, `ecologicalSample`, `EcologicalObservatory.step`, `makeReport`, `exportReports`, `restoreReports`.
- `src/experiments/ecological-observatory.ts` : `prepareDiagnosticScenario`, `runDiagnosticScenario`, `diagnosticBenchmark`.
- `tests/ecological-observatory-science.test.mjs` : campagne, contrôles et rejeu historique.
- `scripts/measure-ecological-memory.sh`, `ecological-memory-probe.mjs`, `build-ecological-memory-probe.mjs` : mesure du tas dans des processus Node neufs.
- `scripts/analyze-ecological-observatory.py` : vérification des appariements et agrégation.
- [ecological-observatory-results.json](ecological-observatory-results.json) : états initiaux et finaux complets, 1 968 relevés, 25 rapports de décès, compteurs par variété, exemples d’événements, parité, temps bruts et mesures mémoire brutes.

```sh
npm ci
RUN_ECOLOGICAL_DIAGNOSTICS=1 npx vitest run tests/ecological-observatory-science.test.mjs
bash scripts/measure-ecological-memory.sh
python3 scripts/analyze-ecological-observatory.py
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- --workers=2
```

Le mode `DIAGNOSTIC_PILOT=1`, utile pour un essai rapide, est refusé par l’agrégateur de publication. Les campagnes longues restent facultatives ; les tests ordinaires valident néanmoins les données publiées, leurs compteurs, rapports et états de départ.

Runtime : Node 24.19.0, Linux x64. Empreinte SHA-256 de `src/sim/*.ts` puis `src/observatory/*.ts`, noms triés, chemin et contenu inclus : `05bc268bfed25bfaded9b1ec63baf8f5e764fb0e7b0db85f2b4677cf3a4c3dc8`. Les fichiers bruts d’entrée et de mémoire ont leurs empreintes dans le JSON publié. Les scripts et paramètres sont versionnés ; les temps CPU/GC restent variables entre exécutions.

## Conditions initiales et contrôles

Huit situations sur six couples `diagnostic-e0/g0` à `diagnostic-e5/g5`. Chaque monde observé possède une copie initiale strictement identique sans observatoire. Ce n’est pas un croisement complet terrain × génome ; aucun test de significativité ou effet génétique isolé n’est revendiqué.

| Situation | Paramètres initiaux explicitement contrôlés | Durée mesurée |
| --- | --- | ---: |
| Extinction sans créature | Neuf graines, eau 0,5 et minéraux 0,02 par zone ; lumière 0,1 ; apports nuls ; aucun agent actif | 1 200 s |
| Extinction avec consommation | Une plante ambre, minéraux 2,8 par zone sans apport ; aucun aliment initial ; conditionnement réel jusqu’à deux fruits, puis introduction de Luma | 1 200 s après introduction |
| Témoin sans consommation | Exactement le jardin précédent, mais l’individu reste hors du jardin | 1 200 s après conditionnement |
| Nourriture abondante et éloignée | 48 aliments ambre près de (25,25), aucun végétal ; **énergie initiale 0, santé 0,4** | 600 s de monde |
| Visible mais très peu nutritive | 48 aliments de signal bleu à 30 unités du centre ; **masse 36, nutriments 0,02, toxines 0 ; énergie initiale 2, santé 1** | 600 s de monde |
| Témoin nutritif | Même état précédent, seul le contenu nutritif devient **28** | 600 s de monde |
| Décès avec nourriture au contact | Douze corails au centre, douze ambres éloignés ; **énergie initiale 15, santé 0,4** | 600 s de monde |
| Ressources renouvelables ordinaires | Neuf graines et douze aliments historiques, sol et apports ordinaires, **corps initial normal : énergie 52, santé 100** | 3 600 s |

Les paramètres en gras sont des manipulations expérimentales de l’état initial ou de la composition physique des aliments, **pas des changements d’équations ni de décisions**. Les expériences de crise ne représentent donc pas la durée de vie normale d’une créature née en pleine santé. Le contrôle nutritif partage exactement corps, génome, positions, signaux, masses et hasard ; seule la dose physique nutritive diffère, jamais divulguée au cerveau.

Le conditionnement des deux expériences de consommation dure 155 s ; l’individu y reste hors du jardin, sans digestion ni apprentissage. Les deux fruits déjà présents sont distingués de la production ultérieure. Les appariements consommation/témoin et peu nutritif/nutritif sont contrôlés par égalité des états initiaux après neutralisation de la seule intervention prévue.

Les essais alimentaires sans plantes activent une extension écologique vide : le monde continue après la mort, sans faire évoluer le corps mort. Aucun aliment n’est ajouté pendant les mesures. Une personne hors du jardin n’est jamais comptée comme un survivant : son corps archivé reste inchangé et les mesures corporelles des lignes correspondantes sont `null`.

## Parité et déterminisme

Sur les 48 paires, **576 000 comparaisons tick par tick** contrôlent état corporel, besoins, mémoires, actions, positions et états des deux RNG. L’état JSON complet est comparé à **5 760 points de contrôle**, puis en fin d’essai ; les empreintes des transcriptions comportementales sont identiques dans chaque paire. Une empreinte n’est pas employée à la place de la comparaison des chaînes : l’égalité est vérifiée avant son calcul.

Les tests unitaires contrôlent séparément le **JSON complet à chaque tick** dans cinq situations (classique, végétation, absence, machines/objets, toxicité), y compris capture suspendue/reprise et composition avec l’observatoire d’apprentissage. Un autre test compare les traces de décisions complètes réellement émises.

Les 96 relectures historiques comparent états initiaux et finaux complets et tous les relevés de l’étape 5. Elles ne prouvent pas l’équivalence pour tous les états possibles, mais fournissent une référence indépendante antérieure à l’instrumentation, en plus des appariements du nouveau code.

## Résultats chiffrés

Chaque ligne comprend six essais. Les temps de décès sont relatifs au début de la mesure, pas au conditionnement. « Contact compatible » combine distance ≤ 9 et capacité stomacale suffisante au dernier état ; ce n’est pas une prédiction d’ingestion.

| Situation | Agents vivants en fin d’essai | Temps de décès observés | Aliments présents au décès | Dans le rayon au décès | Contact compatible |
| --- | ---: | --- | --- | --- | --- |
| Extinction sans créature | Sans agent | — | — | — | — |
| Extinction avec consommation | 0/6 | 281,0–417,7 s | 0 | 0 | 0 |
| Témoin sans consommation | Sans agent | — | — | — | — |
| Abondante mais éloignée | 0/6 | 0,3 s | 48 | 0 | 0 |
| Visible, peu nutritive | 0/6 | 3,0–4,0 s | 47 | 47 | 0 |
| Témoin nutritif | 6/6 à 600 s | — | — | — | — |
| Absorption toxique avec aliments au contact | 0/6 | 0,1–0,4 s | 23 | 11 | 11 |
| Ressources renouvelables ordinaires | 5/6 à 3 600 s | Un décès à 1 295,0 s | 14 | 13 | 0 |

### Extinctions végétales

Sans créature, les **54 graines** meurent, soit 18 de chaque variété ; aucune germination, reproduction ou fructification. Le facteur enregistré à chacune de ces morts est **dormance expirée**. La faible lumière est inférieure au seuil de germination du moteur ; l’eau et les minéraux sont également pauvres. On peut expliquer la non-germination et la perte de viabilité dans ces conditions, mais cet essai multifactoriel n’isole pas un effet propre de chaque ressource.

Avec consommation, les six plantes ambre initiales produisent **12 fruits nouveaux** ; Luma consomme **24 fruits**, incluant les douze présents au départ des six essais. Aucun descendant n’est observé et les six parents meurent avec **longévité dépassée** active. Il serait faux de présenter ces morts comme six dégâts directs infligés par Luma.

Les témoins sans consommation produisent **26 fruits nouveaux** et **21 descendants**, avec **21 morts naturelles**. Au dernier instant, ils conservent en moyenne une plante vivante par jardin. Leurs morts présentent parfois plusieurs facteurs simultanés : 16 avec déficit d’eau, 5 avec épuisement énergétique et 9 avec longévité dépassée, pour 21 morts. La somme de ces facteurs n’est pas une partition des causes.

La consommation change disponibilité, exports de ressources et remplacement végétal. Les données n’autorisent pas à attribuer toute extinction à la seule prédation : les conditions initiales sont fragiles et certains témoins s’effondrent aussi. Le moteur traite les fruits avant la reproduction ; leur coût et le retrait de leurs minéraux peuvent limiter le renouvellement. C’est un mécanisme à examiner avec les réserves et ressources locales, pas une nouvelle règle introduite ici.

### Nourriture visible et absorption

Les six essais très peu nutritifs consomment chacun un aliment avant de mourir. Leur dose absorbée cumulée n’est que **0,02185 nutriment** pour les six individus, donnant **0,01775 énergie réellement gagnée** ; les 47 aliments restants sont encore visibles, mais aucun n’est au contact avec place stomacale au dernier instant. Le contrôle nutritif, identique sauf sa chimie, garde six individus vivants à 600 s et totalise **2 100,06 énergie gagnée**. Ces résultats portent sur une crise initiale volontairement sévère, pas sur un risque général des baies bleues historiques, dont la recette normale n’est pas modifiée.

Dans le protocole toxique, les six individus ingèrent chacun un corail ; les pertes de santé par absorption totalisent **2,4**, égales aux six réserves initiales de santé 0,4, sans perte liée au déficit énergétique. Onze autres aliments sont encore au contact compatible. Leur présence ne supprime pas une conséquence biologique déjà en cours de digestion.

### Exemple ordinaire : mort à 1 295 s avec quatorze aliments

Couple `diagnostic-e4/g4`, corps initial normal et jardin ordinaire. Faits conservés dans le rapport :

- 14 aliments physiques au décès, **tous corail** ; 13 dans le rayon sensoriel. Treize sont des fruits végétaux, un autre aliment historique persiste.
- Santé finale 0, énergie 0, estomac 0, toxines résiduelles 0. Le dernier tick applique une perte de santé de **0,04801 par déficit énergétique**, sans nouvelle perte toxique à cet instant.
- Les 180 relevés récents, de 1 116 à 1 295 s, enregistrent **58,424 dégâts toxiques antérieurs**, **16,368 pertes par déficit énergétique**, **4,004 récupération**, et **66,827 énergie dépensée**.
- Chaque relevé inclut les flux de l’intervalle qui le précède ; la première date de relevé n’est donc pas la borne initiale exacte de tous les flux additionnés. Dans ces intervalles : 28 nutriments ambre, 15 bleus et 10 corail absorbés ; gains réels respectifs **21,250**, **11,384** et **7,589 énergie**. L’apport total, environ 40,224, est inférieur aux dépenses enregistrées.
- Dernière décision capturée au tick 12 945 : faim 1, politique alimentaire `scored`, branche **`wander`**, douze observations alimentaires, toutes corail. Les scores alimentaires réellement calculés vont de **−0,34091 à −0,14773** ; la valeur associative utilisée est **−1,37703** après quatre repas corail achevés.
- Aucun candidat alimentaire ne dépasse le seuil interne de sélection initialisé à zéro dans `decisions.ts:decideFood`. La clause d’urgence nécessite qu’un aliment ait été sélectionné ; elle ne s’applique donc pas ici. Le score de repos vaut **0,47090** ; les conditions de maintien au repos ne sont pas remplies et la branche finale choisit une destination d’exploration. **Aucun score d’exploration n’est inventé.**

Cet exemple montre une chaîne vérifiable : conséquences toxiques passées, aversion enregistrée, choix d’exploration face aux seuls aliments à score négatif, dépenses supérieures aux apports récents, puis arrêt par santé nulle après déficit énergétique. Il ne prouve pas qu’une autre décision aurait garanti la survie ; manger ces aliments aurait aussi exposé l’individu à la toxicité. Aucun comportement n’est corrigé pour rendre ce scénario plus favorable.

## Que peut-on dire des disparitions et dominations de variétés ?

Le code actuel n’a pas de règle de préférence végétale innée pour le bleu. Les descendants héritent de leur variété et se dispersent localement ; les conditions locales, l’ordre temporel des maturités, les longévités, la concurrence et le plafond global peuvent changer les populations. Les trois physiologies végétales sont identiques, mais les coûts énergétiques des recettes diffèrent : ambre 33, bleu 20, corail 18 par fruit, avec le même coût minéral. La consommation et la décomposition redistribuent également les stocks. Les positions fondatrices ne constituent pas un plan entièrement randomisé par variété ; elles peuvent participer aux différences observées.

Ces éléments sont des **mécanismes possibles présents dans le code**, pas une explication certaine des trois parties du joueur. Pour une nouvelle partie, confronter les courbes de plantes — graines incluses — aux descendants, morts, facteurs enregistrés et cartes locales. Une extinction vraie interdit une réapparition autonome de la variété dans ce modèle sans graines restantes ou intervention du joueur ; un simple manque de fruits ne l’interdit pas.

La campagne ne sélectionne pas des graines pour forcer une monoculture bleue. Aucun changement d’équilibre n’est proposé à partir de ces seules observations.

## CPU, mémoire et bornes

Mesure CPU sans rendu ni DOM : même jardin et génome, 100 s d’amorçage, une répétition de chauffe puis sept répétitions de 10 000 ticks par condition.

| Capture | Médiane / 10 000 ticks | Minimum–maximum |
| --- | ---: | ---: |
| Désactivée | 57,80 ms | 48,53–71,34 ms |
| Activée | 205,82 ms | 165,91–253,63 ms |

Soit environ **0,0206 ms par tick observé** dans ce microbenchmark Node, contre 0,0058 sans capture. L’overhead existe ; la passivité concerne l’état de simulation, pas un coût de calcul nul. Ces mesures n’incluent pas le rendu des graphiques, le navigateur Android, la chauffe ou la batterie.

La mesure du tas utilise **14 processus Node neufs**, deux simulations de chauffe par processus puis trois GC majeurs avant et après la conservation d’un monde et de son observatoire après une heure simulée. Les deltas retenus sont mesurés dans le processus lui-même, pas estimés depuis le JSON :

| Capture | Médiane du delta de tas retenu | Minimum–maximum |
| --- | ---: | ---: |
| Désactivée | 57 472 octets | -41 064–59 048 |
| Activée | 1 180 176 octets | 1 178 768–1 189 800 |

Un delta négatif dans une répétition sans capture reflète les libérations et la variabilité du GC/JIT dans le processus ; il ne représente pas une quantité négative de mémoire du monde.

La différence des médianes est environ **1,07 Mio** pour ce scénario et ce runtime. Ce n’est pas une borne universelle du tas, ni une mesure de RSS ou d’Android. Les tailles de session sérialisée sont publiées séparément : pic échantillonné de **1 021 586 caractères** dans les essais, et rapport maximal observé de **96 898 caractères**, sous la limite de 120 000. La session sérialisée ne comprend pas tout le contexte privé ; le relevé de tas, lui, conserve monde et observatoire.

Les limites de capacité sont testées, y compris perte d’anciens détails et réduction explicite du rapport. Les totaux d’absorption antérieurs à la réduction sont conservés ; la courbe réduite n’est pas présentée comme une liste exhaustive de tous les intervalles.

## Validation et limites restantes

**173 tests ordinaires réussis**, quatre campagnes longues facultatives exclues par défaut ; compilation TypeScript/Vite réussie ; **54 tests navigateur réussis** (portrait Android émulé et ordinateur).

Les vérifications automatisées couvrent parité, déterminisme, compteurs, doses absorbées et saturation, multiples contributions métaboliques, extinction réelle, observatoire suspendu, rapport chargé sans passé, empreinte du monde, validation des données locales, archives du laboratoire, inspections répétées, compression et budgets.

Les tests navigateur couvrent l’ouverture facultative, les graphiques réellement dimensionnés, la carte, le portrait sans débordement horizontal, capture suspendue/reprise, avances du laboratoire, export scientifique, décès avec nourriture présente, rechargement du rapport et absence de reconstruction d’une vieille mort. Les tests historiques et la compilation restent exécutés. Les aperçus portrait sont fournis dans `docs/previews/`.

Les limites principales sont les historiques bornés et leurs lacunes explicites, les petits effectifs, le couplage terrain/génome, des états de crise volontairement extrêmes, l’absence de traces pour les parties signalées et l’absence de mesures sur téléphone physique. Une simple présence dans le rayon n’est pas nécessairement une observation faite au même instant par la décision. La durée de trajet indiquée ne prouve pas l’accessibilité réelle à temps. Le critère de décès reste la santé nulle ; les contributions enregistrées ne sont pas une expertise causale omnisciente.
