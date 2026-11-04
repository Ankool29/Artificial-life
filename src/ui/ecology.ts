import type { World, Point, Cue } from "../sim/types";
import {
  enableEcology,
  plantSeed,
  uprootPlant,
  amendSoil,
  configureEcology,
  ecologySummary,
  soilIndex,
} from "../sim/ecology";
import { MAX_PLANTS, type PlantStage } from "../sim/ecology-types";
import { setCreaturePresence } from "../sim/world";
import { NAMES } from "./renderer";

export const STAGE_NAMES: Record<PlantStage, string> = {
  seed: "Graine",
  germinating: "Germination",
  growing: "Croissance",
  mature: "Maturité",
  fruiting: "Fructification",
  senescent: "Vieillissement",
  dead: "Morte",
};
export function createEcologyTools(
  getWorld: () => World,
  changed: () => void,
  notice: (text: string) => void,
  advance: () => void,
) {
  const element = document.createElement("div");
  element.id = "plant-tools";
  element.hidden = true;
  element.innerHTML = `<div class="ecology-heading"><strong>Végétation vivante</strong><span id="plant-count"></span></div>
  <button id="enable-ecology">Introduire neuf graines</button>
  <div id="ecology-active" hidden><div class="eco-seed-select"><label for="plant-variety">Variété à semer</label><select id="plant-variety">${Object.entries(
    NAMES,
  )
    .map(([cue, name]) => `<option value="${cue}">${name}</option>`)
    .join("")}</select></div>
  <div class="eco-actions" role="group" aria-label="Action sur les plantes"><button id="plant-inspect" aria-pressed="true">Consulter</button><button id="plant-seed" aria-pressed="false">Semer</button><button id="plant-remove" aria-pressed="false">Retirer</button></div>
  <p id="plant-hint" class="microcopy">Touchez une plante pour la consulter.</p>
  <label for="plant-list">Plante à consulter</label><select id="plant-list"><option value="">Choisir une plante…</option></select>
  <div id="plant-summary" aria-live="polite"></div>
  <details id="ecology-details"><summary>Vue écologique détaillée</summary><p class="microcopy">Les plantes suivent leurs ressources et leur cycle biologique. Elles ne poussent pas pour répondre à la faim de Luma.</p>
  <label class="sense-toggle"><input id="creature-present" type="checkbox" checked> Luma dans le jardin</label><p class="microcopy">Hors du jardin, son profil reste conservé sans activité biologique. La végétation continue, même après son décès.</p>
  <div class="eco-settings"><label>Lumière <input id="eco-light" type="range" min="0" max="1.5" step="0.05"><output id="eco-light-value"></output></label><label>Apport d’eau par zone / s <input id="eco-water" type="range" min="0" max="0.5" step="0.01"><output id="eco-water-value"></output></label><label>Apport de minéraux par zone / s <input id="eco-minerals" type="range" min="0" max="0.05" step="0.0005"><output id="eco-minerals-value"></output></label></div>
  <div class="eco-actions"><button id="eco-water-plant">Arroser la zone +10</button><button id="eco-feed-plant">Minéraux +1</button><button id="eco-advance">Avancer 60 s</button></div>
  <div id="eco-statistics"></div><p class="microcopy">Les apports sont des échanges avec l’extérieur. Les minéraux du sol et les nutriments énergétiques des baies sont deux quantités différentes.</p>
  <div class="observatory-table-wrap"><table><caption>Sol local · 25 zones</caption><thead><tr><th>Zone</th><th>Eau / 100</th><th>Minéraux / 40</th><th>Litière</th></tr></thead><tbody id="eco-soil"></tbody></table></div>
  <p id="eco-balance" class="microcopy"></p></details></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    element.querySelector<T>(`#${id}`)!;
  let mode: "inspect" | "seed" | "remove" = "inspect",
    selectedId: number | null = null,
    lastWorld: World | undefined,
    soilKey = "";
  const command = () => {
    soilKey = "";
    changed();
  };
  const choose = (next: typeof mode) => {
    mode = next;
    for (const m of ["inspect", "seed", "remove"] as const)
      $("plant-" + m).setAttribute("aria-pressed", String(m === mode));
    $("plant-hint").textContent =
      mode === "seed"
        ? "Touchez le jardin pour semer une graine. Elle apporte ses propres réserves."
        : mode === "remove"
          ? "Touchez une plante pour la retirer. Ses ressources quittent le jardin."
          : "Touchez une plante pour la consulter.";
  };
  for (const m of ["inspect", "seed", "remove"] as const)
    $("plant-" + m).addEventListener("click", () => choose(m));
  $("enable-ecology").addEventListener("click", () => {
    enableEcology(getWorld());
    command();
    notice(
      "Neuf graines introduites. Leur croissance dépend du sol et de la lumière.",
    );
  });
  $("plant-list").addEventListener("change", () => {
    selectedId = Number($<HTMLSelectElement>("plant-list").value) || null;
    choose("inspect");
    command();
  });
  $("creature-present").addEventListener("change", () => {
    setCreaturePresence(
      getWorld(),
      $<HTMLInputElement>("creature-present").checked,
    );
    command();
  });
  for (const [id, key] of [
    ["eco-light", "light"],
    ["eco-water", "waterInput"],
    ["eco-minerals", "mineralInput"],
  ] as const) {
    const field = $<HTMLInputElement>(id);
    field.addEventListener("input", () => {
      $(id + "-value").textContent = field.value;
    });
    field.addEventListener("change", () => {
      configureEcology(getWorld(), { [key]: Number(field.value) });
      command();
    });
  }
  function amend(water: number, minerals: number) {
    const w = getWorld(),
      p = w.ecology?.plants.find((p) => p.id === selectedId);
    if (!p) {
      notice("Choisissez d’abord une plante et sa zone de sol.");
      return;
    }
    amendSoil(w, soilIndex(p.x, p.y), water, minerals);
    command();
  }
  $("eco-water-plant").addEventListener("click", () => amend(10, 0));
  $("eco-feed-plant").addEventListener("click", () => amend(0, 1));
  $("eco-advance").addEventListener("click", advance);
  function render() {
    if (element.hidden) return;
    const w = getWorld(),
      e = w.ecology;
    if (w !== lastWorld) {
      selectedId = null;
      lastWorld = w;
      soilKey = "";
    }
    $("enable-ecology").hidden = !!e;
    $("ecology-active").hidden = !e;
    $("plant-count").textContent = e
      ? `${e.plants.filter((p) => p.stage !== "dead").length} vivantes / ${MAX_PLANTS}`
      : "Jardin classique";
    if (!e) return;
    const list = $<HTMLSelectElement>("plant-list");
    const options =
      `<option value="">Choisir une plante…</option>` +
      e.plants
        .map(
          (p) =>
            `<option value="${p.id}">#${p.id} · ${NAMES[p.variety]} · ${STAGE_NAMES[p.stage]}</option>`,
        )
        .join("");
    if (document.activeElement !== list && list.innerHTML !== options) {
      list.innerHTML = options;
      list.value = selectedId === null ? "" : String(selectedId);
    }
    const p = e.plants.find((p) => p.id === selectedId);
    $("plant-summary").innerHTML = p
      ? `<article class="plant-summary"><h3>${NAMES[p.variety]} · #${p.id}</h3><p>${STAGE_NAMES[p.stage]} · ${p.age} s</p><dl class="gene-list"><dt>Santé</dt><dd>${p.health.toFixed(1)} / 100</dd><dt>Réserves énergétiques</dt><dd>${p.energy.toFixed(1)} / 80</dd><dt>Structure</dt><dd>${p.biomass.toFixed(1)} / 40</dd><dt>Eau interne</dt><dd>${p.water.toFixed(2)} / 8</dd><dt>Minéraux internes</dt><dd>${p.minerals.toFixed(2)}</dd><dt>Fruits produits</dt><dd>${p.fruitsProduced}</dd><dt>Graines dispersées</dt><dd>${p.seedsProduced}</dd><dt>Fruit en formation</dt><dd>${p.bud ? `${Math.round((1 - p.bud.remaining / 20) * 100)} %` : "Aucun"}</dd></dl></article>`
      : `<p class="microcopy">${selectedId === null ? "Aucune plante sélectionnée." : "Cette plante n’est plus présente."}</p>`;
    $<HTMLInputElement>("creature-present").checked = e.creaturePresent;
    for (const [id, key] of [
      ["eco-light", "light"],
      ["eco-water", "waterInput"],
      ["eco-minerals", "mineralInput"],
    ] as const) {
      const field = $<HTMLInputElement>(id);
      if (document.activeElement !== field)
        field.value = String(e.settings[key]);
      $(id + "-value").textContent = field.value;
    }
    if (!$<HTMLDetailsElement>("ecology-details").open) return;
    const s = ecologySummary(w)!;
    $("eco-statistics").innerHTML =
      `<dl class="gene-list"><dt>Temps écologique</dt><dd>${s.time} s</dd><dt>Germinations</dt><dd>${s.counters.germinated}</dd><dt>Naissances végétales</dt><dd>${s.counters.born}</dd><dt>Morts naturelles</dt><dd>${s.counters.died}</dd><dt>Fruits produits / consommés</dt><dd>${s.counters.produced} / ${s.counters.consumed}</dd><dt>Fruits décomposés</dt><dd>${s.counters.decayed}</dd><dt>Fruits végétaux disponibles</dt><dd>${s.plantFruits}</dd><dt>Tous aliments disponibles</dt><dd>${s.food}</dd><dt>Eau du sol</dt><dd>${s.soilWater.toFixed(1)}</dd><dt>Minéraux du sol</dt><dd>${s.soilMinerals.toFixed(1)}</dd></dl><p class="microcopy">${Object.entries(
        s.stages,
      )
        .map(([stage, n]) => `${STAGE_NAMES[stage as PlantStage]} : ${n}`)
        .join(" · ")}</p>`;
    const key = `${e.time}/${e.budgets.water.input}/${e.budgets.minerals.input}`;
    if (soilKey !== key) {
      $("eco-soil").innerHTML = e.soil
        .map(
          (c, i) =>
            `<tr><th>${i + 1}</th><td>${c.water.toFixed(1)}</td><td>${c.minerals.toFixed(2)}</td><td>${c.litterMinerals.toFixed(2)} min.</td></tr>`,
        )
        .join("");
      soilKey = key;
    }
    $("eco-balance").textContent =
      `Résidus des bilans (entrées − sorties − stocks) : eau ${Number(s.residuals.water).toExponential(1)}, minéraux ${Number(s.residuals.minerals).toExponential(1)}, énergie ${Number(s.residuals.energy).toExponential(1)}. Unités simplifiées, pas des mesures de laboratoire réelles.`;
  }
  return {
    element,
    render,
    get selectedId() {
      return selectedId;
    },
    tap(pos: Point) {
      const w = getWorld(),
        e = w.ecology;
      if (!e) {
        notice("Introduisez d’abord la végétation dans ce jardin classique.");
        return;
      }
      if (mode === "seed") {
        if (
          plantSeed(
            w,
            $<HTMLSelectElement>("plant-variety").value as Cue,
            pos.x,
            pos.y,
          )
        ) {
          selectedId = e.plants.at(-1)!.id;
          notice("Une graine a été semée.");
        } else
          notice(
            "La capacité végétale est atteinte, y compris les plantes mortes encore en décomposition.",
          );
      } else {
        const nearest = e.plants.reduce<(typeof e.plants)[number] | undefined>(
          (best, p) =>
            Math.hypot(p.x - pos.x, p.y - pos.y) <
            Math.min(42, best ? Math.hypot(best.x - pos.x, best.y - pos.y) : 42)
              ? p
              : best,
          undefined,
        );
        if (nearest) {
          selectedId = nearest.id;
          if (mode === "remove") {
            uprootPlant(w, nearest.id);
            selectedId = null;
            notice(
              "Plante retirée ; ses ressources sont comptabilisées comme sorties.",
            );
          }
        } else notice("Touchez une plante pour la sélectionner.");
      }
      command();
    },
  };
}
