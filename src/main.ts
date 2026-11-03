import "./style.css";
import {
  activeProfile,
  createLaboratory,
  deserializeLaboratory,
  MAX_LAB_BYTES,
  replaceActiveWorld,
  serializeLaboratory,
} from "./lab/laboratory";
import { createLaboratoryDialog } from "./ui/laboratory";
import { createObservatoryPanel } from "./ui/observatory";
import { LearningObservatory } from "./observatory/recorder";
import { generateGenome, physiology, GENE_LABELS } from "./sim/genome";
import { hunger } from "./sim/metabolism";
import { motivations } from "./sim/curiosity";
import { addObject, removeObject } from "./sim/objects";
import { addDispenser, refillDevice, removeDevice } from "./sim/devices";
import { OBJECT_COLORS, OBJECT_NAMES } from "./ui/object-info";
import { deserialize, serialize } from "./sim/persistence";
import { addFood, createWorld, step } from "./sim/world";
import {
  CUES,
  DT,
  MAX_FOODS,
  MAX_OBJECTS,
  OBJECT_CUES,
  type Cue,
  type ObjectCue,
} from "./sim/types";
import { COLORS, NAMES, Renderer } from "./ui/renderer";

const icons = {
  leaf: '<path d="M19 3C8 3 3 7 5 14c1 4 8 6 11 1 2-3 1-6 3-12Z"/><path d="m4 21 9-12"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 12 7-12 7Z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
  arrow: '<path d="m8 5 7 7-7 7"/>',
};
const icon = (name: keyof typeof icons): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="Luma, accueil"><span class="brand-icon">${icon("leaf")}</span><span>luma<span class="brand-dot">.</span></span></a>
    <span class="header-caption">UN PETIT MONDE QUI APPREND</span>
    <div class="header-actions"><button class="icon-button" id="help" aria-label="Comment jouer">${icon("help")}</button><button class="icon-button" id="storage" aria-label="Sauvegardes et nouveau monde">${icon("save")}</button></div>
  </header>
  <main>
    <div class="intro"><div><p class="eyebrow">EXPÉRIENCE 003 · VIE ARTIFICIELLE</p><h1>Le jardin vivant<span>.</span></h1><p class="subtitle">Prenez soin de Milo. Laissez la vie faire le reste.</p></div><span class="prototype"><i></i> Prototype vivant</span></div>
    <div class="laboratory-entry"><span id="active-individual">Individu actif · Milo</span><button id="open-lab">Ouvrir le laboratoire <span aria-hidden="true">↗</span></button></div>
    <div class="workspace">
      <section class="garden-card" aria-label="Terrarium de Milo">
        <div class="garden-heading"><span><i class="live-dot"></i> TERRARIUM <span class="muted">/ 01</span></span><span id="clock">00:00</span></div>
        <div class="arena"><canvas id="world" aria-label="Jardin interactif : touchez pour déposer l’aliment ou l’objet sélectionné. Milo se déplace de façon autonome."></canvas><div class="arena-label"><span class="tiny-label">ÉCOSYSTÈME OUVERT</span><span>Une vie, mille possibilités.</span></div><div class="status-pill" id="status">Milo découvre son jardin</div><div class="end-state" id="end-state" hidden><span>Une petite vie s’est éteinte.</span><p>La faim ou les toxines ont épuisé Milo.</p><button id="restart">Faire éclore une nouvelle vie ${icon("arrow")}</button></div></div>
        <div class="garden-controls"><div class="time-controls"><button id="pause" class="icon-button" aria-label="Mettre en pause">${icon("pause")}</button><span class="divider"></span><button id="speed" class="speed" aria-label="Vitesse de simulation : 1 fois">1×</button></div><button id="inspect" class="inspect-button" aria-expanded="false" aria-controls="biology">${icon("eye")} Observer Milo</button></div><div class="food-dock" id="food-dock"></div>
      </section>
      <aside class="side-column">
        <section class="care-card"><div class="section-heading"><span class="eyebrow">À VOUS DE CULTIVER</span><span class="step-number">01 — 03</span></div><h2>De petites attentions.<br> De grandes découvertes.</h2><p>Milo explore, mange et apprend de ses expériences. Repas et rencontres laissent une trace.</p><div class="care-instruction"><span class="instruction-icon">✦</span><p>Choisissez un aliment ou un objet, puis <strong>touchez le jardin</strong> pour le déposer.</p></div><div class="food-picker" role="group" aria-label="Aliment à déposer">${CUES.map((cue, index) => `<button class="food-choice ${index === 0 ? "selected" : ""}" data-cue="${cue}" aria-pressed="${index === 0}" aria-label="${NAMES[cue]}"><span class="food-art ${cue}"></span><span>${NAMES[cue].split(" ").slice(0, -1).join(" ")}<br> ${NAMES[cue].split(" ").at(-1)}</span><span class="selection-dot"></span></button>`).join("")}</div><div class="food-footer"><span id="food-count">12 / 48 aliments</span><button id="scatter" class="text-button">Semer un trio <span>+</span></button></div></section>
        <section id="biology" class="biology-card" hidden><div class="section-heading"><span class="eyebrow">SOUS LA SURFACE</span><button id="close-inspector" class="icon-button" aria-label="Fermer l’observation">${icon("close")}</button></div><div class="creature-title"><h2>Milo</h2><span id="age">0 min de vie</span></div><div id="vitals"></div><div class="memory-heading"><h3>Mémoire des saveurs</h3><span id="meal-count">0 repas</span></div><p class="microcopy">Les préférences naissent des effets de la digestion.</p><div id="memories"></div><div class="memory-heading"><h3>Motivations</h3></div><p class="microcopy">La faim, la curiosité, la fatigue et le stress orientent ses choix.</p><div id="motivations"></div><div class="memory-heading"><h3>Mémoire des objets</h3><span id="interaction-count">0 interaction</span></div><p class="microcopy">Les effets attendus sont appris par expérience, jamais connus à la naissance.</p><div id="object-memories"></div><label class="sense-toggle"><input id="senses" type="checkbox"> Voir sa perception dans le jardin</label><details><summary>Gènes & biochimie</summary><div id="genes"></div><p class="microcopy">Énergie : nutriments assimilés − dépenses. Toxines : absorption − détoxification. Les valeurs sont celles de ce modèle expérimental.</p></details><div class="journal"><h3>Dernières expériences</h3><ol id="journal"></ol></div></section>
        <div class="field-note"><span>NOTE DE TERRAIN</span><p>« Il ne sait pas encore ce qui est bon pour lui.<br>Il va l’apprendre. »</p><div><span class="note-line"></span> Le début d’une histoire</div></div>
      </aside>
    </div>
    <footer><span>${icon("leaf")} Imprévisible à regarder. Reproductible à étudier.</span><span>Terrain <button id="seed-button" class="text-button"></button></span></footer>
  </main>
  <div id="toast" role="status" aria-live="polite"></div>
  <dialog id="help-dialog"><div class="dialog-heading"><p class="eyebrow">BIENVENUE DANS LUMA</p><button class="icon-button" data-close aria-label="Fermer">${icon("close")}</button></div><h2>Accompagnez une vie<br>qui apprend.</h2><p>Déposez des aliments dans le jardin. Milo décide seul où aller et quoi goûter : vous façonnez son environnement.</p><ol class="help-steps"><li><strong>Semez et observez.</strong> Trois aliments, trois compositions. Milo ne les connaît pas à sa naissance.</li><li><strong>Laissez le temps d’apprendre.</strong> La digestion prend quelques secondes ; plusieurs repas renforcent la mémoire. Le bouton 1× accélère le temps.</li><li><strong>Prenez soin de lui.</strong> Renouvelez sa nourriture. Un mauvais repas affecte sa santé ; le manque de nourriture aussi.</li></ol><p>Dans la palette <strong>Objets</strong>, placez un carillon, un coussin de mousse ou un galet prismatique. Une interaction dure trois secondes : elle peut stimuler, fatiguer ou apaiser Milo. Il apprend leurs conséquences et revient vers les objets selon ses besoins. Le mode « Retirer un objet » libère de la place.</p><p>Le <strong>laboratoire</strong> conserve plusieurs profils indépendants. Vous pouvez créer un individu à partir d’une graine génétique, le dériver d’un parent et comparer des essais neufs sur un terrain mémorisé. Seul le profil actif évolue.</p><p>« Observer Milo » révèle sa faim, sa biochimie et ses préférences. Une préférence n’est pas une certitude : Milo continue parfois à explorer.</p><p class="microcopy">Le jardin s’arrête quand cet onglet est masqué. Sauvegarde locale automatique toutes les 15 secondes. Aucun compte ni envoi de données.</p><button class="primary-button" data-close>Entrer dans le jardin ${icon("arrow")}</button></dialog>
  <dialog id="save-dialog"><div class="dialog-heading"><p class="eyebrow">VOTRE PETIT MONDE</p><button class="icon-button" data-close aria-label="Fermer">${icon("close")}</button></div><h2>Garder une trace.</h2><p>La sauvegarde locale conserve tous les profils. L’export individuel conserve le jardin actif ; l’export du laboratoire les conserve tous. L’import d’un laboratoire remplace la collection courante : exportez-la pour la garder.</p><div class="save-actions"><button id="save-local">Sauvegarder ici</button><button id="load-local">Charger la sauvegarde</button><button id="export">Exporter un fichier JSON</button><button id="import">Importer un fichier JSON</button><button id="export-lab">Exporter le laboratoire</button><button id="import-lab">Importer le laboratoire</button></div><input type="file" id="file" accept=".json,application/json" hidden><div class="new-world"><h3>Une nouvelle vie</h3><p class="microcopy">Remplace seulement le jardin du profil actif. Les autres profils restent conservés. Exportez l’individu avant de le remplacer pour garder son état.</p><label for="seed">Graine reproductible</label><input id="seed" type="text" maxlength="80" value="luma-01" autocomplete="off"><button id="new-world" class="primary-button">Faire éclore ${icon("arrow")}</button></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
// Keep feeding controls beside the garden in portrait, with the same DOM controls.
const picker = document.querySelector<HTMLElement>(".food-picker")!;
const foodFooter = document.querySelector<HTMLElement>(".food-footer")!;
const careCard = document.querySelector<HTMLElement>(".care-card")!;
const tools = document.createElement("div");
tools.className = "placement-tools";
picker.before(tools);
tools.innerHTML = `<div class="placement-tabs" role="group" aria-label="Type de placement"><button id="food-tab" aria-pressed="true">Aliments</button><button id="object-tab" aria-pressed="false">Objets</button></div>`;
tools.append(picker, foodFooter);
const objectTools = document.createElement("div");
objectTools.id = "object-tools";
objectTools.hidden = true;
objectTools.innerHTML = `<div class="food-picker object-picker" role="group" aria-label="Objet à déposer">${OBJECT_CUES.map((cue, i) => `<button class="food-choice ${i === 0 ? "selected" : ""}" data-object="${cue}" aria-pressed="${i === 0}" aria-label="${OBJECT_NAMES[cue]}"><span class="object-art ${cue}"></span><span>${OBJECT_NAMES[cue]}</span><span class="selection-dot"></span></button>`).join("")}</div><div class="food-footer"><span id="object-count">0 / ${MAX_OBJECTS} objets</span><button id="remove-object" class="text-button" aria-pressed="false">Retirer un objet</button></div><p id="object-hint" class="microcopy">Touchez le jardin pour déposer l’objet choisi.</p>`;
tools.append(objectTools);
const deviceTools = document.createElement("div");
deviceTools.className = "device-tools";
deviceTools.innerHTML = `<details><summary>Machine à levier · <span id="device-count">0 / 4</span></summary><label for="device-food">Baie fabriquée</label><select id="device-food">${CUES.map((cue) => `<option value="${cue}">${NAMES[cue]}</option>`).join("")}</select><div class="save-actions"><button id="place-device">Placer une distributrice</button><button id="refill-device">Recharger une machine</button></div><p class="microcopy">La créature découvre seule le levier. Réserve de 12 baies ; recharge physique de 8 s. Touchez le jardin pour placer, recharger ou retirer la machine.</p></details>`;
objectTools.append(deviceTools);

const portrait = matchMedia("(max-width: 620px)");
function arrangeFeeding(): void {
  const destination = portrait.matches ? $("food-dock") : careCard;
  destination.append(tools);
}
portrait.addEventListener("change", arrangeFeeding);
arrangeFeeding();
const STORAGE_KEY = "luma.world.v1";
const LAB_STORAGE_KEY = "luma.laboratory.v1";
let world = createWorld();
let laboratory = createLaboratory(world);
let renderedName = "";
let selected: Cue = "amber";
let selectedObject: ObjectCue = "chime";
let placement: "food" | "object" | "remove" | "device" | "refill" = "food";
let paused = false;
let speed = 1;
let inspector = false;
let accumulator = 0;
let previous = performance.now();
let nextUi = 0;
let nextRender = 0;
let toastTimer: ReturnType<typeof setTimeout>;
let storageFailed = false;
const renderer = new Renderer($<HTMLCanvasElement>("world"));
const observatory = new LearningObservatory();
const observatoryUI = createObservatoryPanel(() => laboratory, observatory);
document.querySelector("main footer")!.before(observatoryUI.element);
const observatoryButton = document.createElement("button");
observatoryButton.id = "open-observatory";
observatoryButton.textContent = "Observatoire de l’apprentissage";
observatoryButton.setAttribute("aria-controls", "observatory");
observatoryButton.setAttribute("aria-expanded", "false");
observatoryButton.addEventListener("click", () => {
  observatoryUI.open();
  observatoryButton.setAttribute("aria-expanded", "true");
});
observatoryUI.element
  .querySelector("#obs-close")!
  .addEventListener("click", () => {
    observatoryButton.setAttribute("aria-expanded", "false");
    observatoryButton.focus({ preventScroll: true });
  });
document.querySelector(".laboratory-entry")!.after(observatoryButton);

function toast(message: string): void {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}

try {
  const savedLab = localStorage.getItem(LAB_STORAGE_KEY);
  if (savedLab) {
    laboratory = deserializeLaboratory(savedLab);
    world = activeProfile(laboratory).world;
    toast("Votre laboratoire et ses individus sont restaurés.");
  } else {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      world = deserialize(saved);
      laboratory = createLaboratory(world);
      toast("Votre jardin a retrouvé sa petite vie.");
    }
  }
} catch {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      world = deserialize(saved);
      laboratory = createLaboratory(world);
    }
  } catch {
    /* Keep the fresh world if both local files are inaccessible. */
  }
  toast(
    "Laboratoire inaccessible. Le dernier jardin valide est conservé ; un export JSON reste possible.",
  );
}

function save(announce = false): void {
  try {
    localStorage.setItem(LAB_STORAGE_KEY, serializeLaboratory(laboratory));
    localStorage.setItem(STORAGE_KEY, serialize(world));
    if (announce) toast("Laboratoire et profils sauvegardés sur cet appareil.");
  } catch {
    if (!storageFailed || announce)
      toast("Stockage indisponible. Utilisez l’export JSON.");
    storageFailed = true;
  }
}

function setWorld(next: typeof world): void {
  replaceActiveWorld(laboratory, next);
  world = next;
  accumulator = 0;
  previous = performance.now();
  sync();
  renderer.draw(
    world,
    $<HTMLInputElement>("senses").checked,
    activeProfile(laboratory).name,
  );
}

function setInspector(open: boolean): void {
  inspector = open;
  $("biology").hidden = !open;
  $("inspect").setAttribute("aria-expanded", String(open));
  $("inspect").classList.toggle("active", open);
  sync();
}

function sync(): void {
  const individual = activeProfile(laboratory);
  $("active-individual").textContent = `Individu actif · ${individual.name}`;
  if (renderedName !== individual.name) {
    renderedName = individual.name;
    $("inspect").innerHTML = icon("eye");
    $("inspect").append(
      document.createTextNode(` Observer ${individual.name}`),
    );
    document.querySelector(".creature-title h2")!.textContent = individual.name;
  }
  const c = world.creature,
    m = c.metabolism;
  const seconds = Math.floor(world.tick * DT);
  $("clock").textContent =
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("seed-button").textContent = world.seed;
  $("food-count").textContent = `${world.foods.length} / ${MAX_FOODS} aliments`;
  $("device-count").textContent =
    `${world.instrumental?.devices.length ?? 0} / 4`;
  $("object-count").textContent =
    `${world.objects.length} / ${MAX_OBJECTS} objets`;
  $("scatter").toggleAttribute(
    "disabled",
    world.foods.length > MAX_FOODS - 3 || !c.alive,
  );
  $("end-state").hidden = c.alive;
  const state = !c.alive
    ? "Milo se repose pour toujours"
    : paused
      ? "Le temps est suspendu"
      : m.health < 35
        ? "Milo est fragile · surveillez ses repas"
        : hunger(m) > 0.7
          ? "Milo a très faim"
          : c.action.kind === "interact"
            ? "Milo expérimente un objet"
            : c.action.kind === "inspect"
              ? "Un objet intrigue Milo…"
              : c.action.kind === "use"
                ? "Milo essaie un mécanisme"
                : c.action.kind === "seek"
                  ? "Une odeur attire Milo…"
                  : m.stomach > 2
                    ? "Milo digère et apprend"
                    : c.action.kind === "wander"
                      ? "Milo explore son jardin"
                      : "Milo savoure un peu de calme";
  $("status").textContent = state.replaceAll("Milo", () => individual.name);
  observatoryUI.render();
  if (!inspector) return;
  $("age").textContent =
    `${Math.floor(seconds / 60)} min ${seconds % 60} s de vie`;
  const vitals: [string, number, string][] = [
    ["Énergie", m.energy, "energy"],
    ["Satiété", 100 * (1 - hunger(m)), "satiety"],
    ["Santé", m.health, "health"],
  ];
  $("vitals").innerHTML = vitals
    .map(
      ([label, value, kind]) =>
        `<div class="vital"><div><span>${label}</span><span>${Math.round(value)}<span class="unit"> / 100</span></span></div><div class="meter" role="meter" aria-label="${label}" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100"><span class="${kind}" style="width:${value}%"></span></div></div>`,
    )
    .join("");
  $("meal-count").textContent = `${c.meals} repas`;
  $("memories").innerHTML = CUES.map((cue) => {
    const memory = c.brain[cue];
    const label =
      memory.meals === 0
        ? "Inconnu"
        : memory.value > 0.12
          ? "Apprécié"
          : memory.value < -0.12
            ? "Évité"
            : "Neutre";
    return `<div class="memory-row"><i style="background:${COLORS[cue]}"></i><span>${NAMES[cue]}<small>${memory.meals} expérience${memory.meals > 1 ? "s" : ""}</small></span><span class="memory-value ${memory.value < -0.12 ? "negative" : ""}">${label}<small>${memory.value >= 0 ? "+" : ""}${memory.value.toFixed(2)}</small></span></div>`;
  }).join("");
  const drives = motivations(c);
  const motiveLabels = {
    hunger: "Faim",
    curiosity: "Curiosité",
    rest: "Besoin de repos",
    comfort: "Besoin d’apaisement",
  };
  $("motivations").innerHTML = Object.entries(drives)
    .map(
      ([key, value]) =>
        `<div class="vital"><div><span>${motiveLabels[key as keyof typeof drives]}</span><span>${Math.round(value * 100)} %</span></div><div class="meter" role="meter" aria-label="${motiveLabels[key as keyof typeof drives]}" aria-valuenow="${Math.round(value * 100)}" aria-valuemin="0" aria-valuemax="100"><span class="satiety" style="width:${value * 100}%"></span></div></div>`,
    )
    .join("");
  const interactions = OBJECT_CUES.reduce(
    (sum, cue) => sum + c.objectBrain[cue].interactions,
    0,
  );
  $("interaction-count").textContent =
    `${interactions} interaction${interactions > 1 ? "s" : ""}`;
  $("object-memories").innerHTML = OBJECT_CUES.map((cue) => {
    const memory = c.objectBrain[cue];
    const label =
      memory.interactions === 0
        ? "Inconnu"
        : memory.value > 0.12
          ? "Apprécié"
          : memory.value < -0.12
            ? "Évité"
            : "Neutre";
    const e = memory.expected;
    const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
    return `<div class="memory-row"><i style="background:${OBJECT_COLORS[cue]}"></i><span>${OBJECT_NAMES[cue]}<small>${memory.interactions} expérience${memory.interactions > 1 ? "s" : ""}</small></span><span class="memory-value ${memory.value < -0.12 ? "negative" : ""}">${label}<small>${signed(memory.value)}</small></span></div>${memory.interactions ? `<p class="microcopy expected-effects">Effets appris : stimulation ${signed(e.stimulation)}, fatigue ${signed(e.fatigue)}, stress ${signed(e.stress)}, énergie ${signed(e.energy)}.</p>` : ""}`;
  }).join("");
  $("genes").innerHTML =
    `<dl class="gene-list"><dt>Stimulation</dt><dd>${c.needs.stimulation.toFixed(1)} %</dd><dt>Fatigue</dt><dd>${c.needs.fatigue.toFixed(1)} %</dd><dt>Stress</dt><dd>${c.needs.stress.toFixed(1)} %</dd><dt>Faim</dt><dd>${Math.round(hunger(m) * 100)} %</dd><dt>Contenu digestif</dt><dd>${m.stomach.toFixed(1)} / 36</dd><dt>Toxines</dt><dd>${m.toxins.toFixed(1)}</dd></dl>`;
  const allGenes = { ...physiology(c.genome), ...c.genome.genes };
  $("genes").insertAdjacentHTML(
    "beforeend",
    `<dl class="gene-list">${Object.entries(allGenes)
      .map(
        ([key, value]) =>
          `<dt>${GENE_LABELS[key as keyof typeof allGenes]}</dt><dd>${value.toFixed(3)}</dd>`,
      )
      .join("")}</dl>`,
  );
  $("journal").innerHTML =
    world.events
      .slice(-4)
      .reverse()
      .map(
        (e) =>
          `<li><time>${Math.floor(e.tick / 10)} s</time><span>${e.kind === "death" ? "La vie de Milo s’est éteinte." : e.kind === "interaction" ? `${OBJECT_NAMES[e.objectCue!]} : effet ${e.value! >= 0 ? "bénéfique" : "désagréable"} mémorisé.` : e.kind === "meal" ? `${NAMES[e.cue!]} consommé.` : `${NAMES[e.cue!]} : effet ${e.value! > 0 ? "bénéfique" : "négatif"} mémorisé.`}</span></li>`,
      )
      .join("") || "<li>Tout commence par une première découverte.</li>";
}

document.querySelectorAll<HTMLButtonElement>("[data-cue]").forEach((button) =>
  button.addEventListener("click", () => {
    selected = button.dataset.cue as Cue;
    document.querySelectorAll<HTMLButtonElement>("[data-cue]").forEach((b) => {
      const active = b === button;
      b.classList.toggle("selected", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }),
);
function choosePlacement(showObjects: boolean): void {
  placement = showObjects ? "object" : "food";
  picker.hidden = showObjects;
  foodFooter.hidden = showObjects;
  objectTools.hidden = !showObjects;
  $("food-tab").setAttribute("aria-pressed", String(!showObjects));
  $("object-tab").setAttribute("aria-pressed", String(showObjects));
  $("remove-object").setAttribute("aria-pressed", "false");
  $("object-hint").textContent =
    "Touchez le jardin pour déposer l’objet choisi.";
}
$("food-tab").addEventListener("click", () => choosePlacement(false));
$("object-tab").addEventListener("click", () => choosePlacement(true));
document
  .querySelectorAll<HTMLButtonElement>("[data-object]")
  .forEach((button) =>
    button.addEventListener("click", () => {
      selectedObject = button.dataset.object as ObjectCue;
      choosePlacement(true);
      document
        .querySelectorAll<HTMLButtonElement>("[data-object]")
        .forEach((b) => {
          b.classList.toggle("selected", b === button);
          b.setAttribute("aria-pressed", String(b === button));
        });
    }),
  );
$("remove-object").addEventListener("click", () => {
  placement = placement === "remove" ? "object" : "remove";
  $("remove-object").setAttribute(
    "aria-pressed",
    String(placement === "remove"),
  );
  $("object-hint").textContent =
    placement === "remove"
      ? "Touchez un objet pour le retirer. Les souvenirs restent."
      : "Touchez le jardin pour déposer l’objet choisi.";
});
$("place-device").addEventListener("click", () => {
  choosePlacement(true);
  placement = "device";
  $("object-hint").textContent =
    "Touchez le jardin pour déposer la machine choisie.";
});
$("refill-device").addEventListener("click", () => {
  choosePlacement(true);
  placement = "refill";
  $("object-hint").textContent = "Touchez une machine pour remplir sa réserve.";
});
$("world").addEventListener("pointerdown", (event) => {
  if (!world.creature.alive) return;
  const pos = renderer.position(event.clientX, event.clientY);
  if (placement === "food") {
    if (addFood(world, selected, pos.x, pos.y))
      toast(`${NAMES[selected]} déposé.`);
    else toast("Le jardin est plein. Attendez que Milo mange.");
  } else if (placement === "object") {
    if (addObject(world, selectedObject, pos.x, pos.y))
      toast(`${OBJECT_NAMES[selectedObject]} déposé.`);
    else
      toast(
        "La limite de 12 objets est atteinte. Retirez-en un pour continuer.",
      );
  } else if (placement === "device") {
    if (
      addDispenser(
        world,
        pos.x,
        pos.y,
        $<HTMLSelectElement>("device-food").value as Cue,
      )
    )
      toast("Distributrice placée. Luma ne connaît pas sa fonction.");
    else toast("La limite de quatre machines est atteinte.");
  } else if (placement === "refill") {
    const device = world.instrumental?.devices.find(
      (d) => Math.hypot(d.x - pos.x, d.y - pos.y) < 42,
    );
    toast(
      device && refillDevice(world, device.id)
        ? "Réserve remplie. Aucun souvenir n’est modifié."
        : "Touchez une machine pour la recharger.",
    );
  } else {
    const target = [
      ...world.objects,
      ...(world.instrumental?.devices ?? []),
    ].reduce<{ id: number; x: number; y: number } | undefined>(
      (nearest, object) =>
        Math.hypot(object.x - pos.x, object.y - pos.y) <
        Math.min(
          38,
          nearest ? Math.hypot(nearest.x - pos.x, nearest.y - pos.y) : 38,
        )
          ? object
          : nearest,
      undefined,
    );
    if (target) {
      removeObject(world, target.id) || removeDevice(world, target.id);
      toast("Objet retiré. Milo garde ses souvenirs.");
    } else toast("Touchez un objet pour le retirer.");
  }
  sync();
  renderer.draw(
    world,
    $<HTMLInputElement>("senses").checked,
    activeProfile(laboratory).name,
  );
});
$("scatter").addEventListener("click", () => {
  if (world.foods.length > MAX_FOODS - 3) return;
  // Deterministic user command, no hidden random calls or automatic feeding.
  const rotation = world.nextId * 2.399963;
  CUES.forEach((cue, i) => {
    const angle = rotation + (i * Math.PI * 2) / 3;
    addFood(
      world,
      cue,
      300 + Math.cos(angle) * 170,
      340 + Math.sin(angle) * 190,
    );
  });
  toast("Trois nouvelles découvertes dans le jardin.");
  sync();
});
$("pause").addEventListener("click", () => {
  paused = !paused;
  accumulator = 0;
  $("pause").innerHTML = icon(paused ? "play" : "pause");
  $("pause").setAttribute(
    "aria-label",
    paused ? "Reprendre" : "Mettre en pause",
  );
  sync();
});
$("speed").addEventListener("click", () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  $("speed").textContent = `${speed}×`;
  $("speed").setAttribute(
    "aria-label",
    `Vitesse de simulation : ${speed} fois`,
  );
});
$("inspect").addEventListener("click", () => setInspector(!inspector));
$("close-inspector").addEventListener("click", () => setInspector(false));
const labUI = createLaboratoryDialog(
  () => laboratory,
  () => {
    world = activeProfile(laboratory).world;
    accumulator = 0;
    previous = performance.now();
    sync();
    save();
    renderer.draw(
      world,
      inspector && $<HTMLInputElement>("senses").checked,
      activeProfile(laboratory).name,
    );
  },
  observatory,
);
$("open-lab").addEventListener("click", () => labUI.open());
const dialogs = [
  $<HTMLDialogElement>("help-dialog"),
  $<HTMLDialogElement>("save-dialog"),
  labUI.dialog,
];
function showDialog(id: string): void {
  $<HTMLInputElement>("seed").value = world.seed;
  $<HTMLDialogElement>(id).showModal();
}
$("help").addEventListener("click", () => showDialog("help-dialog"));
$("storage").addEventListener("click", () => showDialog("save-dialog"));
$("seed-button").addEventListener("click", () => showDialog("save-dialog"));
$("restart").addEventListener("click", () => showDialog("save-dialog"));
document
  .querySelectorAll<HTMLElement>("[data-close]")
  .forEach((b) =>
    b.addEventListener("click", () => b.closest("dialog")!.close()),
  );
for (const dialog of dialogs)
  dialog.addEventListener("close", () => {
    accumulator = 0;
    previous = performance.now();
  });
$("save-local").addEventListener("click", () => save(true));
$("load-local").addEventListener("click", () => {
  try {
    const archived = localStorage.getItem(LAB_STORAGE_KEY);
    if (archived) {
      const next = deserializeLaboratory(archived);
      laboratory = next;
      world = activeProfile(laboratory).world;
      accumulator = 0;
      previous = performance.now();
      sync();
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        toast("Aucune sauvegarde sur cet appareil.");
        return;
      }
      setWorld(deserialize(saved));
    }
    toast("Laboratoire et mémoires restaurés.");
    dialogs[1]!.close();
  } catch {
    toast("Impossible de charger cette sauvegarde. Le jardin est conservé.");
  }
});
$("export-lab").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([serializeLaboratory(laboratory)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "luma-laboratoire.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Laboratoire complet exporté.");
});
$("import-lab").addEventListener("click", () =>
  $<HTMLInputElement>("file").click(),
);
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(
    new Blob([serialize(world)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `luma-${world.tick}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Sauvegarde JSON exportée.");
});
$("import").addEventListener("click", () =>
  $<HTMLInputElement>("file").click(),
);
$<HTMLInputElement>("file").addEventListener("change", async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_LAB_BYTES) throw new Error();
    const contents = await file.text();
    const candidate: unknown = JSON.parse(contents);
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "kind" in candidate &&
      candidate.kind === "luma-laboratory"
    ) {
      const next = deserializeLaboratory(contents);
      laboratory = next;
      world = activeProfile(laboratory).world;
      accumulator = 0;
      previous = performance.now();
      sync();
    } else {
      setWorld(deserialize(contents));
    }
    save();
    dialogs[1]!.close();
    toast("Jardin importé. Son histoire continue.");
  } catch {
    toast("Fichier invalide ou incompatible. Le jardin est conservé.");
  }
  input.value = "";
});
$("new-world").addEventListener("click", () => {
  const seed = $<HTMLInputElement>("seed").value.trim() || "luma-01";
  setWorld(createWorld(seed, generateGenome(seed)));
  activeProfile(laboratory).geneticSeed = seed;
  save();
  dialogs[1]!.close();
  toast("Milo découvre une nouvelle vie.");
});

document.addEventListener("visibilitychange", () => {
  accumulator = 0;
  previous = performance.now();
  if (document.hidden) save();
});
window.addEventListener("pagehide", () => save());
setInterval(() => save(), 15_000);

function frame(now: number): void {
  const elapsed = Math.min((now - previous) / 1000, 0.25);
  previous = now;
  if (!document.hidden) {
    if (!paused && !dialogs.some((dialog) => dialog.open)) {
      accumulator += elapsed * speed;
      while (accumulator >= DT) {
        step(world, observatory.observerFor(world));
        accumulator -= DT;
      }
    }
    // Canvas 30 fps, simulation 10 Hz, DOM 4 Hz; no redraw work in hidden tabs.
    if (now >= nextRender) {
      renderer.draw(
        world,
        inspector && $<HTMLInputElement>("senses").checked,
        activeProfile(laboratory).name,
      );
      nextRender = now + 1000 / 30;
    }
    if (now >= nextUi) {
      sync();
      nextUi = now + 250;
    }
  }
  requestAnimationFrame(frame);
}
sync();
requestAnimationFrame(frame);
