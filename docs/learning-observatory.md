# Observatoire de l’apprentissage — étape 3.5

L’[étape 4.2](consequence-attribution.md#observatoire) ajoute les hypothèses d’attribution réellement conservées et distingue les bilans instrumentaux achevés des absorptions partielles à l’arrêt de vie. Elle ne transforme pas une association en preuve de provenance physique.

L’[étape 4](instrumental-learning.md) étend désormais cet observatoire aux actions instrumentales. Les faits de production, les événements perçus et les relations estimées y sont séparés. Les modèles cognitifs sont sauvegardés, tandis que les séries de diagnostic restent bornées en mémoire. Les garanties ci-dessous décrivent l’instrumentation initiale, conservée pour les aliments et objets existants.

Cette étape applique l’instrumentation recommandée dans le [rapport C3/DS](research/creatures3-engine-study.md#8-feuille-de-route-progressive). Elle n’introduit ni apprentissage causal, ni distributrice, ni nouvelle règle biologique ou cognitive.

## Utilisation

Le bouton **Observatoire de l’apprentissage** ouvre un panneau facultatif sans suspendre le jardin. Fermer le panneau suspend la capture ; la case **Enregistrer l’activité** permet aussi de la suspendre pendant la consultation. L’activation ne modifie pas les préférences ou le hasard. Les dialogues existants continuent de suspendre le jardin ; l’avance explicite de 30 s du laboratoire reste disponible.

Le panneau distingue :

- **Action actuelle**, lue dans l’état du monde.
- **Dernière décision capturée**, horodatée avant déplacement et métabolisme : besoins, motivations, perception et scores réellement utilisés à cet instant.
- **Associations**, lues dans les mémoires conservées : valeur, expériences, dernier bilan et effets attendus des objets.
- **Mesures de capture**, conséquences observées et évolution enregistrées pendant cette session.

Une association sans expérience est **inconnue**, même si sa valeur initiale est zéro. Une association de valeur zéro après une expérience est **neutre après expérience**. Les valeurs positives/négatives sont affichées avec leur signe, sans introduire de seuil de décision ; le panneau biologique existant conserve ses intitulés simplifiés.

Les tableaux numériques complètent les courbes. La chronologie se filtre par type d’événement et se parcourt par pages de 40 entrées ; suspendre la capture stabilise sa consultation.

## Contrat de preuve

| Donnée affichée                          | Origine                                                                                    | Limite                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Perception et motivations d’une décision | Données du véritable appel à `decide`                                                      | Ce n’est pas une perception continue entre deux décisions                               |
| Scores alimentaires                      | Valeurs capturées dans la boucle réellement exécutée                                       | Aucun score des aliments non évalués pendant l’exploration aléatoire                    |
| Arbitrage                                | Score du candidat alimentaire retenu, du repos et des objets, lorsqu’ils sont calculés     | Le retour prioritaire pour faim urgente précède le calcul repos/objets                  |
| Exploration spatiale                     | Action du repli final                                                                      | Elle n’a pas de score ; aucun score n’est inventé                                       |
| Conséquences alimentaires                | Somme des changements d’énergie/santé mesurés à chaque absorption et dose toxique absorbée | Ce n’est pas le bilan net du corps avec dépense, régénération et élimination            |
| Conséquences d’un objet                  | Accumulateur réel `action.changes` transmis à `learnInteraction`                           | Bilan de l’interaction, éventuellement interrompue ; pas une inférence causale générale |
| Changements d’association                | Valeurs avant/après l’appel réel, bilan, plasticité et compteur                            | Attribution directe du moteur, pas attribution causale nouvelle                         |
| Variations nettes                        | Différence des états de fin de tick échantillonnés à une seconde d’intervalle              | Tous les processus sont inclus, sans attribution à l’objet le plus proche               |
| Motivations comparées au laboratoire     | Calcul dérivé des corps actuellement conservés                                             | Ne justifient pas rétroactivement un ancien choix                                       |

La sélection alimentaire puis l’arbitrage sont deux étapes : leurs scores ne doivent pas être confondus. Les valeurs associatives sont affichées sur les candidats où elles ont réellement été lues. Les effets prédits des objets correspondent aux changements bornés utilisés dans la formule, pas à leur composition physique cachée.

Les événements d’un tick sont présentés dans leur ordre d’émission, avec une résolution de 100 ms. L’action de fin de tick est explicitement identifiée ; elle peut différer de l’action choisie au début, par exemple après une ingestion.

### Identifiants et interruptions

Les identifiants d’aliments/objets déjà présents sont conservés. Le diagnostic ajoute des références locales `d…` pour une perception/décision et `b…` pour suivre un bolus. Ces références ne sont ni des gènes ni de nouvelles connaissances de la créature.

Pour un aliment ingéré pendant la capture, le suivi utilise la position du bolus dans la boucle réelle de digestion et son ordre de terminaison, même si plusieurs bolus ont le même signal. Le lien ingestion → absorption → mise à jour correspond au chemin direct du moteur. Il n’est pas étendu à une chaîne de causes extérieures.

Les sauvegardes existantes ne contiennent pas l’identifiant d’origine d’un bolus. Une digestion déjà entamée au début ou à la reprise est donc marquée **partielle, origine inconnue**. Le bilan de renforcement mémorisé peut couvrir une période plus longue que les conséquences détaillées capturées. Les courbes ne relient pas les segments séparés par une interruption.

## Comparer deux individus

Dans le laboratoire, la section **Observatoire · comparer deux individus** permet de sélectionner A et B et de comparer les treize coefficients effectifs, les motivations, les valeurs associatives et leurs compteurs. Les anciens génomes utilisent leurs coefficients physiologiques neutres habituels. L’observatoire n’hérite et ne modifie aucun paramètre.

Les courbes de session permettent aussi de comparer les essais existants : ouvrir l’observatoire, mémoriser un terrain, créer un essai neuf pour chaque profil et avancer successivement chacun du même nombre de ticks. Les essais conservent la mécanique du laboratoire : corps initial et mémoires neutres, originaux préservés, un seul profil actif. Une absence de courbe signifie absence de capture, pas absence d’apprentissage.

Les expériences contrôlées ci-dessous comparent les génomes sur des copies neuves. Elles n’utilisent pas les souvenirs des originaux. Pour étudier l’histoire individuelle, comparer les captures des profils et les essais du laboratoire avec des interventions documentées.

## Quatre protocoles reproductibles

**Exécuter les deux expériences** lance deux copies isolées successivement. Les profils, leur monde et leur RNG restent intacts. Les huit expositions utilisent le même terrain, la même séquence initiale de hasard et les mêmes commandes aux ticks 0, 180, 360, etc. Chaque fenêtre dure 180 ticks ; une baie non consommée est retirée après 100 ticks, laissant le temps de terminer les digestions admises par les génomes actuels.

Avant chaque exposition : position au contact, énergie 10, santé 100, toxines et estomac vides, stimulation 40, fatigue/stress nuls, repos et décision disponible. **Ces réinitialisations sont des interventions expérimentales explicites**, enregistrées comme telles ; les associations sont conservées entre expositions. Aucun appel ne force une ingestion ou ne remplace `decide`.

Le signal solaire sert de stimulus contrôlé commun, sans préférence génétique associée. Chaque dose a une masse de 10.

| Protocole                  | Intervention physique                                      | Observation recherchée                                                     |
| -------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Préférence progressive     | 18 nutriments, aucune toxine, huit fois                    | Valeur initialement nulle puis progression positive                        |
| Aversion alimentaire       | 4 nutriments, 5 toxines, huit fois                         | Valeur négative lorsque le dommage domine le bénéfice                      |
| Changement des effets      | Quatre expositions bénéfiques puis quatre doses modifiées  | Adaptation de la même association ; aucune mémoire effacée à la transition |
| Différences physiologiques | Même dose à 4 nutriments / 5 toxines pour les deux génomes | Conséquences et valeurs pouvant différer à commandes identiques            |

Un individu peu sensible aux toxines peut ne pas former d’aversion : c’est un résultat, pas un échec que l’interface doit corriger. Un refus peut conduire à moins de huit digestions terminées. Les tableaux affichent ticks, compteurs, valeurs et bilans effectifs.

Ces protocoles démontrent les mises à jour dans un cadre contrôlé ; ils ne prouvent pas une stratégie autonome optimale en milieu libre ou un apprentissage causal. Le retour au jardin permet de confronter ces mesures aux choix ordinaires.

## Architecture et budget

- `src/sim/diagnostics.ts` : contrat des événements, séparé de `World`.
- `decisions.ts` : capture optionnelle aux branches de calcul et de retour ; aucun score recalculé par la vue.
- `metabolism.ts` : capture optionnelle des changements réels à l’absorption, sans modifier `Outcome` ou les bolus.
- `world.ts` : émission des ingestions, interactions, mises à jour et états ; signatures optionnelles de `step`/`advance`.
- `src/observatory/recorder.ts` : historique en mémoire avec clés faibles par monde, agrégation des absorptions, segments de capture et liens directs.
- `src/observatory/experiments.ts` : copies expérimentales, hors profils vivants.
- `src/ui/observatory.ts` : panneau, chronologie, courbes accessibles et comparaison.

Par monde capturé : **320 événements, 180 points associatifs et 120 états**. Les absorptions intermédiaires sont additionnées sans créer une entrée par dose. Le dernier instantané de décision est conservé séparément. Le rendu ne travaille que lorsque le panneau est visible et que les données changent ; il ne reconstruit pas la chronologie entière à chaque image.

Les données de diagnostic ne sont pas ajoutées aux sauvegardes, au stockage local ou aux exports des profils. Elles sont perdues au rechargement ; les états biologiques et associations existants restent sauvegardés normalement. Un monde remplacé/importé obtient une nouvelle capture et les anciennes données peuvent être libérées. Aucune nouvelle horloge murale, aucun appel aléatoire et aucun profil vivant supplémentaire ne sont introduits.

Les coûts sont bornés, mais ne constituent pas un benchmark du S25 Ultra. Les vérifications navigateur émulent un Android en portrait et un bureau ; une mesure sur appareil physique reste à effectuer.

## Validation automatisée

`npm test`, `npm run build`, puis `npm run test:e2e` (Chromium Playwright installé, ou `CHROMIUM_PATH` configuré).

Les tests couvrent : parité exacte du monde et du RNG à chaque tick sur plusieurs génomes avec interruptions ; archives et anciens formats ; isolation des charges de diagnostic ; branches réellement évaluées ; neutralité expérimentée ; bolus simultanés de même signal ; captures partielles ; bornes mémoire ; protocoles reproductibles et préférences opposées par physiologie ; accès et consultation en portrait ; comparaison sans modification des originaux. Les tests biologiques existants et leurs fixtures restent la référence indépendante.
