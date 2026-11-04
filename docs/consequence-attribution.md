# Attribution des conséquences — étape 4.2

Luma conserve maintenant la trace d’une ressource reconnue jusqu’à son ingestion, puis avec sa digestion. Une baie ramassée longtemps après sa production peut ainsi modifier la valeur de l’action antérieure. La créature ne reçoit toujours pas l’identité cachée de la machine productrice.

## Ce qui change

L’ancien épisode faisait deux métiers : attendre une apparition et conserver son origine possible jusqu’au bilan biologique. Son expiration à 90 secondes pouvait couper une chaîne pourtant observée. Les deux fonctions sont désormais séparées :

1. **Action récente** : la fenêtre d’observation reste de cinq secondes, avec le même voisinage de 40 unités. Une absence n’est apprise que si cette fenêtre a été couverte.
2. **Ressource reconnue** : une petite trace conserve les actions compatibles, leur situation et leur date. Elle utilise l’identité déjà disponible dans la perception, sans lire la provenance physique. Sortir du champ visuel puis revenir ne constitue plus une nouvelle apparition du même aliment.
3. **Ingestion et digestion** : la trace passe avec le bolus. Elle ne dépend plus de la présence de l’ancien épisode dans le petit tampon des actions récentes.
4. **Conséquence** : le bilan biologique réel modifie la valeur instrumentale si une seule action reste compatible. L’éligibilité temporelle porte sur le délai **action → apparition observée** ; attendre avant de manger ne détruit plus l’identité de la chaîne.

Les apparitions d’un même tick sont examinées ensemble. Une action peut expliquer au plus une apparition dans ce modèle. Si deux ressources peuvent venir de deux actions, une seconde observation peut exclure une alternative. Si les informations restent insuffisantes, plusieurs hypothèses subsistent et aucun levier ne reçoit de crédit biologique. Deux apparitions simultanées pour une seule action possible sont également laissées sans attribution.

Ce raisonnement est une contrainte d’association, pas une preuve de causalité. Une baie déposée par hasard juste après l’action d’un levier vide peut encore créer une fausse association. Un futur objet produisant plusieurs ressources par action nécessitera une autre représentation de ses événements.

## Conséquences négatives et arrêt de vie

La digestion et les associations alimentaires gardent leurs règles. Au décès, les changements déjà absorbés des bolus inachevés peuvent fournir un **bilan instrumental partiel**, une seule fois. Aucun dommage futur, aucune pénalité de mort et aucune cause cachée ne sont ajoutés. Un repas bénéfique et un repas toxique interrompus ensemble conservent leurs bilans séparés.

Ce bilan ne sauve pas l’individu : il est enregistré à l’arrêt de vie. L’association alimentaire d’un bolus inachevé n’est pas modifiée. La faim, l’exploration alimentaire et la curiosité peuvent toujours conduire à des consommations risquées ou à des essais sur un levier vide.

## Observatoire

Le panneau facultatif des distributrices distingue désormais les bilans achevés des bilans partiels. **Chaînes observées et ambiguïtés** montre les identités d’aliments, les actions compatibles et les attributions suspendues. Les 24 dernières chaînes sont présentées ; cette limite ne supprime pas les traces du moteur. La chronologie indique aussi les abandons pour manque de budget et les conséquences sans attribution.

L’indice de confiance diagnostique `1 / nombre d’actions compatibles` n’est pas une probabilité causale calibrée. Le score de choix continue à utiliser les véritables P et V mémorisés ; aucun score fictif n’est ajouté à l’interface.

## Sauvegardes et budgets

L’extension instrumentale passe en version 2 ; la version du monde et les génomes restent inchangés. Les anciennes extensions v1 sont validées puis migrées sans tirage aléatoire et sans modifier les associations ou la biologie. Les liens déjà perdus dans une ancienne sauvegarde ne sont pas reconstruits. Une date d’apparition absente d’une ancienne digestion reste inconnue ; son éligibilité utilise la borne conservatrice de l’ancienne fenêtre d’observation.

Budgets : 12 épisodes récents, 16 mémoires, au plus 48 traces de ressources et 48 traces riches de digestion, avec quatre hypothèses chacune. Les références complètes en cours de digestion sont protégées ; à saturation, une nouvelle trace est laissée inconnue plutôt que de choisir une hypothèse tronquée. Les entrées sans preuve suivent les bolus biologiques sans bloquer leur ingestion. La limite globale des sauvegardes reste 100 000 caractères.

Une action non enregistrable conserve un marqueur d’incertitude pendant la fenêtre d’observation ; elle ne disparaît pas des causes possibles au profit d’un autre levier. Les conflits restent attachés aux alternatives concernées, même si une ressource disparaît ou si sa trace ne peut plus être conservée.

Le nombre de repas partiellement digérés n’était pas réellement limité à quatre par la physiologie. Le validateur n’impose plus cette fausse limite : il vérifie les bolus, leur masse totale et la taille globale de la sauvegarde. Ce changement ne modifie ni le débit digestif ni les conditions d’ingestion.

## Résultats et vérification

Le [rapport scientifique](research/consequence-attribution-study.md) publie les effectifs, les mesures brutes, les faux positifs, les régressions et les commandes de reproduction. Sur les génomes modernes étudiés, l’attribution des repas toxiques achevés passe de 43,4 à 100 % en disposition espacée, et de 2,7 à 83,7 % en compacte. Aucune fausse attribution n’est mesurée dans ces trajectoires ; les contrôles de coïncidence montrent explicitement que cela ne garantit pas l’absence universelle de faux positifs.

Les tentatives à vide peuvent augmenter et aucune amélioration générale de la survie n’est démontrée. Les tests existants de biologie, de génétique et de laboratoire restent actifs, avec des tests supplémentaires sur les chaînes, les ambiguïtés, les migrations et le navigateur.
