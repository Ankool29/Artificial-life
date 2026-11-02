# Étape 2 · Curiosité, exploration et conséquences

## Analyse préalable du moteur v1

Avant modification, le moteur a été relu dans `types`, `world`, `metabolism`, `brain`, `perception`, `decisions` et `persistence`. Les 24 tests existants ont été exécutés avec succès. Une sauvegarde issue de ce moteur, au tick 315, a été conservée dans `tests/fixtures/world-v1.json` : elle contient un repas en digestion, deux associations alimentaires déjà apprises et l’état exact du hasard.

Les points à préserver étaient :

- Tick biologique fixe de 100 ms, générateur explicite, rendu indépendant.
- Génome nommé influençant réellement assimilation, perception et plasticité.
- Récompense alimentaire attribuée au repas lors de son absorption ; aucun accès décisionnel à sa chimie.
- Valeurs alimentaires initialement neutres et règle delta à la fin de la digestion.
- Validation des sauvegardes v1, incluant contenu digestif, échéances d’action et hasard.

L’exploration v1 était une destination de marche aléatoire, sans besoin de stimulation, objets ou apprentissage d’interaction. `metabolism.ts`, `brain.ts`, `genome.ts` et `random.ts` restent inchangés. Le choix de nourriture existant devient un candidat de l’arbitrage général ; ses seuils, scores et exploration aléatoire sont conservés. Les trajectoires futures peuvent changer parce que de nouvelles motivations existent, mais aucune préférence alimentaire acquise n’est réinitialisée.

## Besoins internes et effets

`curiosity.ts` ajoute trois quantités bornées de 0 à 100 : stimulation, fatigue et stress. La curiosité est un état dérivé :

`C = (1 − stimulation/100) × (1 − fatigue/120) × (1 − stress/140)`

La stimulation diminue de 0,36/s à l’arrêt, 0,16/s en mouvement. La fatigue augmente de 0,32/s en mouvement et 0,12/s en interaction ; le repos la diminue de 0,8/s. Le stress diminue de 0,25/s au repos, 0,12/s autrement. Ces nombres constituent les règles communes du modèle, pas une préférence pour un objet particulier.

`objects.ts` définit des recettes physiques :

| Signal | Stimulation | Fatigue | Stress | Énergie |
| --- | ---: | ---: | ---: | ---: |
| Carillon | +32 | +8 | −6 | −1 |
| Mousse | +8 | −30 | −22 | 0 |
| Prisme | +36 | +18 | +28 | −3 |

Une interaction dure 30 ticks et répartit ces effets sur sa durée. L’énergie reste soumise au métabolisme existant ; les objets ne modifient pas la santé directement. Le modèle émotionnel reste simple : le stress influence les motivations, sans prétendre simuler des émotions complexes.

## Perception et apprentissage

`perceiveObjects` ne renvoie que position, distance, signal et état inconnu. Un signal est inconnu tant qu’aucune interaction de cette catégorie n’a été terminée. Les associations généralisent donc entre objets d’une même apparence, et non entre chaque instance individuelle. La perception n’expose ni recettes ni effets physiques. Les objets en récupération ne sont pas proposés comme interactifs.

La mémoire des objets est séparée de la mémoire alimentaire. Toutes les catégories commencent à zéro. Pendant l’interaction, on cumule les changements réellement causés par l’objet, après bornage, sans créditer les dérives passives du corps. À la fin :

`r = clamp(Δstimulation/40 − Δfatigue/30 − Δstress/30 + Δénergie/25, −2, 2)`

La valeur scalaire et chacun des quatre effets attendus sont mis à jour par règle delta, avec la plasticité déjà définie dans le génome. La valeur scalaire mesure le bilan vécu ; le vecteur d’effets permet de réévaluer un souvenir selon les besoins actuels. Aucun branchement dans l’apprentissage ou les décisions ne dépend du nom d’un objet.

Un objet ne récompense pas le simple fait d’être visible. L’approche seule ne change pas les associations. Après usage, sa récupération dure 80 ticks. Si le joueur retire un objet pendant l’approche, Milo abandonne ; pendant l’interaction, seuls les effets déjà vécus sont mémorisés. La mémoire subsiste après retrait.

## Arbitrage

Toutes les deux secondes, ou après la fin d’une action, le moteur compare les candidats :

- Alimentation : candidat et score alimentaires d’origine. Avec faim > 0,65, le candidat alimentaire choisi conserve la priorité.
- Repos : score `0,8 × fatigue/100 + 0,65 × stress/100`.
- Objet : nouveauté décroissant avec le nombre d’expériences, curiosité, conséquences attendues, bilan appris et distance. Les effets attendus sont limités à ce que l’état courant peut encore recevoir : impossible de prévoir de soulager une fatigue déjà nulle.
- Sans candidat utile : marche exploratoire si la curiosité suffit, repos sinon.

Une interaction déjà engagée est menée à son terme en trois secondes maximum ; il n’y a pas de préemption alimentaire pendant ces trois secondes. L’arbitrage ne force pas une action par catégorie et ne garantit pas que chaque objet sera essayé : sa visibilité, la distance, les autres besoins et le passé comptent.

## Sauvegardes

Le format courant devient v2. `deserialize` accepte v1 et v2 ; v1 est validé puis enrichi de besoins initiaux et d’une mémoire neutre, sans créer d’objets ni tirer de hasard. Génome, mémoire alimentaire, métabolisme, digestion, position, action, temps, identifiants et RNG restent inchangés à l’import.

Les nouvelles sauvegardes incluent besoins, associations d’objets, recettes présentes dans le monde, récupérations et trace d’une interaction en cours. Elles reprennent exactement dans le nouveau moteur. Les anciens moteurs v1 ne savent pas lire v2. La clé `luma.world.v1` de localStorage est conservée volontairement pour retrouver les sauvegardes déjà présentes ; le numéro de version à l’intérieur du JSON détermine la migration.

## Validation et budget

Les nouveaux tests échangent les effets physiques de deux apparences : des histoires opposées conduisent à des valeurs apprises et des choix opposés. Ils vérifient aussi le désapprentissage, le changement de choix selon les besoins, la priorité de la faim, les délais d’apprentissage, les suppressions, la migration du vrai checkpoint v1 et la reprise exacte d’une interaction v2.

Un scénario autonome déterministe de 20 000 ticks avec trois objets et apport périodique de nourriture vérifie que la créature mange, interagit, conserve un état sérialisable et distingue les objets après leurs conséquences. Ce scénario n’ordonne aucune interaction à la créature.

Les tests navigateur existants restent conservés ; trois scénarios supplémentaires sont exécutés sur Android portrait émulé et ordinateur : placement/retrait avec maintien du dépôt d’aliments, interaction autonome avec mémoire persistante, import v1 sans perte biologique.

Les limites restent 10 Hz pour le moteur, 30 images/s pour le dessin, 4 Hz pour les informations facultatives, avec 48 aliments et 12 objets. Le coût de perception est linéaire et borné. Le JavaScript compilé reste autour de 14 Ko gzip. L’émulation Chromium ne remplace pas une mesure de cadence et de batterie sur un appareil Android physique.
