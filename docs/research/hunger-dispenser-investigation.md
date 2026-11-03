# Faim, préférences et distributrices : enquête sur Luma

Date : **3 novembre 2026**. Version étudiée : [`ee8cb0f`](https://github.com/Ankool29/Artificial-life/tree/ee8cb0fba529ae950cbf3ef6f98ba42002a59731), après l’intégration de l’étape 4. Cette contribution contient uniquement de la documentation. Les règles, interfaces, tests, formats de sauvegarde et profils du laboratoire restent ceux de ce commit.

## Résultat principal

L’hypothèse « la faim domine les préférences et augmente l’intérêt pour la machine dangereuse » est **partiellement confirmée**, avec une distinction essentielle :

- **Baie visible :** la faim augmente directement son score, même si son association est négative. Une faim urgente peut rendre ce choix prioritaire. L’exploration alimentaire peut aussi contourner une aversion, à faible comme à forte faim.
- **Levier :** son score ne contient ni faim, ni état de santé, ni préférence alimentaire. Dans les contrôles appariés, augmenter la faim laisse exactement les mêmes scores instrumentaux. Elle peut néanmoins favoriser indirectement un levier en diminuant l’intérêt pour des objets dont le coût énergétique a été appris.
- **Conséquences toxiques :** l’aversion alimentaire et l’aversion instrumentale peuvent diverger. Seuls **85/196 (43,4 %)** des repas négatifs issus de la machine rose et entièrement digérés reçoivent le crédit instrumental correct en disposition espacée ; **10/370 (2,7 %)** en disposition compacte. Les liens peuvent disparaître avant la consommation ; des apparitions deviennent ambiguës lorsque les machines sont proches. Une digestion fatale inachevée ne produit aucune mise à jour alimentaire ou instrumentale pour ce bolus.
- **Machines vides :** la probabilité de production peut diminuer, mais un bonus de curiosité persiste. Une faible probabilité n’interdit pas de réessayer. Le cerveau ne connaît ni stock, ni délai de recharge, ni caractère permanent d’une panne.
- **Remplissage :** il ne change immédiatement aucune association et n’est pas perçu directement. Le retour à la nourriture bénéfique est reproduit, mais les contrôles ne démontrent pas qu’il exige la conservation des anciennes valeurs instrumentales.

Le scénario de recours tardif à la machine toxique apparaît dans **104/144 trajectoires de génomes modernes**, après épuisement des deux réserves bénéfiques ; dans **96/144**, aucune baie bénéfique ne reste alors au sol. Il n’est pas universel. L’ordre « favorite, deuxième, toxique » n’est pas une règle codée, ni une hiérarchie garantie pour chaque individu.

## Preuves et périmètre

Les indications **Code**, **Mesure**, **Interprétation** et **Recommandation** distinguent respectivement un chemin effectivement présent, un résultat exécuté, une explication compatible avec les preuves et une modification future non implémentée.

L’étude prolonge le [rapport C3/DS](creatures3-engine-study.md), le [contrat de preuve de l’observatoire](../learning-observatory.md#contrat-de-preuve) et la [description de l’apprentissage instrumental](../instrumental-learning.md). Le rapport C3 décrit une version antérieure de Luma : ses constats sur l’absence de distributrice ne décrivent plus le commit audité ici.

Les [données mesurées](hunger-dispenser-data.json) et le [protocole exécutable complet](hunger-dispenser-protocol.md) accompagnent ce rapport. Les expériences utilisent le véritable moteur et `LearningObservatory`, avec un agrégateur externe des événements déjà émis. Les identifiants de production servent au diagnostic de provenance ; ils ne sont jamais fournis aux décisions de la créature.

Les graines, sauvegardes, positions et instants de remplissage du test Android ne sont pas disponibles. **Il s’agit d’une reproduction contrôlée du scénario, pas d’un rejeu exact de cette session Android.** Les calculs ont été exécutés sous Node 24.19.0 / V8 13.6, Linux x64, sans rendu. Aucun résultat de performance sur appareil physique n’est revendiqué.

## 1. Mécanismes exacts

### 1.1 Faim, ingestion et urgence

**Code.** `hunger` [S01] calcule, avec les bornages de `clamp` :

```text
H = clamp(1 − énergie/100) × (1 − 0,7 × clamp(estomac/36))
```

La faim est bornée entre 0 et 1 ; elle n’augmente pas indéfiniment. À énergie nulle et estomac plein de 36 unités, elle vaut seulement 0,3. La satiété dépend donc aussi du contenu du tube digestif, même si celui-ci est toxique. L’ingestion est refusée si la masse totale dépasserait 36.

`decideFood` [S02] ne considère les aliments que si `H > 0,18`, `estomac < 25` et au moins un aliment est perçu. Deux politiques sont possibles :

| Politique exécutée | Sélection et score |
| --- | --- |
| Exploration, tirage inférieur au gène `exploration` | Aliment visible choisi uniformément, sans consulter sa valeur apprise ; score d’arbitrage `1,25 H` |
| Évaluation des associations | `S_aliment = 1,25 H + Q_catégorie − 0,22 distance/vision` ; seuls les scores strictement positifs sont retenus |

Le tirage d’exploration alimentaire reste présent après apprentissage. Pour les génomes modernes actuels, son paramètre est compris entre 0,06 et 0,22 [S13]. Ce n’est pas une réévaluation explicite du risque de mourir.

**Code.** Si un aliment est retenu et `H > 0,65`, `decide` retourne immédiatement `urgent-food`, **avant de calculer repos, objets et machines** [S03]. Une forte aversion peut encore rendre tous les scores alimentaires négatifs et empêcher ce retour. Pendant l’exploration, les associations ne sont pas consultées. L’urgence ne signifie donc ni « toujours manger », ni « comparer toutes les alternatives puis choisir la moins dangereuse ».

### 1.2 Arbitrage, objets et leviers

Le repos vaut `0,8 fatigue/100 + 0,65 stress/100`. Les objets utilisent leurs effets *appris* et les besoins actuels, dont le terme `H × effet_énergie_attendu/25` [S03]. Les effets attendus sont bornés selon la marge disponible dans l’état corporel. Le carillon et le prisme peuvent avoir un coût énergétique appris ; augmenter la faim peut réduire leur score.

**Code.** `actuatorScores` [S04] emploie exclusivement :

```text
S_levier = curiosité × (0,25 + 0,5 / √(1 + tentatives))
           + P_ressource × V_conséquence
           − 0,16 × distance/vision
```

`P` est l’estimation apprise d’une apparition de ressource après l’action ; `V` est une moyenne apprise de bilans biologiques avec éligibilité temporelle. Ce score n’est pas une probabilité de sélection. `P` n’est ni la lecture du stock ni une estimation du danger.

La curiosité dépend de stimulation, fatigue et stress, sans terme direct de faim, énergie ou santé [S05]. Les paramètres physiologiques influencent cependant leurs évolutions. La santé et la toxicité actuelles n’entrent pas directement dans le score des leviers. Aucun chemin ne lit la recette cachée pour choisir un levier, et aucune règle « faim → levier » n’existe.

Une conséquence encore attendue supprime temporairement la candidature de la même machine. Une nourriture visible encore reliée à cette machine la supprime également [S04]. Hors retour urgent, les candidats sont comparés par `>` strict : un ex æquo conserve le candidat antérieur. Le repli `wander` utilise le hasard et **n’a pas de score** ; il peut être remplacé par le repos suivant fatigue, stress, curiosité ou estomac [S03].

### 1.3 Trois mémoires différentes

| Mémoire | Clé et contenu | Ce qu’elle ne représente pas |
| --- | --- | --- |
| Alimentaire [S06] | Catégorie de baie ; valeur `Q`, nombre de digestions achevées, dernier bilan | Identité de la machine productrice ; risque terminal explicite |
| Objets [S05] | Catégorie ; valeur, effets attendus sur besoins/énergie, interactions | Effets physiques cachés avant expérience |
| Instrumentale [S07] | Identifiant du levier **et** situation `clear` / `resource-visible` ; `P`, `V`, tentatives, observations, bilans | Stock, recharge, diagnostic de panne, lien direct vers `Q` alimentaire |

`resource-visible` signifie qu’un aliment perçu se trouve à moins de 60 unités de la cible. Il peut être ancien ou provenir d’ailleurs. Les deux situations ont des cellules distinctes ; une expérience dans l’une ne met pas automatiquement l’autre à jour. Une valeur nulle sans expérience reste inconnue ; une valeur nulle avec expériences peut être neutre ou ne pas avoir reçu de bilan biologique.

La plasticité alimentaire est le taux génétique `α = learningRate` dans `Q ← Q + α(R − Q)`. La plasticité instrumentale utilise le même taux, multiplié par l’éligibilité pour `V`. Les compteurs, et pas le seul signe de la valeur, sont nécessaires pour interpréter l’apprentissage.

### 1.4 Physique, absence de résultat et remplissage

**Code.** `pressDevice` et `updateDevices` [S08] sont indépendants du cerveau. Chaque machine commence avec 12 baies, masse 10 ; nutriments ambre/bleue/rose : 28/15/5 ; toxines : 0/0/10. Une pression acceptée réserve immédiatement une baie, la produit après **8 ticks = 0,8 s**, et impose une recharge de **80 ticks = 8 s**. Une pression à vide ou pendant recharge bouge toujours le levier. La limite de 48 aliments peut retarder une production.

Un stock déjà à zéro peut donc avoir une dernière baie **en attente de sortie**. « Réserve vide », « aucune nourriture au sol » et « pression sans future production » sont trois mesures différentes.

`perceiveActuators` ne transmet que l’identité, l’apparence, l’action disponible, la position et la distance [S07]. Une absence de ressource n’abaisse `P` que si la fenêtre de **50 ticks = 5 s** a été suffisamment observée [S09]. Quitter la zone peut invalider cette couverture. Une recharge de 8 s peut ainsi produire une absence observée dans la fenêtre de 5 s sans panne définitive.

La mise à jour est `P ← P + α(0 − P)` pour une absence couverte, et `P ← P + α(1 − P)` pour une apparition liée. Une absence ne modifie pas directement `V`. Le bonus de curiosité tend vers `0,25 × curiosité` lorsque les tentatives augmentent : il ne s’annule pas parce que le résultat est devenu prévisible ou inutile.

**Conséquence algébrique :** si `V < 0`, abaisser `P` rend `P × V` moins négatif. Une machine nuisible devenue peu productive peut donc redevenir relativement attrayante par curiosité, sans qu’une nouvelle récompense ait été reçue. Cela ne garantit pas qu’elle gagnera l’arbitrage.

`refillDevice` ne fait que `stock = capacity` [S10]. Il ne réinitialise ni mémoire, ni épisodes, ni préférences, ni recharge, ni livraison déjà programmée. La créature n’observe pas le remplissage lui-même. Les anciennes valeurs subsistent, mais leur influence dépend de la situation perçue, de la distance, des autres candidats et des nouvelles expériences.

### 1.5 Toxicité et attribution du crédit

**Code.** À chaque absorption, le moteur applique le gain d’énergie réel et un dommage `toxine_absorbée × 1,8 × sensibilité_génétique`, borné par la santé disponible [S01]. Le stock corporel de toxines est éliminé progressivement ; il ne cause pas lui-même un dommage continu supplémentaire. Il retarde notamment la régénération. La famine enlève 1,6 santé/s lorsque l’énergie est inférieure à 1 ; la régénération ajoute 0,13 santé/s si énergie > 35 et toxines < 1.

Le bilan d’un bolus additionne `Δénergie_absorption/25 + Δsanté_absorption/14`, puis est borné entre −2 et 2 **à la fin de sa digestion**. La dépense basale, le déplacement, la famine et la régénération ne sont pas inclus dans ce bilan. Les nutriments perdus par saturation énergétique ne sont pas récompensés. Une sensibilité génétique faible peut rendre la même recette moins négative : « rose » décrit ici une recette toxique, pas une valeur innée attribuée au signal visuel.

L’attribution instrumentale [S09–S11] nécessite une chaîne complète :

1. Une action propre ouvre un épisode.
2. Une ressource nouvellement perçue, dans les 5 s et à 40 unités de l’action, est reliée si **un seul** épisode est compatible. Plusieurs candidats rendent l’apparition ambiguë, sans choix arbitraire du producteur.
3. L’ingestion retrouve le lien par identifiant d’aliment.
4. La digestion achevée fournit le bilan, à condition que l’épisode existe encore et date d’au plus **900 ticks = 90 s**.
5. `V ← clamp(V + α × exp(−délai/300) × (R − V), −2, 2)`. La constante d’atténuation est **30 s**, mesurée depuis l’action, pas depuis l’ingestion.

Les épisodes sont bornés à 12, les liens à 24 et les mémoires à 16. Les évictions et l’expiration peuvent donc interrompre une chaîne ; même un lien observé n’est pas conservé pendant toute la vie de la baie. À 90 s, l’éligibilité ne vaut déjà plus qu’environ 0,05. Le simple recul d’un compteur d’événements n’explique donc pas toute la faiblesse des valeurs instrumentales.

**Code.** La mort arrête les prochains `step` ; aucun bilan terminal ni renforcement partiel des bolus inachevés n’est émis [S12]. Un bolus achevé au tick fatal peut encore apprendre ; un bolus inachevé ne le peut pas. Le bornage du dommage à la santé restante peut aussi atténuer le bilan près de la mort. Il n’existe pas de notion explicite « cette action m’a tué ».

## 2. Protocole et résultats en milieu libre

### Dispositif reproductible

**156 trajectoires**, sans intervention après le tick 0, jusqu’à mort ou 36 000 ticks (60 minutes simulées) :

- 12 graines génétiques indépendantes `hunger-g00` à `hunger-g11`, croisées avec 2 graines de terrain `hunger-e00/e01`, 2 dispositions et 3 rotations des recettes : **144 trajectoires modernes**.
- Une référence à génome v1, créé par `createWorld(terrain)`, dans les mêmes 12 conditions. Cette référence conserve le couplage historique génome/terrain et n’entre pas dans le test statistique des génomes modernes.
- Disposition espacée : emplacements `(200,290)`, `(400,290)`, `(300,460)` ; compacte : `(260,325)`, `(300,325)`, `(340,325)`. La rotation déplace les recettes entre ces trois places. Les identifiants restent ambre 13, bleue 14, rose 15.
- Objets présents dès le départ : carillon `(300,235)`, mousse `(420,420)`, prisme `(180,420)`. Les 12 aliments initiaux sont conservés. Les trois réserves valent 12 ; aucune nourriture ajoutée, aucun remplissage dans ces trajectoires.

Un pilote technique de quatre trajectoires à 30 minutes a précédé le passage à 60 minutes pour suivre l’épuisement des réserves. Aucune graine n’a été retirée selon le résultat. Tous les décès surviennent avant la limite finale. Dans ce milieu fermé à ressources finies, la mortalité à une heure n’est pas à elle seule un indicateur d’échec de l’apprentissage.

### Survie, pressions et ressources

Les « causes » ci-dessous sont le **processus faisant perdre la santé au dernier tick**, pas une causalité médicale exclusive. Une mort classée famine peut avoir subi auparavant des dommages toxiques.

| Groupe | n | Vie moyenne, min | Dernier dommage toxique / famine | Pressions moyennes ambre / bleue / rose | Pressions à réserve vide, total | Recours au levier rose après deux réserves bénéfiques vides |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Moderne, espacé | 72 | 28,66 | 30 / 42 | 19,01 / 16,04 / 4,38 | 932 | 49/72 |
| Moderne, compact | 72 | 24,69 | 43 / 29 | 35,28 / 23,90 / 25,18 | 3 931 | 55/72 |
| V1, espacé | 6 | 29,24 | 1 / 5 | 20,00 / 14,17 / 3,67 | 79 | 3/6 |
| V1, compact | 6 | 18,35 | 3 / 3 | 22,50 / 17,00 / 20,50 | 247 | 3/6 |

| Groupe | Baies effectivement produites, ambre / bleue / rose | Baies ingérées, ambre / bleue / rose, **initiales incluses** | Dommages toxiques cumulés | Dommages de famine cumulés |
| --- | --- | --- | ---: | ---: |
| Moderne, espacé | 829 / 740 / 276 | 1 117 / 1 007 / 435 | 7 906,00 | 2 912,30 |
| Moderne, compact | 703 / 684 / 659 | 991 / 970 / 585 | 9 368,47 | 1 396,30 |
| V1, espacé | 72 / 51 / 19 | 96 / 75 / 34 | 604,28 | 309,47 |
| V1, compact | 36 / 36 / 36 | 60 / 60 / 37 | 648,74 | 138,00 |

Les données individuelles contiennent minimum d’énergie/santé, maximum de toxines, états toutes les 300 s, réserves, associations finales et corps au décès. Exemple espacé `g00/e00/r0`, à 300 s : énergie **86,7091**, santé **100**, toxines **0**, faim **0,1329** ; réserves ambre/bleue/rose **8/10/10** ; valeurs alimentaires **+0,8002 / +0,2310 / −0,7056**.

### Décisions par niveau de faim

Agrégats descriptifs des génomes modernes. « Chercher » est la décision `seek`, pas une ingestion ; « levier » est `use`, pas nécessairement une pression atteinte. Scores moyens calculés uniquement quand le candidat est réellement évalué ; les retours urgents peuvent omettre tous les leviers.

| Disposition, faim | Décisions | Chercher / levier / repos / objet / errance | Score moyen ambre / bleue / rose |
| --- | ---: | --- | --- |
| Espacée, H < 0,33 | 50 222 | 4 676 / 3 048 / 35 358 / 6 056 / 1 084 | −0,0297 / −0,0293 / −0,0552 |
| Espacée, 0,33 ≤ H ≤ 0,65 | 3 998 | 619 / 174 / 2 611 / 437 / 157 | −0,0078 / −0,0012 / −0,0284 |
| Espacée, H > 0,65 | 3 305 | 143 / 31 / 2 506 / 427 / 198 | −0,0323 / −0,0357 / −0,1070 |
| Compacte, H < 0,33 | 45 101 | 4 121 / 5 638 / 29 282 / 4 037 / 2 023 | −0,0002 / −0,0041 / −0,0237 |
| Compacte, 0,33 ≤ H ≤ 0,65 | 3 601 | 632 / 597 / 1 635 / 168 / 569 | +0,0755 / +0,0756 / +0,0731 |
| Compacte, H > 0,65 | 2 263 | 192 / 193 / 1 086 / 155 / 637 | +0,0981 / +0,0993 / +0,0909 |

**Interprétation limitée :** ces groupes mélangent positions, souvenirs, satiété, épuisement et histoires individuelles. L’augmentation observée de certains scores en disposition compacte ne prouve pas un effet direct de la faim. Les contrôles suivants isolent cet effet.

## 3. Contrôles appariés et traces de décision

### 3.1 Faim seule, réserves et machine toxique seule

Pour chacun des 13 génomes de référence, on copie les mémoires de la trajectoire `e00/espacée/r0`, puis on standardise position `(300,340)`, santé 100, toxines/estomac/digestions vides, besoins `(40,20,5)`, épisodes/liens vides et même état RNG. On compare uniquement **énergie 80 (H = 0,2)** et **énergie 10 (H = 0,9)**. Ces sondes sur états construits ne représentent pas un vieillissement naturel du même corps.

La matrice croise : objets présents/absents, trois machines/machine rose seule, stocks pleins/préférée vide/deux bénéfiques vides, et quatre états de mémoire :

- `learned` : souvenirs conservés ;
- `unknown` : mémoires alimentaires et instrumentales réinitialisées, **souvenirs d’objets conservés** ;
- `food-neutral` : seule la mémoire alimentaire est réinitialisée ;
- `instrument-value-neutral` : seuls `P` et `V` sont mis à zéro, compteurs conservés.

**Mesure : 624 paires sans baie au sol ; 1 248 comparaisons de scores de machines ; écart maximal = 0.** Changer seulement le stock laisse aussi scores et décisions identiques. Sans objets, aucune des 312 paires ne change d’action. Avec objets, 90/312 changent ; après retrait des trois répétitions de stock invisibles, **30/104** : 24 passent d’un objet à l’errance, 6 d’un objet au levier rose. L’effet indirect sur la compétition existe donc, sans augmentation du score du levier.

Trace contrôlée `hunger-g00/e00/espacée/r0`, mêmes associations et RNG :

| Candidat effectivement calculé | H = 0,2 | H = 0,9 |
| --- | ---: | ---: |
| Repos | 0,192500 | 0,192500 |
| Carillon 16 | **0,210274** | 0,182274 |
| Prisme 18 | 0,028822 | −0,007588 |
| Levier ambre 13 | 0,105160 | 0,105160 |
| Levier bleu 14 | 0,100156 | 0,100156 |
| Levier rose 15 | 0,205557 | **0,205557** |
| Choix | `inspect 16` | `use 15` |

La cellule rose a `P = 0,433445`, `V = 0`, une tentative : elle a une observation de production, mais aucun bilan biologique mémorisé dans cette cellule. Ce changement de choix ne démontre donc pas l’acceptation consciente d’un danger connu.

Une trace libre confirme aussi l’exploration à faible faim : `g00/e00/espacée/r0`, première pression rose au tick **210**. À la décision précédente, `H = 0,131990`, cellule rose encore inconnue (`P = V = 0`), score rose **0,167250**, repos **0,146998**. La découverte de ce levier n’attend pas une urgence alimentaire.

Un autre contrôle compare **machines vides** et **machines pleines bloquées par une recharge de 1 000 s**, sans sortie possible pendant l’essai. Les trajectoires corporelles, cognitives et aléatoires sont identiques sur **400 ticks (40 s)**. Cette équivalence est attendue puisque leurs événements observables sont identiques ; elle ne permet pas de conclure qu’une panne serait permanente.

### 3.2 Baie toxique disponible : effet direct et exploration

On ajoute une seule baie rose à distance 20, en gardant les mêmes contrôles. Deux états RNG, déterminés hors des mondes étudiés, imposent le passage par la politique ordinaire (`u = 0,999811`) ou exploratoire (`u = 0,007454`) sans modifier les gènes. **52 paires** comparent mémoire alimentaire/instrumentale conservée ou inconnue et ces deux tirages.

| État des mémoires alimentaire/instrumentale | Tirage | `seek` rose à H = 0,2 | `seek` rose à H = 0,9 |
| --- | --- | ---: | ---: |
| Conservées | Évaluation ordinaire | 1/13 | 6/13 |
| Conservées | Exploration alimentaire | 12/13 | 13/13 |
| Inconnues | Évaluation ordinaire | 0/13 | 13/13 |
| Inconnues | Exploration alimentaire | 0/13 | 13/13 |

L’absence de `seek` à faible faim avec mémoires inconnues vient ici de la concurrence des leviers nouveaux, pas d’une aversion. À forte faim, **7/13** états appris refusent encore la baie en politique ordinaire. Une aversion suffisamment forte résiste à l’urgence.

Trace `hunger-g01/e00/espacée/r0` : `Q_rose = −0,658914`, 3 digestions achevées, dernier bilan `−0,838889`.

| Donnée réellement utilisée | H = 0,2 | H = 0,9 |
| --- | ---: | ---: |
| Score de la baie rose 44 | −0,432994 | **+0,442006** |
| Repos | 0,192500 | non calculé |
| Leviers ambre / bleu / rose | 0,077511 / 0,072184 / 0,185923 | non calculés |
| Choix et branche | `wander`, repli | `seek 44`, `urgent-food` |

Le gain de score est exactement `1,25 × (0,9 − 0,2) = 0,875`. Aucun score des machines n’est reconstitué pour la branche urgente. Dans les trajectoires libres modernes, **257/435** ingestions roses espacées et **351/585** compactes suivent une décision d’exploration alimentaire ; cela inclut les baies initiales. La faim n’explique donc pas seule la persistance de la consommation toxique.

### 3.3 Tentatives à vide et diminution de P

Sur les 932 tentatives à réserve vide espacées, **187** utilisent une cellule ayant déjà des observations et `P ≤ 0,05`. En disposition compacte : **2 710/3 931**. Les cellules encore sans observation ne représentent respectivement que **13** et **7** tentatives. « Réessayer » n’implique donc pas nécessairement « n’a pas appris l’absence ».

Trace naturelle `g00/e00/espacée/r0`, tick **11 421** : première pression supplémentaire sur l’ambre vide. Au dernier choix, faim **0,124199**, score ambre **0,197912**, `P = 0,998070`, `V = 0,203117`, 11 tentatives antérieures ; repos **0,022976**, bleu **−0,102507**, rose **−0,116269**. La forte attente positive précède ici l’apprentissage des absences : le stock physique vient de s’épuiser, sans signal cognitif immédiat.

Une sonde conserve une vraie valeur rose négative `V = −0,042058`, position et besoins identiques, puis ne change que `P` :

| P imposé pour la sonde | 0 | 0,05 | 0,2 | 0,5 | 1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Score rose | 0,459069 | 0,456966 | 0,450658 | 0,438040 | 0,417011 |

Cela vérifie le signe de `P × V`, sans démontrer à lui seul un changement d’action. Une autre sonde de contexte trouve une aversion **plus forte** en `resource-visible` (score 0,164292) qu’en `clear` (0,430511). Le code permet une cellule inconnue dans un autre contexte, mais cette sonde ne montre pas un effacement automatique des souvenirs lors d’un changement de contexte.

## 4. Où se perd le retour toxique ?

| Groupe | Repas négatifs de machine rose, digestion achevée | Crédit instrumental négatif vers le bon levier | Sans crédit : lien perdu avant ingestion / pendant digestion / apparition ambiguë |
| --- | ---: | ---: | --- |
| Moderne, espacé | 196 | 85 (43,4 %) | 108 / 3 / 0 |
| Moderne, compact | 370 | 10 (2,7 %) | 290 / 0 / 70 |
| V1, espacé | 16 | 7 (43,8 %) | 8 / 1 / 0 |
| V1, compact | 19 | 0 (0 %) | 15 / 0 / 4 |

Le classement « perdu » signifie qu’un lien avait été observé et n’était plus utilisable au moment nécessaire. Les compteurs ne séparent pas toutes les expirations des évictions par les bornes mémoire. Le code fixe leurs conditions ; la trace suivante confirme une expiration largement dépassée dans un cas réel. Les apparitions ambiguës totales, toutes recettes confondues, valent **149** dans le groupe moderne compact contre **0** en espacé. Aucun crédit vers une mauvaise machine ni vers une baie initiale n’est mesuré dans cette cohorte ; cela ne garantit pas l’impossibilité de fausses attributions dans d’autres dispositions.

**Trace naturelle d’un décès :** `g00/e00/espacée/r0`, baie rose **28**, produite par le levier **15**, reliée au tick **4 136**, ingérée seulement au tick **21 423**. Son lien a expiré depuis longtemps. Au tick **21 463**, santé **0**, énergie **43,3163**, toxines **5,0155**, faim **0,5424**, bolus restant **2,2213**. Ce bolus a déjà causé **19,3115** dommages et accumulé un bilan **−1,2412**, mais n’a émis ni bilan alimentaire final ni crédit instrumental. Le décès n’est pas une famine au dernier tick.

**Contrôle terminal isolé :** même génome `g00`, même monde, seule machine rose proche, aucune baie initiale ni objet, énergie 30. Seule la santé initiale change ; aucune action ou ingestion n’est forcée.

- Santé 1 : mort toxique au tick **24**, après ingestion au tick 22 ; épisode encore relié, **9,4308** de masse restante, aucune digestion apprise, `Q_rose = 0`, `V_rose = 0`.
- Santé 100 : vivant au tick **300**, santé **49,4443** ; deux digestions négatives terminées, `Q_rose = −1,105356`, `V_rose = −0,935545`, crédits aux ticks **74 et 179**, bilan par repas **−1,627880**.

Ce contrôle isole l’absence de retour terminal même lorsque l’attribution temporelle est encore valide. Dans les cohortes modernes, les **73/73** décès à dernier dommage toxique ont un bolus rose dommageable inachevé ; **62** de ces décès comportent un tel bolus provenant d’une machine, les autres de la nourriture initiale. Cela ne signifie pas que ces individus n’avaient jamais appris d’aversion auparavant.

## 5. Remplissage : mémoire, perception ou exploration ?

Au premier tick vivant où les deux réserves bénéfiques sont à zéro, on conserve un instantané complet. **122 trajectoires sont éligibles** : 115 modernes, 7 v1. Chaque instantané produit quatre continuations appariées de **1 800 ticks = 3 minutes** : remplissage ou témoin sans remplissage, valeurs instrumentales conservées ou `P/V` neutralisés. Les compteurs, besoins, positions, RNG, épisodes, nourriture au sol et mémoires alimentaires/objets sont conservés ; l’apprentissage continue. Cette ablation ne crée donc pas une créature entièrement naïve.

| Valeurs instrumentales | Remplissage | Production moyenne ambre / bleue / rose | Ingestions moyennes ambre / bleue / rose | Vivants après 3 min |
| --- | --- | --- | --- | ---: |
| Conservées | Non | 0,041 / 0,959 / 0,648 | 0,090 / 2,738 / 1,352 | 114/122 |
| Conservées | Oui | 1,959 / 3,746 / 0,238 | 1,443 / 2,148 / 0,115 | 122/122 |
| P et V neutralisés | Non | 0,041 / 0,959 / 0,754 | 0,082 / 2,721 / 1,213 | 116/122 |
| P et V neutralisés | Oui | 1,984 / 3,754 / 0,303 | 1,459 / 2,115 / 0,131 | 122/122 |

Le remplissage lui-même préserve exactement le hachage de l’état cognitif dans tous les essais. Les sorties déjà réservées expliquent la production bénéfique possible chez les témoins pourtant vides au point de départ. La baie bleue peut aussi être encore en attente au checkpoint : ce protocole ne démontre pas une préférence générale bleue > ambre.

Évolution des associations dans les branches à mémoire conservée, moyennes des mêmes 122 instantanés :

| Instant | Q alimentaire ambre / bleue / rose | P instrumental ambre / bleu / rose, situation `clear` | V instrumental ambre / bleu / rose, situation `clear` |
| --- | --- | --- | --- |
| Avant intervention | +0,8644 / +0,5133 / −0,7378 | 0,1751 / 0,6251 / 0,3144 | +0,2556 / +0,1375 / −0,0053 |
| Après 3 min sans remplissage | +0,8653 / +0,5299 / −0,8480 | 0,1233 / 0,1578 / 0,3336 | +0,2571 / +0,1642 / −0,0129 |
| Après 3 min avec remplissage | +0,8596 / +0,5165 / −0,7515 | 0,2933 / 0,6535 / 0,3173 | +0,2723 / +0,1851 / −0,0077 |

Les cellules instrumentales absentes contribuent zéro à ces moyennes, conformément aux valeurs par défaut utilisées pour la décision ; les compteurs individuels restent dans les données. Ce tableau ne fusionne pas les cellules `resource-visible` avec `clear`. La hiérarchie alimentaire moyenne persiste, tandis que P peut baisser sans remplissage ou remonter après de nouvelles productions. Elle ne suffit pas à prédire le levier choisi à chaque instant.

**Mesure :** les productions bénéfiques après remplissage sont très proches avec valeurs conservées (**5,705**) ou neutralisées (**5,738**). L’alimentation toxique diminue fortement dans les deux cas. **Interprétation :** ces résultats sont compatibles avec un retour alimenté par la mémoire alimentaire conservée, la disponibilité retrouvée, l’exploration et le réapprentissage, sans isoler leurs contributions respectives. La mémoire instrumentale persiste dans le code, mais son rôle nécessaire ou dominant dans le retour n’est pas établi. Il faudrait des remplissages plus tardifs et des ablations supplémentaires pour répondre au cas d’une panne prolongée.

## 6. Diversité individuelle et portée statistique

Les comparaisons modernes espacées croisent les **12 génomes avec les mêmes 6 blocs terrain × rotation**. Les moyennes de durée de vie par génome vont de **18,77 à 37,11 min** ; les ingestions roses, initiales incluses, de **3,67 à 8,83**. Exemples sur six conditions chacun :

| Graine | Sensibilité aux toxines | Exploration alimentaire | Vie moyenne, min | Ingestions roses moyennes | Décès à dernier dommage toxique |
| --- | ---: | ---: | ---: | ---: | ---: |
| g00 | 1,4043 | 0,0965 | 37,11 | 5,83 | 4/6 |
| g02 | 0,1258 | 0,1363 | 23,52 | 6,50 | 0/6 |
| g04 | 1,7269 | 0,2147 | 18,77 | 6,17 | 5/6 |
| g10 | 0,8932 | 0,0902 | 29,54 | 8,83 | 4/6 |

Un test exploratoire de permutation des étiquettes génétiques **à l’intérieur de chaque bloc**, après centrage par bloc, utilise 4 095 permutations pour chacune des deux mesures. Après correction de Holm : durée de vie **p = 0,000488** ; ingestions roses **p = 0,001953**. Les statistiques, graines d’analyse et procédure complète figurent dans les annexes. Le rapport de variances utilisé est un score de permutation, pas un test F paramétrique.

**Conclusion limitée :** des différences entre génomes sont détectables dans ce panel et ces environnements. Elles résultent de plusieurs coefficients et des expériences qu’ils entraînent. Aucun effet n’est attribué isolément à la sensibilité toxique ou à la plasticité ; aucun archétype de personnalité n’est démontré. Les deux dispositions ne sont pas un échantillon représentatif de tous les terrariums. Cette analyse exploratoire n’était pas préenregistrée et demande une réplication sur de nouvelles graines.

## 7. Réponses aux six questions

| Question | Réponse étayée |
| --- | --- |
| La faim augmente-t-elle l’intérêt pour les machines dangereuses ? | **Pas directement leur score.** Écart zéro dans 1 248 comparaisons. Elle peut modifier leur rang en pénalisant des objets coûteux, et augmente directement l’attrait d’une baie déjà visible. Aucun calcul explicite de prise de risque n’est présent. |
| Vide temporaire ou panne définitive ? | **Pas de distinction représentée.** Le cerveau observe apparitions/absences et estime P. Le contrôle vide/recharge produit la même trajectoire lorsque les événements sont identiques. Une absence finie ne prouve pas une panne permanente. |
| Pourquoi actionner sans résultat ? | Mémoire positive encore forte après épuisement, absences parfois non couvertes, curiosité résiduelle, coût de distance faible, concurrence des autres actions et cellules de contexte distinctes. Des milliers de tentatives ont lieu même avec P ≤ 0,05 déjà appris. |
| Le retour toxique est-il suffisamment attribué ? | **Couverture faible dans ce scénario**, particulièrement compact : 43,4 % / 2,7 % des repas négatifs de machine achevés reçoivent le bon crédit. Le repas fatal inachevé peut ne mettre à jour aucune des deux mémoires. Une attribution existante est en outre atténuée par le délai. |
| Le retour après remplissage vient-il de la mémoire, de la perception ou de l’exploration ? | Aucun signal de remplissage, mémoires inchangées immédiatement. Le retour bénéficie des ressources retrouvées ; son amplitude sur trois minutes reste proche après neutralisation de P/V. Le rôle exclusif ou nécessaire de l’ancienne mémoire instrumentale est **non démontré**. |
| Des différences significatives entre individus ? | **Oui dans le panel contrôlé**, pour durée de vie et ingestions roses, avec les p de permutation corrigées ci-dessus. Généralisation et attribution à un gène particulier restent à tester. |

**Hypothèses confirmées :** compensation de certaines aversions alimentaires par la faim ; exploration de nourriture négative ; substitutions et tentatives à vide ; influence de la disposition ; pertes de crédit et absence de retour terminal ; persistance immédiate des associations après remplissage.

**Hypothèses infirmées par le code ou ces contrôles :** bonus direct de faim pour un levier ; lecture cachée de sa toxicité ou de son stock ; règle fixe de classement des trois machines ; arrêt garanti des tentatives quand P tend vers zéro ; attribution négative automatique de tout repas toxique à son producteur.

**Non établis :** raisonnement conscient sur le risque, connaissance d’une panne permanente, rétablissement d’une hiérarchie par la seule mémoire instrumentale, reproduction exacte de la session Android.

## 8. Problèmes de conception et recommandations, sans implémentation

| Priorité | Problème observé | Étude ou mécanisme général à envisager | Validation nécessaire |
| --- | --- | --- | --- |
| P0 | Dommage fatal avant fin du bolus sans mise à jour correspondante | Retour physiologique partiel ou signal terminal, sans recompter les conséquences déjà attribuées | Contrôle santé 1/100, bolus simultanés, mort pendant une autre action ; provenance et reproductibilité |
| P0 | Baie consommée après perte du lien ; ambiguïté des machines proches | Distinguer fenêtre d’observation, conservation d’une ressource identifiée et éligibilité de ses conséquences ; conserver une attribution prudente et bornée | Couverture du crédit selon délai/disposition ; tests négatifs contre les fausses attributions, sans consulter le producteur caché |
| P1 | Valeur instrumentale scalaire peu sensible à l’état ; mémoires alimentaires et leviers décorrélées | Évaluer des conséquences apprises avec l’état corporel actuel, incluant santé et coût ; éviter une règle spéciale « faim → levier » | Même historique, faim/santé variées ; choix entre nourriture risquée et action apprise bénéfique ; témoins sans apprentissage |
| P1 | Curiosité incompressible devant une action connue inutile ; P bas atténuant une valeur négative | Séparer nouveauté, incertitude, coût et revisite ; étudier un oubli ou une revisite justifiés par les observations | Extinction puis reprise après panne temporaire ; ne pas rendre une machine définitivement interdite par une absence |
| P2 | Retour urgent qui ignore les autres actions ; exploration alimentaire ignorant l’aversion | Étudier un arbitrage commun et une exploration sensible aux conséquences apprises | Conserver découverte spontanée et diversité ; mesurer survie, découverte et refus, sans seuil par catégorie |
| P2 | Cellules de situation indépendantes, sans modèle temporel de disponibilité | Tester un partage prudent de la valeur biologique et une estimation de disponibilité fondée sur les événements | Changement de contexte, recharge variable, panne prolongée et remplissage tardif ; aucune lecture de stock |
| P2 | Rôle mémoriel du retour après remplissage encore ambigu | Répéter les ablations séparées aliment/instrument, apprentissage ensuite gelé ou actif, position appariée | Nouvelles graines, points de remplissage définis à l’avance, résultats par individu et distributions |
| P3 | Session Android non rejouable exactement | Recueillir export existant, graines, positions, chronologie des commandes et remplissages | Rejeu du même état sur appareil et hors rendu ; benchmark réel Android avant toute complexification |

Aucune de ces propositions n’est implémentée par cette contribution. Elles nécessitent une mission distincte avec témoins et budget Android mesuré.

## 9. Limites, validation et intégrité

- Le nombre de graines de terrain est faible ; les trois rotations ne couvrent pas toutes les géométries. La disposition compacte change à la fois distances, rencontres et ambiguïtés : ses écarts ne sont pas attribuables à la seule ambiguïté.
- Les sondes de faim utilisent des souvenirs de fin de trajectoire, puis rétablissent des corps standardisés. Elles isolent un calcul, sans estimer la fréquence de ces états dans la nature. Le stock invisible est volontairement répété dans la matrice ; les comptes sans répétition sont précisés.
- Les continuations de remplissage concernent uniquement les 122 survivants atteignant le checkpoint ; elles sont appariées, mais sélectionnées. Leur horizon de trois minutes n’établit ni stratégie à long terme ni avantage universel de survie. Nourriture et livraison déjà en cours restent présentes.
- Les dommages cumulés distinguent absorption toxique et variation résiduelle de santé, suivant les règles auditées. Le dernier dommage est une classification opérationnelle, pas une analyse contrefactuelle complète du décès.
- L’historique de l’observatoire reste borné. L’agrégateur externe conserve tous les compteurs, des états périodiques et des exemples ; seules les 30 premières transitions et 12 premiers crédits de chaque trajectoire libre sont détaillés. Ce n’est pas un enregistrement intégral de tous les ticks.
- Les nombres publiés sont arrondis à 10 décimales après exécution ; les décisions utilisent les flottants natifs du moteur. La reproductibilité mesurée concerne cet environnement logiciel, pas une garantie d’identité bit à bit entre tous les moteurs JavaScript.
- `npm test` : **107 tests existants réussis**, sans modification. Le protocole externe passe ses assertions d’identité cognitive vide/recharge et de parité observatoire activé/désactivé/repris sur **600 ticks**. Les essais n’ajoutent aucun tirage au monde observé. Aucun nouveau test ni script chargé par le jeu n’est ajouté au dépôt.
- Un rejeu intégral a reproduit exactement l’empreinte des données compactes. L’ajout ultérieur de l’état initial des checkpoints à l’annexe a été vérifié sans aucun changement des trajectoires, des sondes ou des continuations mesurées.
- Seuls les fichiers documentaires de cette enquête sont livrés. Le protocole peut être extrait sous `/tmp` et rejoué contre le commit épinglé ; il ne faut pas le confondre avec une nouvelle règle du moteur ou un nouveau workflow CI.

## Références précises du code audité

Les liens ci-dessous sont figés au commit étudié, même si `main` évolue ensuite.

- [S01 — `metabolism.ts`, `hunger`, `ingest`, `metabolize`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/metabolism.ts#L12-L88).
- [S02 — `decisions.ts`, `decideFood`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/decisions.ts#L16-L61).
- [S03 — `decisions.ts`, `decide`, retour urgent et arbitrage](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/decisions.ts#L64-L204).
- [S04 — `instrumental.ts`, `actuatorScores`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/instrumental.ts#L130-L170).
- [S05 — `curiosity.ts`, `motivations`, `updateNeeds`, `learnInteraction`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/curiosity.ts#L36-L127).
- [S06 — `brain.ts`, `reinforce`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/brain.ts#L1-L19).
- [S07 — `instrumental.ts`, `perceiveActuators`, `perceiveChange`, `newlyPerceivedResources`, `situationFor`, `transitionFor`, `memory`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/instrumental.ts#L19-L129).
- [S08 — `devices.ts`, `addDispenser`, `pressDevice`, `updateDevices`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/devices.ts#L34-L117).
- [S09 — `instrumental.ts`, `beginAction`, `updateTransition`, `observeChange`, `updateEpisodes`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/instrumental.ts#L171-L307).
- [S10 — `devices.ts`, `refillDevice`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/devices.ts#L118-L123).
- [S11 — `instrumental.ts`, `registerIngestion`, `reinforceInstrumental`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/instrumental.ts#L308-L354) et [constantes temporelles et bornes](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/instrumental-types.ts#L1-L14).
- [S12 — `world.ts`, `step` : physique, perception, motricité, ingestion, renforcement et mort](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/world.ts#L123-L348).
- [S13 — `genome.ts`, coefficients, `physiology`, `generateGenome`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/genome.ts#L1-L68).
- [S14 — `recorder.ts`, `LearningObservatory`](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/observatory/recorder.ts).
- [S15 — `objects.ts`, recettes physiques des trois objets](https://github.com/Ankool29/Artificial-life/blob/ee8cb0fba529ae950cbf3ef6f98ba42002a59731/src/sim/objects.ts).
