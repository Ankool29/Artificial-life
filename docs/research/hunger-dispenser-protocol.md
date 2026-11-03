# Annexe exécutable : enquête faim et distributrices

Cette annexe accompagne le [rapport](hunger-dispenser-investigation.md) et le [jeu de données](hunger-dispenser-data.json). Elle conserve les programmes d’investigation **dans du Markdown uniquement** ; ils ne font pas partie du moteur, des tests habituels, du build ou du jeu Android.

## Rejouer

Prérequis : une copie du dépôt au commit `ee8cb0fba529ae950cbf3ef6f98ba42002a59731`, ses dépendances de développement (`npm ci`, Node 24 recommandé) et Python 3 avec sa bibliothèque standard. Conserver cette documentation accessible si l’on utilise une autre copie du dépôt pour le rejeu. Aucun service extérieur ni navigateur n’est nécessaire pendant les expériences.

Depuis la racine de cette version du dépôt, extraire les deux sources ci-dessous hors du dépôt :

```bash
python3 - <<'PY'
from pathlib import Path
import re
text = Path('docs/research/hunger-dispenser-protocol.md').read_text()
out = Path('/tmp/luma-hunger-study')
out.mkdir(parents=True, exist_ok=True)
for name, language in [('investigation.test.mjs', 'javascript'), ('summarize.py', 'python')]:
    pattern = r'<!-- source: ' + re.escape(name) + r' -->\n```' + language + r'\n(.*?)\n```'
    match = re.search(pattern, text, re.S)
    if not match:
        raise SystemExit('Source introuvable : ' + name)
    (out / name).write_text(match.group(1) + '\n')
PY
npx vitest run --globals --dir /tmp/luma-hunger-study investigation.test.mjs
python3 /tmp/luma-hunger-study/summarize.py
```

Le module emploie les imports TypeScript du répertoire courant, via Vitest installé par le projet. Il est enregistré comme un test **externe temporaire** pour bénéficier de ce chargeur. Aucun fichier de test n’est ajouté dans `src/` ou `tests/`. Un rejeu contre une version différente du moteur doit être identifié comme une nouvelle étude : la constante `auditedCommit` est une étiquette documentaire, pas une vérification automatique de `HEAD`.

Les sorties se trouvent sous `/tmp/luma-hunger-study` :

- `results.json` : mesures détaillées intermédiaires ;
- `published.json` : données compactes publiées dans cette PR ;
- `summary.json` : agrégats et contrôles développés ;
- sortie standard : résumé des cohortes, contrôles, remplissages et permutations.

Pour un diagnostic rapide uniquement, `LUMA_STUDY_FAST=1` réduit la cohorte à quatre trajectoires modernes ; **ces résultats ne sont pas ceux du rapport**. Le jeu publié utilise `pilot: false`. `LUMA_STUDY_OUT` peut déplacer le fichier intermédiaire ; le programme Python attend le chemin par défaut.

## Plan expérimental et définition des mesures

Le programme crée les trois machines avant les objets, sans enlever les aliments initiaux, pour chaque combinaison de graines, disposition et rotation. Chaque trajectoire dure au maximum 36 000 ticks de 100 ms. Les commandes de placement sont identiques au sein d’une condition de terrain ; la graine génétique moderne ne consomme pas le hasard du monde. La référence v1 est présentée séparément car son génome utilise historiquement le hasard du terrain.

L’observateur reçoit les véritables événements de `step` et les transmet à `LearningObservatory`. Un tableau de provenance externe rapproche les productions physiques, ingestions, absorptions et crédits par leurs identifiants. Il n’est jamais consulté par le moteur. Les compteurs sont exhaustifs pendant l’essai ; les traces détaillées sont volontairement limitées à quelques exemples, aux 30 premières transitions, aux 12 premiers crédits et à des états toutes les 3 000 ticks. La sélection des exemples est « premier rencontré », pas une sélection selon la gravité après analyse.

- **Pression à réserve vide** : stock zéro au moment de l’événement `attempt`, émis avant `pressDevice`. La dernière baie peut déjà être réservée et encore en attente.
- **Ingestion** : événement réel d’ingestion, distinct d’une décision `seek`. Les comptes par recette incluent la nourriture initiale ; `poisonFinal.machineIngested` isole les baies roses issues d’une machine.
- **Crédit négatif correct** : bilan final négatif et mise à jour instrumentale portant sur le véritable producteur, identifié uniquement par le diagnostic.
- **Lien perdu avant ingestion** : une liaison a été constatée pendant une fin de tick, mais aucun épisode utilisable n’est retrouvé lors de l’ingestion. Cette catégorie ne distingue pas toutes les expirations des évictions par les plafonds mémoire.
- **Perdu pendant digestion** : un épisode était disponible à l’ingestion, mais aucun crédit n’a été reçu au bilan final négatif. Les fenêtres et bornes du moteur restent actives.
- **Dernier dommage toxique/famine** : la perte toxique est mesurée aux absorptions ; la variation résiduelle de santé en fin de tick identifie la famine ou la régénération dans cette version. C’est une classification du dernier tick, pas une attribution exclusive du décès.
- **Repli vers rose** : au moins une pression rose après mise à zéro des deux réserves bénéfiques ; un second compteur exige aussi l’absence de nourriture bénéfique au sol. Ce n’est pas une mesure d’ordre strict de préférence.
- **Moyenne de score** : somme divisée par le nombre de candidats effectivement évalués. Les retours urgents et suppressions de candidats ne reçoivent pas de valeurs reconstituées.

Les sondes `staticDecision` standardisent les corps et réemploient les mémoires de fin de trajectoire de 13 références `e00/spaced/r0`. Une paire faim basse/haute diffère seulement par l’énergie. Les interventions mémoire, objets, nombre de machines et réserves sont identiques dans chaque paire. La condition `unknown` conserve les souvenirs d’objets. La répétition de stocks invisibles produit des calculs identiques ; ces répétitions ne sont pas des individus statistiques indépendants.

Pour les sondes alimentaires, deux états RNG sont choisis au moyen d’objets aléatoires locaux, indépendants des mondes : ils fixent la branche exploratoire ou ordinaire sans modifier le gène d’exploration. Cela mesure un chemin de calcul, pas sa fréquence spontanée. La sonde de `P` fait varier une seule estimation sur un clone ; elle n’est pas comptée comme apprentissage naturel.

Les quatre continuations de remplissage repartent du même instantané complet, au premier épuisement des deux réserves bénéfiques avec créature encore vivante. Elles conservent nourriture initiale/restante, livraisons en attente, corps, position, RNG et compteurs. Seuls le remplissage et/ou la neutralisation des deux estimations instrumentales sont appliqués. L’apprentissage reste actif. Le hash avant/après remplissage couvre l’état cognitif, pas les réserves physiques.

La parité de l’observatoire compare les mondes complets à chaque tick pendant 600 ticks, avec capture activée, suspendue puis reprise. Le contrôle vide/recharge compare les états cognitifs pendant 400 ticks ; les réserves et minuteries physiques sont volontairement différentes, les sorties identiques. Ces contrôles portent sur un cas chacun et complètent les tests existants du projet.

## Analyse statistique et format des données

Le script Python calcule les agrégats sans filtrer de trajectoires selon leur issue. Pour les différences individuelles, il retient les 72 trajectoires modernes espacées : 12 génomes, six blocs terrain × rotation. Chaque bloc est centré sur sa moyenne ; une statistique proportionnelle au rapport des variances entre génomes et résiduelles est calculée, puis les étiquettes génétiques sont permutées indépendamment dans chaque bloc. Les p sont `(nombre de statistiques permutées ≥ observée + 1)/(4095 + 1)`, avec correction de Holm pour les deux mesures. Ce n’est pas un test F paramétrique et les blocs ne sont pas des répétitions de graines tirées dans une population Android. Les résultats restent exploratoires.

Les graines privées de permutation sont `26011003` et `26011004`. Les statistiques ne consomment jamais le RNG d’une simulation. Les génomes v1 sont exclus de cette comparaison parce que leur graine est couplée au terrain. Les p et les écarts par génome sont conservés dans `summary.statistics` et `summary.genotypes`.

Le JSON publié contient :

| Champ | Contenu |
| --- | --- |
| `config`, `metadata`, `rngStates` | Commit audité, géométries, graines, horizon, environnement d’exécution, tirages contrôlés |
| `runs` | 156 trajectoires, génomes complets, compteurs, scores par faim, états périodiques et finaux, traces bornées |
| `refills` | 122 checkpoints et leurs quatre continuations, interventions et mesures |
| `matrices` | Sondes de décision sous forme de tuples ; noms des colonnes dans `matrixColumns` |
| `additional`, `biological` | Sondes de P/contexte et contrôle terminal |
| `hidden`, `parity` | Contrôles de perception des réserves et d’innocuité de l’observatoire |
| `examples` | Premiers exemples rencontrés, événements et traces originales |
| `summary` | Agrégats, remplissages, permutations et descriptifs par génome |
| `columns` | Ordre des champs des tuples de transitions, crédits et modèles finaux de remplissage |

Dans une trace compacte, chaque candidat vaut `[étape, typeAction, identifiantCible, score, détailsAssociatifs]`. Un `null` peut signaler une cible absente pour le repos. Les modèles instrumentaux restent par cible et situation. Les nombres sont arrondis après simulation à dix décimales ; la compaction ne change pas les compteurs ni les scores enregistrés. Les schémas décrivent une **annexe de recherche**, sans rapport avec le format des sauvegardes du jeu.

## Sources exactes

Les empreintes SHA-256 des deux sources extraites sont indiquées sous chaque titre pour contrôler une extraction ; les blocs ci-dessous comprennent la source intégrale, sans dépendance de recherche supplémentaire.

### `investigation.test.mjs`

SHA-256 : `1c509b05d07c9365ae54a0bcdf8b9f8101e023e5ad8a533d48f94642e6193c68`.

<!-- source: investigation.test.mjs -->
```javascript
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=process.cwd();
const {createWorld,step,addFood}=await import(`${root}/src/sim/world.ts`);
const {addDispenser,refillDevice}=await import(`${root}/src/sim/devices.ts`);
const {addObject}=await import(`${root}/src/sim/objects.ts`);
const {generateGenome}=await import(`${root}/src/sim/genome.ts`);
const {hunger}=await import(`${root}/src/sim/metabolism.ts`);
const {perceive,perceiveObjects}=await import(`${root}/src/sim/perception.ts`);
const {perceiveActuators,actuatorScores}=await import(`${root}/src/sim/instrumental.ts`);
const {decide}=await import(`${root}/src/sim/decisions.ts`);
const {LearningObservatory}=await import(`${root}/src/observatory/recorder.ts`);
const {motivations}=await import(`${root}/src/sim/curiosity.ts`);
const {createBrain}=await import(`${root}/src/sim/brain.ts`);
const {random}=await import(`${root}/src/sim/random.ts`);
const CUES=['amber','blue','rose'];
const MAX_TICKS=36000;
const config={auditedCommit:'ee8cb0fba529ae950cbf3ef6f98ba42002a59731',maxTicks:MAX_TICKS,geneticSeeds:Array.from({length:12},(_,i)=>`hunger-g${String(i).padStart(2,'0')}`),environmentSeeds:['hunger-e00','hunger-e01'],layouts:{spaced:[[200,290],[400,290],[300,460]],compact:[[260,325],[300,325],[340,325]]},objects:[['chime',300,235],['moss',420,420],['prism',180,420]],rotations:[0,1,2],dt:.1};
const examples={};
const round=(x)=>JSON.parse(JSON.stringify(x,(_k,v)=>typeof v==='number'&&!Number.isInteger(v)?Number(v.toFixed(10)):v));
const hash=(x)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const blank=()=>Object.fromEntries(CUES.map(c=>[c,0]));
const sum=(xs)=>xs.reduce((a,b)=>a+b,0);
const mean=(xs)=>xs.length?sum(xs)/xs.length:null;
function scene(g,e,layout,rotation){
 const w=g==='legacy-v1'?createWorld(e):createWorld(e,generateGenome(g));
 CUES.forEach((cue,i)=>{const p=config.layouts[layout][(i+rotation)%3];addDispenser(w,p[0],p[1],cue);});
 for(const [cue,x,y]of config.objects)addObject(w,cue,x,y);
 return w;
}
function mems(w){return structuredClone(w.instrumental?.memories??[]);}
function body(w){const c=w.creature,m=c.metabolism;return {tick:w.tick,energy:m.energy,health:m.health,toxins:m.toxins,stomach:m.stomach,hunger:hunger(m),needs:structuredClone(c.needs),position:{x:c.x,y:c.y},foodValues:structuredClone(c.brain),models:mems(w),stocks:w.instrumental?.devices.map(d=>({id:d.id,cue:d.recipe.cue,stock:d.stock,pendingAt:d.pendingAt,readyAt:d.readyAt}))};}
function run(w,ticks,{tag='case',captureCheckpoint=false,priorTruth=null,observatory=true}={}){
 const start=w.tick, s=w.instrumental;
 const roles=new Map(s?.devices.map(d=>[d.id,d.recipe.cue])??[]);
 const truth=new Map(priorTruth?structuredClone([...priorTruth]):w.foods.map(f=>[f.id,{id:f.id,cue:f.cue,source:null,ingestedTick:null,complete:false,damage:0,gain:0,toxin:0,foodReward:null,credit:null}]));
 const stats={start,end:null,alive:null,firstDecision:null,firstGoodProduction:null,firstGoodIngestion:null,attempts:blank(),empty:blank(),emptyBelief:{n:0,unknown:0,lowLearnedProbability:0,negativeValue:0,sumProbability:0},cooling:blank(),produced:blank(),ingested:blank(),negativeMeals:blank(),credited:blank(),negativeCredits:blank(),correctNegativeCredits:blank(),attributedInitial:0,wrongDeviceCredits:0,missingCreditReasons:{noEpisodeAtIngestion:0,linkedButNoCredit:0},negativeMissingByCue:Object.fromEntries(CUES.map(c=>[c,{ambiguous:0,linkedThenLostBeforeEating:0,neverLinked:0,lostDuringDigestion:0}])),toxicMachineAfterGoodEmpty:0,toxicMachineAfterGoodEmptyAndFoodAbsent:0,decisions:0,urgentDecisions:0,roseSelections:{scored:0,exploration:0},roseIngestions:{scored:0,exploration:0,unknown:0},damageToxic:0,damageStarvation:0,regeneration:0,minEnergy:w.creature.metabolism.energy,maxToxins:w.creature.metabolism.toxins,minHealth:w.creature.metabolism.health,death:null,firstToxicUse:null,firstToxicMeal:null,phaseCounts:{},phaseStarts:{},ambiguousAppearances:0,scoreBins:Object.fromEntries(['low','medium','high'].map(k=>[k,{decisions:0,actions:{},machines:Object.fromEntries(CUES.map(c=>[c,{n:0,sum:0,min:null,max:null,p:0,value:0}]))}])),emptyEvents:[],transitions:[],credits:[],samples:[]};
 const rec=new LearningObservatory();rec.setEnabled(observatory);const sink=rec.observerFor(w);
 let lastDecision=null,completed=[],beforeHealth=0,toxThisTick=0,checkpoint=null;
 const phase=()=>{const a=s.devices.find(d=>d.recipe.cue==='amber'),b=s.devices.find(d=>d.recipe.cue==='blue');return !a||!b?'single-device':a.stock>0&&b.stock>0?'both-good-stocked':a.stock===0&&b.stock>0?'amber-empty':b.stock===0&&a.stock>0?'blue-empty':'both-good-empty';};
 const phaseRow=()=>{const key=phase();stats.phaseStarts[key]??=w.tick;return stats.phaseCounts[key]??=( {attempts:blank(),produced:blank(),ingested:blank()} );};
 const example=(key,extra={})=>{if(!(key in examples))examples[key]=round({tag,genome:structuredClone(w.creature.genome),state:body(w),decision:lastDecision,...extra});};
 const observe=(e)=>{
  sink?.(e);
  if(e.kind==='decision'){
   lastDecision=e.trace;stats.firstDecision??=e.trace;stats.decisions++;
   const h=e.trace.motivations.hunger,b=stats.scoreBins[h<.33?'low':h>.65?'high':'medium'];b.decisions++;b.actions[e.trace.chosen.kind]=(b.actions[e.trace.chosen.kind]??0)+1;
   if(e.trace.branch==='urgent-food')stats.urgentDecisions++;
   for(const a of e.trace.candidates)if(a.instrumental){const cue=roles.get(a.instrumental.targetId);if(!cue)continue;const m=b.machines[cue];m.n++;m.sum+=a.score;m.min=m.min===null?a.score:Math.min(m.min,a.score);m.max=m.max===null?a.score:Math.max(m.max,a.score);m.p+=a.instrumental.probability;m.value+=a.instrumental.value;}
   if(e.trace.chosen.kind==='seek'&&truth.get(e.trace.chosen.foodId)?.cue==='rose')stats.roseSelections[e.trace.foodPolicy==='exploration'?'exploration':'scored']++;
  }
  if(e.kind==='instrumental'){
   const t=e.trace,cue=roles.get(t.targetId);
   if(t.phase==='perceived'&&t.event==='ambiguous'){stats.ambiguousAppearances++;const f=truth.get(t.foodId);if(f)f.ambiguous=true;}
   if(t.phase==='attempt'&&cue){stats.attempts[cue]++;phaseRow().attempts[cue]++;const d=s.devices.find(d=>d.id===t.targetId);
    if(d.stock===0){stats.empty[cue]++;const m=s.memories.find(m=>m.targetId===d.id&&m.situation===t.situation);stats.emptyBelief.n++;stats.emptyBelief.sumProbability+=m?.probability??0;if(!m?.observations)stats.emptyBelief.unknown++;else if(m.probability<=.05)stats.emptyBelief.lowLearnedProbability++;if(m?.value<0)stats.emptyBelief.negativeValue++;if(stats.emptyEvents.length<6)stats.emptyEvents.push({tick:e.tick,cue,probability:s.memories.find(m=>m.targetId===d.id&&m.situation===t.situation)?.probability,situation:t.situation,pendingAt:d.pendingAt});example('emptyAttempt',{event:e});}
    if(d.readyAt>w.tick)stats.cooling[cue]++;
    if(cue==='rose'){stats.firstToxicUse??=e.tick;if(s.devices.filter(d=>d.recipe.cue!=='rose').every(d=>d.stock===0)){stats.toxicMachineAfterGoodEmpty++;if(!w.foods.some(f=>f.cue!=='rose'))stats.toxicMachineAfterGoodEmptyAndFoodAbsent++;}example('toxicLever',{event:e});}
   }
   if(t.phase==='production'){
    const f=w.foods.find(f=>f.id===t.foodId);if(f){stats.produced[f.cue]++;phaseRow().produced[f.cue]++;if(f.cue!=='rose')stats.firstGoodProduction??=e.tick;truth.set(f.id,{id:f.id,cue:f.cue,source:t.targetId,ingestedTick:null,complete:false,damage:0,gain:0,toxin:0,foodReward:null,credit:null});}
   }
   if(t.phase==='transition'&&stats.transitions.length<30)stats.transitions.push({tick:e.tick,...t});
   if(t.phase==='credit'){
    const f=truth.get(t.foodId);if(f){f.credit={...t,tick:e.tick};stats.credited[f.cue]++;if(t.reward<0){stats.negativeCredits[f.cue]++;if(f.source===t.targetId)stats.correctNegativeCredits[f.cue]++;}if(f.source===null){stats.attributedInitial++;example('initialFoodAttributed',{event:e,physicalFood:f});}else if(f.source!==t.targetId){stats.wrongDeviceCredits++;example('wrongDeviceCredit',{event:e,physicalFood:f});}}
    if(stats.credits.length<12)stats.credits.push({tick:e.tick,foodCue:f?.cue,physicalSource:f?.source,...t});
   }
  }
  if(e.kind==='ingestion'){
   let f=truth.get(e.food.id);if(!f){f={id:e.food.id,cue:e.food.cue,source:null,ingestedTick:null,complete:false,damage:0,gain:0,toxin:0,foodReward:null,credit:null};truth.set(f.id,f);}f.ingestedTick=e.tick;
   const ledger=s.gut.at(-1);f.episodeAtIngestion=ledger?.episodeId??null;
   stats.ingested[f.cue]++;phaseRow().ingested[f.cue]++;if(f.cue!=='rose')stats.firstGoodIngestion??=e.tick;
   if(f.cue==='rose'){stats.firstToxicMeal??=e.tick;const policy=lastDecision?.chosen.kind==='seek'&&lastDecision.chosen.foodId===f.id?lastDecision.foodPolicy:'unknown';stats.roseIngestions[policy==='exploration'?'exploration':policy==='scored'?'scored':'unknown']++;example('toxicIngestion',{foodId:f.id,ingestionTick:e.tick,policy});if(lastDecision?.motivations.hunger>.65)example('hungryToxicIngestion',{foodId:f.id,ingestionTick:e.tick,policy});}
  }
  if(e.kind==='absorption'){
   const id=s.gut[e.trace.slot]?.foodId,f=truth.get(id);toxThisTick-=e.trace.health;stats.damageToxic-=e.trace.health;
   if(f){f.damage-=e.trace.health;f.gain+=e.trace.energy;f.toxin+=e.trace.absorbedToxin;if(e.trace.completed){f.complete=true;completed.push(f);}}
  }
  if(e.kind==='food-learning'){
   const f=completed.shift();if(f){f.foodReward=e.reward;if(e.reward<0)stats.negativeMeals[f.cue]++;if(f.source!==null&&!f.credit){if(f.episodeAtIngestion===null)stats.missingCreditReasons.noEpisodeAtIngestion++;else stats.missingCreditReasons.linkedButNoCredit++;if(f.foodReward<0){const reason=f.episodeAtIngestion!==null?'lostDuringDigestion':f.everLinked?'linkedThenLostBeforeEating':f.ambiguous?'ambiguous':'neverLinked';stats.negativeMissingByCue[f.cue][reason]++;}}}
  }
  if(e.kind==='state'){
   const residual=e.body.health-beforeHealth+toxThisTick;stats.damageStarvation+=Math.max(0,-residual);stats.regeneration+=Math.max(0,residual);
   stats.minEnergy=Math.min(stats.minEnergy,e.body.energy);stats.maxToxins=Math.max(stats.maxToxins,e.body.toxins);stats.minHealth=Math.min(stats.minHealth,e.body.health);
   if(!e.alive){
    const pending=w.creature.metabolism.gut.map((b,i)=>({slot:i,cue:b.cue,remaining:b.remaining,accumulatedReward:b.reward,ledger:structuredClone(s.gut[i]),measured:truth.get(s.gut[i]?.foodId)}));
    const starve=Math.max(0,-residual);stats.death={tick:e.tick,trigger:toxThisTick>0&&starve>0?'mixed-last-tick':toxThisTick>0?'toxic-last-tick':starve>0?'starvation-last-tick':'unclassified',energy:e.body.energy,toxins:e.body.toxins,previousHealth:beforeHealth,toxicDamageLastTick:toxThisTick,starvationDamageLastTick:starve,pendingBoluses:pending};
    if(pending.some(b=>b.cue==='rose'&&b.measured?.damage>0&&!b.measured.complete))example('fatalIncompletePoison',{death:stats.death,history:rec.inspect(w)?.history.slice(-12)});
   }
  }
 };
 for(let i=0;i<ticks&&w.creature.alive;i++){
  beforeHealth=w.creature.metabolism.health;toxThisTick=0;step(w,observe);
  for(const link of s.links){const f=truth.get(link.foodId);if(f){f.everLinked=true;f.firstLinkedTick??=w.tick;}}
  if(w.tick%3000===0){const b=body(w);stats.samples.push({tick:b.tick,energy:b.energy,health:b.health,toxins:b.toxins,hunger:b.hunger,stomach:b.stomach,stocks:b.stocks.map(d=>[d.cue,d.stock]),foodValues:Object.fromEntries(CUES.map(c=>[c,b.foodValues[c].value]))});}
  if(captureCheckpoint&&!checkpoint&&s.devices.filter(d=>d.recipe.cue!=='rose').every(d=>d.stock===0)&&w.creature.alive)checkpoint={world:structuredClone(w),truth:structuredClone(truth),tick:w.tick};
 }
 stats.end=body(w);stats.alive=w.creature.alive;
 const pendingIds=new Set(w.creature.metabolism.gut.map((_,i)=>s.gut[i]?.foodId));
 stats.poisonFinal={machineIngested:[...truth.values()].filter(f=>f.cue==='rose'&&f.source!==null&&f.ingestedTick!==null).length,machineNegativeCompleted:[...truth.values()].filter(f=>f.cue==='rose'&&f.source!==null&&f.foodReward<0).length,machineCompleted:[...truth.values()].filter(f=>f.cue==='rose'&&f.source!==null&&f.complete).length,machineUnfinishedDamaging:[...truth.values()].filter(f=>pendingIds.has(f.id)&&f.cue==='rose'&&f.source!==null&&f.damage>0&&!f.complete).length,completed:[...truth.values()].filter(f=>f.cue==='rose'&&f.complete).length,negativeCompleted:[...truth.values()].filter(f=>f.cue==='rose'&&f.foodReward<0).length,correctNegativeCredits:[...truth.values()].filter(f=>f.cue==='rose'&&f.credit?.reward<0&&f.source===f.credit.targetId).length,unfinishedDamaging:[...truth.values()].filter(f=>pendingIds.has(f.id)&&f.cue==='rose'&&f.damage>0&&!f.complete).length};
 stats.historyTail=rec.inspect(w)?.history.slice(-4)??[];
 return {stats,checkpoint,truth,world:w};
}
function staticDecision(source,{energy=80,food='none',objects=true,onlyToxic=false,stock='full',memory='learned',rng=1234567890,needs={stimulation:40,fatigue:20,stress:5}}={}){
 const w=structuredClone(source);w.creature.x=300;w.creature.y=340;w.creature.alive=true;w.creature.needs={...needs};Object.assign(w.creature.metabolism,{energy,health:100,toxins:0,stomach:0,gut:[]});w.instrumental.gut=[];w.instrumental.episodes=[];w.instrumental.links=[];w.foods=[];w.rng=rng;
 if(!objects)w.objects=[];
 if(onlyToxic)w.instrumental.devices=w.instrumental.devices.filter(d=>d.recipe.cue==='rose');
 for(const d of w.instrumental.devices){d.pendingAt=null;d.readyAt=0;d.stock=d.capacity;}
 if(memory==='unknown'){w.instrumental.memories=[];w.creature.brain=createBrain();}
 if(memory==='food-neutral')w.creature.brain=createBrain();
 if(memory==='instrument-value-neutral')for(const m of w.instrumental.memories){m.probability=0;m.value=0;}
 const ranked=actuatorScores(w,perceiveActuators(w),perceive(w.creature,w.foods),motivations(w.creature).curiosity).filter(a=>w.instrumental.devices.find(d=>d.id===a.target.id)?.recipe.cue!=='rose').sort((a,b)=>b.score-a.score);
 const preferredTargetId=ranked[0]?.target.id??null;
 for(const d of w.instrumental.devices)if((stock==='preferred-empty'&&d.id===preferredTargetId)||(stock==='beneficial-empty'&&d.recipe.cue!=='rose'))d.stock=0;
 if(food==='rose')addFood(w,'rose',320,340);
 let trace;const before=w.rng;
 decide(w,perceive(w.creature,w.foods),perceiveObjects(w),t=>{trace=t;},perceiveActuators(w));
 return {energy,food,objects,onlyToxic,stock,memory,needs,preferredTargetId,rngBefore:before,rngAfter:w.rng,trace,models:mems(w),foodValues:structuredClone(w.creature.brain),machineRoles:w.instrumental.devices.map(d=>({id:d.id,cue:d.recipe.cue}))};
}
function rngFor(exploration){for(let rng=1;rng<10000;rng++){const x={rng},u=random(x);if(exploration?u<.01:u>.99)return {rng,u};}throw Error('rng not found');}
function biologicalControls(){
 const low=scene('hunger-g00','terminal-poison','spaced',0);low.foods=[];low.objects=[];low.instrumental.devices=low.instrumental.devices.filter(d=>d.recipe.cue==='rose');const d=low.instrumental.devices[0];d.x=335;d.y=340;low.creature.metabolism.energy=30;low.creature.metabolism.health=1;
 const high=structuredClone(low);high.creature.metabolism.health=100;
 return {lowHealth:run(low,300,{tag:'terminal-low-health'}).stats,highHealth:run(high,300,{tag:'terminal-high-health'}).stats};
}
function memoryView(w){return {creature:w.creature,rng:w.rng,tick:w.tick,memories:w.instrumental.memories,episodes:w.instrumental.episodes,links:w.instrumental.links,gut:w.instrumental.gut,seenFoods:w.instrumental.seenFoods};}
function hiddenPhysicsControl(source){
 const a=structuredClone(source),b=structuredClone(source);for(const w of[a,b]){w.foods=[];w.objects=[];w.instrumental.episodes=[];w.instrumental.links=[];w.creature.metabolism.gut=[];w.creature.metabolism.stomach=0;w.instrumental.gut=[];w.creature.nextDecision=w.tick;w.creature.action={kind:'rest'};}
 for(const d of a.instrumental.devices){d.stock=0;d.pendingAt=null;}
 for(const d of b.instrumental.devices){d.stock=d.capacity;d.pendingAt=null;d.readyAt=b.tick+10000;}
 let equal=true;for(let i=0;i<400&&a.creature.alive;i++){step(a);step(b);if(hash(memoryView(a))!==hash(memoryView(b)))equal=false;}
 return {ticks:a.tick-source.tick,cognitivePathsIdentical:equal,emptyMemories:mems(a),coolingMemories:mems(b)};
}
function observerParity(source){const a=structuredClone(source),b=structuredClone(source),o=new LearningObservatory();let equal=true;for(let t=0;t<600&&a.creature.alive;t++){if(t%100===0)o.setEnabled(t%300!==100);step(a);step(b,o.observerFor(b));if(hash(a)!==hash(b)){equal=false;break;}}return {identical:equal,ticks:a.tick-source.tick};}
function refillProbes(checkpoint,tag){
 const rows=[];
 for(const neutralize of[false,true])for(const refill of[false,true]){
  const w=structuredClone(checkpoint.world);if(neutralize)for(const m of w.instrumental.memories){m.value=0;m.probability=0;}
  const before=hash(memoryView(w));if(refill)for(const d of w.instrumental.devices)if(d.recipe.cue!=='rose')refillDevice(w,d.id);
  const after=hash(memoryView(w));
  const measured=run(w,1800,{tag:`${tag}/refill-${refill}/neutralize-${neutralize}`,priorTruth:checkpoint.truth});
  rows.push({refill,neutralize,sourceTick:checkpoint.tick,interventionPreservesCognition:before===after,stats:{attempts:measured.stats.attempts,empty:measured.stats.empty,produced:measured.stats.produced,ingested:measured.stats.ingested,alive:measured.stats.alive,end:measured.stats.end,firstDecision:measured.stats.firstDecision,firstGoodProduction:measured.stats.firstGoodProduction,firstGoodIngestion:measured.stats.firstGoodIngestion}});
 }
 return rows;
}
function briefDecision(row){
 const t=row.trace??row;
 return {tick:t.tick,chosen:t.chosen,branch:t.branch,foodPolicy:t.foodPolicy,motivations:t.motivations,needs:t.needs,energy:t.energy,stomach:t.stomach,foods:t.foods.map(f=>({id:f.id,cue:f.cue,distance:f.distance})),scores:t.candidates.map(c=>({stage:c.stage,action:c.action,score:c.score,...(c.association?{association:c.association}:{}),...(c.instrumental?{instrumental:c.instrumental}:{})}))};
}
function additionalControls(saved){
 const sweeps=[];const source=saved.find(({world:w})=>w.instrumental.memories.some(m=>m.situation==='clear'&&m.value<0&&w.instrumental.devices.find(d=>d.id===m.targetId)?.recipe.cue==='rose'));
 if(source){
  const target=source.world.instrumental.devices.find(d=>d.recipe.cue==='rose').id;
  for(const probability of[0,.05,.2,.5,1]){const w=structuredClone(source.world);w.instrumental.memories.find(m=>m.targetId===target&&m.situation==='clear').probability=probability;const row=staticDecision(w,{objects:false,energy:10,needs:{stimulation:0,fatigue:0,stress:0}});sweeps.push({source:source.tag,probability,target,trace:briefDecision(row.trace)});}
 }
 const context=[];
 if(source){for(const visible of[false,true]){
  const w=structuredClone(source.world);w.creature.x=300;w.creature.y=340;w.creature.needs={stimulation:0,fatigue:0,stress:0};Object.assign(w.creature.metabolism,{energy:95,stomach:0,gut:[],health:100,toxins:0});w.creature.alive=true;w.objects=[];w.foods=[];w.instrumental.gut=[];w.instrumental.links=[];w.instrumental.episodes=[];
  const target=w.instrumental.devices.find(d=>d.recipe.cue==='rose');if(visible)addFood(w,'blue',target.x+22,target.y);
  let trace;decide(w,perceive(w.creature,w.foods),[],t=>trace=t,perceiveActuators(w));context.push({source:source.tag,resourceNearToxic:visible,trace:briefDecision(trace)});
 }}
 return {negativeValueProbabilitySweep:sweeps,context};
}
const pilot=process.env.LUMA_STUDY_FAST==='1';
test('documentation-only investigation against the unchanged engine',()=>{
 const runs=[],refills=[],matrices=[],saved=[];
 for(const g of (pilot?config.geneticSeeds.slice(0,2):[...config.geneticSeeds,'legacy-v1']))for(const e of config.environmentSeeds.slice(0,pilot?1:2))for(const layout of Object.keys(config.layouts))for(const rotation of config.rotations.slice(0,pilot?1:3)){
  const tag=`${g}/${e}/${layout}/r${rotation}`,w=scene(g,e,layout,rotation);
  const result=run(w,MAX_TICKS,{tag,captureCheckpoint:true});
  result.stats.firstDecision=briefDecision(result.stats.firstDecision);
  runs.push({tag,geneticSeed:g,environmentSeed:e,layout,rotation,genome:structuredClone(w.creature.genome),stats:result.stats});
  saved.push({tag,world:structuredClone(w)});
  if(result.checkpoint)refills.push({tag,checkpoint:body(result.checkpoint.world),rows:refillProbes(result.checkpoint,tag)});
  if(layout==='spaced'&&e===config.environmentSeeds[0]&&rotation===0){
   for(const memory of['learned','unknown','food-neutral','instrument-value-neutral'])for(const objects of[false,true])for(const onlyToxic of[false,true])for(const stock of['full','preferred-empty','beneficial-empty'])for(const energy of[80,10])matrices.push({tag,...staticDecision(w,{energy,objects,onlyToxic,stock,memory,rng:rngFor(false).rng})});
   for(const policy of['scored','exploration'])for(const memory of['learned','unknown'])for(const energy of[80,10])matrices.push({tag,forcedDraw:policy,...staticDecision(w,{energy,food:'rose',objects:false,memory,rng:rngFor(policy==='exploration').rng})});
  }
 }
 for(const m of matrices){m.trace=briefDecision(m.trace);delete m.models;}
 for(const group of refills)for(const row of group.rows)if(row.stats.firstDecision)row.stats.firstDecision=briefDecision(row.stats.firstDecision);
 const additional=additionalControls(saved);
 const biological=biologicalControls();
 const controlSource=scene(config.geneticSeeds[0],config.environmentSeeds[0],'spaced',0);
 const hidden=hiddenPhysicsControl(controlSource),parity=observerParity(controlSource);
 expect(hidden.cognitivePathsIdentical).toBe(true);expect(parity.identical).toBe(true);
 const result={config,metadata:{node:process.versions.node,v8:process.versions.v8,platform:process.platform,arch:process.arch,pilot},rngStates:{scored:rngFor(false),exploration:rngFor(true)},runs,refills,matrices,additional,biological,hidden,parity,examples};
 const path=process.env.LUMA_STUDY_OUT??'/tmp/luma-hunger-study/results.json';writeFileSync(path,JSON.stringify(round(result),null,2)+'\n');
 console.log(JSON.stringify({path,runs:runs.length,eligibleRefills:refills.length,deaths:runs.filter(r=>!r.stats.alive).length,terminalPoison:[biological.lowHealth.death,biological.highHealth.death]},null,2));
},180000);
```

### `summarize.py`

SHA-256 : `f36a734482eeae9738f5f5f2a5b7e15e19ee6d4630c6e782ea904525e6b27945`.

<!-- source: summarize.py -->
```python
import json, math, random, statistics, hashlib
from pathlib import Path
root=Path('/tmp/luma-hunger-study')
p=json.loads((root/'results.json').read_text())
cues=['amber','blue','rose']
mean=lambda xs:sum(xs)/len(xs) if xs else None
summaries=[]
for version in ['modern','legacy']:
 for layout in p['config']['layouts']:
  rs=[r for r in p['runs'] if (r['geneticSeed']=='legacy-v1')==(version=='legacy') and r['layout']==layout]
  if not rs:continue
  ds=[r['stats']['death'] for r in rs if r['stats']['death']]
  bycause={c:sum(d['trigger']==c for d in ds)for c in ['toxic-last-tick','starvation-last-tick','mixed-last-tick','unclassified']}
  fatal_machine=sum(any(b['cue']=='rose' and b.get('measured',{}).get('source') is not None and b.get('measured',{}).get('damage',0)>0 for b in d['pendingBoluses']) for d in ds if d['trigger']=='toxic-last-tick')
  summaries.append(dict(version=version,layout=layout,n=len(rs),alive=sum(r['stats']['alive']for r in rs),deaths=bycause,fatalPoisonFromMachine=fatal_machine,meanLifeSeconds=mean([r['stats']['end']['tick']/10 for r in rs]),attempts={c:mean([r['stats']['attempts'][c]for r in rs])for c in cues},emptyAttempts=sum(sum(r['stats']['empty'].values())for r in rs),emptyBelief={k:sum(r['stats']['emptyBelief'][k]for r in rs)for k in ['n','unknown','lowLearnedProbability','negativeValue','sumProbability']},produced={c:sum(r['stats']['produced'][c]for r in rs)for c in cues},ingested={c:sum(r['stats']['ingested'][c]for r in rs)for c in cues},fallbackCases=sum(r['stats']['toxicMachineAfterGoodEmpty']>0 for r in rs),fallbackWithoutGoodFoodCases=sum(r['stats']['toxicMachineAfterGoodEmptyAndFoodAbsent']>0 for r in rs),wrongDeviceCredits=sum(r['stats']['wrongDeviceCredits']for r in rs),initialFoodCredits=sum(r['stats']['attributedInitial']for r in rs),ambiguousAppearances=sum(r['stats']['ambiguousAppearances']for r in rs),unfinishedDamagingPoisonAtDeath=sum(r['stats']['poisonFinal']['unfinishedDamaging']>0 for r in rs),machineNegativeCompleted=sum(r['stats']['poisonFinal']['machineNegativeCompleted']for r in rs),correctNegativeCredits=sum(r['stats']['poisonFinal']['correctNegativeCredits']for r in rs),negativeMissingRose={k:sum(r['stats']['negativeMissingByCue']['rose'][k]for r in rs)for k in ['ambiguous','linkedThenLostBeforeEating','neverLinked','lostDuringDigestion']},toxicDamage=sum(r['stats']['damageToxic']for r in rs),starvationDamage=sum(r['stats']['damageStarvation']for r in rs)))
# Paired counterfactuals: only energy is changed inside each pair.
pairs={}
for m in p['matrices']:
 key=tuple(m.get(k)for k in ['tag','food','objects','onlyToxic','stock','memory','forcedDraw'])
 pairs.setdefault(key,{})[m['energy']]=m
pairs=[(v[80],v[10])for v in pairs.values()if set(v)=={80,10}]
nofood=[(a,b)for a,b in pairs if a['food']=='none']
score_deltas=[]; changed=[]; foodcontrols=[]
def machine_scores(m):return {x['instrumental']['targetId']:x['score']for x in m['trace']['scores']if 'instrumental'in x}
for a,b in nofood:
 sa,sb=machine_scores(a),machine_scores(b)
 score_deltas.extend(abs(sa[k]-sb[k])for k in sa if k in sb)
 if a['trace']['chosen']!=b['trace']['chosen']:changed.append({'tag':a['tag'],'objects':a['objects'],'memory':a['memory'],'onlyToxic':a['onlyToxic'],'stock':a['stock'],'low':a['trace'],'high':b['trace']})
for a,b in pairs:
 if a['food']=='rose':foodcontrols.append({'tag':a['tag'],'draw':a.get('forcedDraw'),'memory':a['memory'],'foodValue':a['foodValues']['rose'],'lowChoice':a['trace']['chosen']['kind'],'highChoice':b['trace']['chosen']['kind'],'lowPolicy':a['trace']['foodPolicy'],'highPolicy':b['trace']['foodPolicy'],'lowBranch':a['trace']['branch'],'highBranch':b['trace']['branch'],'low':a['trace'],'high':b['trace']})
refillSummary=[]
for neutral in [False,True]:
 for refill in [False,True]:
  rows=[next(r for r in group['rows']if r['neutralize']==neutral and r['refill']==refill)for group in p['refills']]
  if rows:refillSummary.append({'neutralized':neutral,'refill':refill,'n':len(rows),'cognitionPreserved':all(r['interventionPreservesCognition']for r in rows),'meanProduced':{c:mean([r['stats']['produced'][c]for r in rows])for c in cues},'meanIngested':{c:mean([r['stats']['ingested'][c]for r in rows])for c in cues},'meanAttempts':{c:mean([r['stats']['attempts'][c]for r in rows])for c in cues},'alive':sum(r['stats']['alive']for r in rows)})
# Exploratory blocked permutation: 12 modern genomes x (2 environments x 3 rotations).
permutation=[]
rs=[r for r in p['runs']if r['layout']=='spaced'and r['geneticSeed']!='legacy-v1']
seeds=p['config']['geneticSeeds']
for metric in ['lifeTicks','toxicMeals']:
 blocks={}
 for r in rs:blocks.setdefault((r['environmentSeed'],r['rotation']),{})[r['geneticSeed']]=r['stats']['end']['tick']if metric=='lifeTicks'else r['stats']['ingested']['rose']
 mat=[]
 for block in blocks.values():
  row=[block[g]for g in seeds]; mu=mean(row);mat.append([v-mu for v in row])
 n=len(seeds);b=len(mat);total=sum(v*v for row in mat for v in row)
 def f(rows):
  means=[sum(row[i]for row in rows)/b for i in range(n)];between=b*sum(v*v for v in means);within=max(0,total-between)
  return (between/(n-1))/(within/(n*b-n))if within else (math.inf if between else 0)
 observed=f(mat);rng=random.Random(26011003+(metric=='toxicMeals'));ge=0;trials=4095
 for _ in range(trials):
  shuffled=[]
  for row in mat:copy=row.copy();rng.shuffle(copy);shuffled.append(copy)
  ge+=f(shuffled)>=observed-1e-12
 permutation.append({'metric':metric,'nGenotypes':n,'nBlocks':b,'statisticF':observed,'permutations':trials,'seed':26011003+(metric=='toxicMeals'),'pRaw':(ge+1)/(trials+1)})
maximum=0
for i,x in enumerate(sorted(permutation,key=lambda x:x['pRaw'])):maximum=max(maximum,min(1,(len(permutation)-i)*x['pRaw']));x['pHolm']=maximum
# Per-genome summaries retain censoring/causes in the full cohort records.
genotypes=[]
for g in seeds:
 rows=[r for r in rs if r['geneticSeed']==g]
 genotypes.append({'geneticSeed':g,'n':len(rows),'lifeSeconds':mean([r['stats']['end']['tick']/10 for r in rows]),'toxicMeals':mean([r['stats']['ingested']['rose']for r in rows]),'toxicDeaths':sum(r['stats']['death']['trigger']=='toxic-last-tick'for r in rows),'toxinSensitivity':rows[0]['genome']['genes']['toxinSensitivity'],'exploration':rows[0]['genome']['genes']['exploration']})
summary={'cohorts':summaries,'controls':{'pairedNoFood':len(nofood),'actualMachineScoresCompared':len(score_deltas),'maxAbsoluteMachineScoreDelta':max(score_deltas,default=0),'changedNoFoodActions':len(changed),'changedWithoutObjects':sum(not r['objects']for r in changed),'changedWithObjects':sum(r['objects']for r in changed),'firstChanged':changed[:2],'foodControls':foodcontrols,'hiddenPhysics':p['hidden'],'observerParity':p['parity']},'refill':refillSummary,'statistics':permutation,'genotypes':genotypes,'additional':p['additional'],'biological':p['biological'],'examples':p['examples']}
# Compact documentation dataset; every count and recorded score is retained.
published=json.loads(json.dumps(p))
for row in published['runs']:
 s=row['stats'];s.pop('historyTail',None)
 s['transitions']=[[t.get(k)for k in ['tick','targetId','situation','event','beforeProbability','probability','value']]for t in s['transitions']]
 s['credits']=[[t.get(k)for k in ['tick','foodCue','physicalSource','targetId','reward','eligibility','beforeValue','value','probability']]for t in s['credits']]
matrixColumns=['tag','energy','memory','objects','onlyToxic','stock','food','forcedDraw','preferredTargetId','rngBefore','rngAfter','decisionTick','chosen','branch','foodPolicy','hunger','scores','foodValues']
compact=[]
for row in published['matrices']:
 t=row['trace'];scores=[]
 for a in t['scores']:
  act=a['action'];details=a.get('instrumental') or a.get('association') or {}
  scores.append([a['stage'],act['kind'],act.get('targetId',act.get('objectId',act.get('foodId'))),a['score'],details])
 compact.append([row.get(k)for k in matrixColumns[:11]]+[t['tick'],t['chosen'],t['branch'],t['foodPolicy'],t['motivations']['hunger'],scores,{c:[row['foodValues'][c]['value'],row['foodValues'][c]['meals']]for c in cues}])
published['matrices']=compact
published['matrixColumns']=matrixColumns

# Initial decisions are retained as compact executed traces; input locations are in config.
def short_trace(t):
 if not t:return None
 scores=[]
 for a in t.get('scores',[]):
  act=a['action'];d=a.get('instrumental') or a.get('association') or {}
  scores.append([a['stage'],act['kind'],act.get('targetId',act.get('objectId',act.get('foodId'))),a['score'],d])
 return {'tick':t['tick'],'chosen':t['chosen'],'branch':t['branch'],'foodPolicy':t['foodPolicy'],'hunger':t['motivations']['hunger'],'scores':scores}
for r in published['runs']:r['stats']['firstDecision']=short_trace(r['stats']['firstDecision'])
for group in published['refills']:
 for row in group['rows']:
  row['stats']['firstDecision']=short_trace(row['stats']['firstDecision'])
  end=row['stats']['end']
  row['stats']['end']={k:end[k]for k in ['tick','energy','health','toxins','hunger','position','foodValues']}
  row['stats']['end']['models']=[[m.get(k)for k in ['targetId','situation','probability','value','attempts','observations','successes','outcomes','lastReward']]for m in end['models']]

published['columns']={'transitions':['tick','targetId','situation','event','beforeProbability','probability','value'],'credits':['tick','foodCue','physicalSource','targetId','reward','eligibility','beforeValue','value','probability'],'refillModels':['targetId','situation','probability','value','attempts','observations','successes','outcomes','lastReward']}
published['summary']={k:v for k,v in summary.items()if k not in ['controls','biological','examples','additional']}
published['summary']['controls']={k:v for k,v in summary['controls'].items()if k not in ['foodControls','firstChanged','hiddenPhysics']}
def dump(obj,path):Path(path).write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n')
dump(published,root/'published.json');dump(summary,root/'summary.json')
print(json.dumps({'cohorts':summaries,'controls':{k:v for k,v in summary['controls'].items()if k not in ['foodControls','firstChanged','hiddenPhysics']},'refill':refillSummary,'statistics':permutation,'publishedBytes':(root/'published.json').stat().st_size},ensure_ascii=False,indent=2))
```
