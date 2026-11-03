import {
  activeProfile,
  activateProfile,
  addIndividual,
  advanceActive,
  captureEnvironment,
  createTrial,
  MAX_PROFILES,
  type Laboratory,
} from "../lab/laboratory";
import { GENE_LABELS, physiology } from "../sim/genome";
import { motivations } from "../sim/curiosity";
import { CUES, OBJECT_CUES } from "../sim/types";
import { NAMES } from "./renderer";
import { OBJECT_NAMES } from "./object-info";
import type { LearningObservatory } from "../observatory/recorder";
import { createIndividualComparison } from "./observatory";

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const signed = (value: number): string =>
  `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;

// The dialog reads stored worlds; only explicit actions may advance the active one.
export function createLaboratoryDialog(
  getLab: () => Laboratory,
  changed: () => void,
  observatory: LearningObservatory,
): { dialog: HTMLDialogElement; open: () => void } {
  const dialog = document.createElement("dialog");
  dialog.id = "lab-dialog";
  dialog.innerHTML = `<div class="dialog-heading"><p class="eyebrow">LABORATOIRE · DIVERSITÉ INDIVIDUELLE</p><button class="icon-button" id="lab-close" aria-label="Fermer le laboratoire">✕</button></div><h2>Une vie à la fois.</h2><p>Chaque individu conserve son corps, ses souvenirs et son terrain. Les profils inactifs restent en pause.</p><p id="lab-message" role="status" aria-live="polite"></p><div class="lab-layout"><section class="lab-controls"><h3>Vos individus</h3><p id="lab-summary" class="microcopy"></p><label for="lab-selected">Profil à examiner</label><select id="lab-selected"></select><div class="save-actions"><button id="lab-activate">Activer ce profil</button><button id="lab-advance">Avancer de 30 s</button></div><p class="microcopy">L’avance exacte de 300 ticks s’applique uniquement au profil actif, même si le jardin est en pause.</p><details id="lab-new-panel"><summary>Créer un individu</summary><form id="lab-create"><label for="lab-name">Nom du profil</label><input id="lab-name" required maxlength="40" autocomplete="off"><label for="lab-genetic-seed">Graine génétique</label><input id="lab-genetic-seed" required maxlength="80" autocomplete="off"><label for="lab-environment-seed">Graine du terrain</label><input id="lab-environment-seed" required maxlength="80" autocomplete="off"><label for="lab-parent">Hérédité</label><select id="lab-parent"></select><p class="microcopy">Sans parent : génome issu de la graine. Avec parent : paramètres transmis avec de petites mutations reproductibles. Aucun souvenir n’est transmis.</p><button id="lab-create-button" class="primary-button" type="submit">Créer et activer</button></form></details></section><section id="lab-details" class="lab-details" aria-live="polite"></section></div><section class="lab-experiments"><h3>Comparer sur un même terrain</h3><p class="microcopy">1. Mémorisez le terrain du profil actif. 2. Créez un essai neuf pour chaque profil sélectionné. 3. Activez chaque essai et avancez du même nombre de ticks. Les originaux sont conservés ; les essais repartent avec le même corps initial, des souvenirs neutres et le même hasard environnemental.</p><p id="lab-terrain" class="microcopy"></p><div class="save-actions"><button id="lab-capture">Mémoriser le terrain actif</button><button id="lab-trial">Créer un essai neuf</button><button id="lab-reuse">Réutiliser le terrain de cet essai</button></div><div class="lab-table-wrap" tabindex="0" role="region" aria-label="Tableau comparatif des individus"><table id="lab-comparison"><caption>États conservés · comparaison à âge égal</caption><thead><tr><th>Profil</th><th>Temps</th><th>Énergie</th><th>Santé</th><th>Curiosité</th><th>Valeurs aliments<br>solaire / rosée / corail</th><th>Valeurs objets<br>carillon / mousse / prisme</th></tr></thead><tbody></tbody></table></div><p class="microcopy">Les différences après un essai peuvent venir du génome puis des choix et apprentissages qui en résultent. Pour isoler l’histoire, utilisez des copies d’un même génome. Les actions manuelles doivent être identiques aux mêmes ticks.</p></section>`;
  document.body.append(dialog);
  const comparison = createIndividualComparison(getLab, observatory);
  dialog.append(comparison.element);
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
    dialog.querySelector(`#${id}`) as T;
  let selectedId = getLab().activeId;

  function render(): void {
    const lab = getLab();
    if (!lab.profiles.some((p) => p.id === selectedId))
      selectedId = lab.activeId;
    const selected = lab.profiles.find((p) => p.id === selectedId)!;
    const parentChoice = $<HTMLSelectElement>("lab-parent").value;
    $("lab-selected").innerHTML = lab.profiles
      .map(
        (p) =>
          `<option value="${escape(p.id)}">${escape(p.name)}${p.id === lab.activeId ? " · actif" : ""}</option>`,
      )
      .join("");
    $<HTMLSelectElement>("lab-selected").value = selectedId;
    $("lab-parent").innerHTML =
      '<option value="">Sans parent</option>' +
      lab.profiles
        .map(
          (p) =>
            `<option value="${escape(p.id)}">Descendant de ${escape(p.name)}</option>`,
        )
        .join("");
    $<HTMLSelectElement>("lab-parent").value = lab.profiles.some(
      (p) => p.id === parentChoice,
    )
      ? parentChoice
      : "";
    $("lab-summary").textContent =
      `${lab.profiles.length} / ${MAX_PROFILES} profils · Actif : ${activeProfile(lab).name}`;
    $<HTMLButtonElement>("lab-activate").disabled = selectedId === lab.activeId;
    $<HTMLButtonElement>("lab-advance").disabled =
      selectedId !== lab.activeId || !selected.world.creature.alive;
    $<HTMLButtonElement>("lab-create-button").disabled =
      lab.profiles.length >= MAX_PROFILES;
    $<HTMLButtonElement>("lab-trial").disabled =
      lab.profiles.length >= MAX_PROFILES || !lab.environment;
    $<HTMLButtonElement>("lab-reuse").disabled = !selected.trial;
    $("lab-terrain").textContent = lab.environment
      ? `Terrain mémorisé : ${lab.environment.id} · ${lab.environment.foods.length} aliments, ${lab.environment.objects.length} objets. Récupérations remises à zéro.`
      : "Aucun terrain mémorisé.";
    const c = selected.world.creature,
      needs = c.needs,
      drives = motivations(c);
    const genes = { ...physiology(c.genome), ...c.genome.genes };
    $("lab-details").innerHTML =
      `<p class="eyebrow">${selectedId === lab.activeId ? "INDIVIDU ACTIF" : "PROFIL EN PAUSE"}</p><h3 class="lab-profile-name">${escape(selected.name)}</h3><dl class="gene-list"><dt>Graine génétique</dt><dd>${escape(selected.geneticSeed ?? "Import / ancien génome")}</dd><dt>Graine du terrain</dt><dd>${escape(selected.world.seed)}</dd><dt>Parent</dt><dd>${escape(lab.profiles.find((p) => p.id === selected.parentId)?.name ?? "Aucun")}</dd><dt>Âge simulé</dt><dd>${(selected.world.tick / 10).toFixed(1)} s</dd><dt>État</dt><dd>${c.alive ? "Vivant" : "Vie terminée"}</dd></dl>${selected.trial ? `<p class="microcopy">Essai neuf sur ${escape(selected.trial.environment.id)}. Profil source : ${escape(lab.profiles.find((p) => p.id === selected.trial!.sourceId)!.name)}.</p>` : ""}<h3>Biologie et besoins</h3><dl class="gene-list"><dt>Énergie / santé</dt><dd>${c.metabolism.energy.toFixed(1)} / ${c.metabolism.health.toFixed(1)}</dd><dt>Digestion / toxines</dt><dd>${c.metabolism.stomach.toFixed(1)} / ${c.metabolism.toxins.toFixed(1)}</dd><dt>Faim / curiosité</dt><dd>${(drives.hunger * 100).toFixed(0)} % / ${(drives.curiosity * 100).toFixed(0)} %</dd><dt>Stimulation / fatigue / stress</dt><dd>${needs.stimulation.toFixed(1)} / ${needs.fatigue.toFixed(1)} / ${needs.stress.toFixed(1)}</dd></dl><details open><summary>Paramètres biologiques héritables · génome v${c.genome.version}</summary><dl class="gene-list">${Object.entries(
        genes,
      )
        .map(
          ([key, value]) =>
            `<dt>${GENE_LABELS[key as keyof typeof genes]}</dt><dd>${value.toFixed(3)}</dd>`,
        )
        .join(
          "",
        )}</dl>${c.genome.version === 1 ? '<p class="microcopy">Les nouveaux coefficients valent 1 pour préserver les mécanismes de cet ancien génome.</p>' : ""}</details><h3>Associations alimentaires</h3>${CUES.map((cue) => `<div class="lab-association"><span>${NAMES[cue]}</span><span>${signed(c.brain[cue].value)} · ${c.brain[cue].meals} repas</span></div>`).join("")}<h3>Associations des objets</h3>${OBJECT_CUES.map(
        (cue) => {
          const m = c.objectBrain[cue];
          return `<div class="lab-association"><span>${OBJECT_NAMES[cue]}</span><span>${signed(m.value)} · ${m.interactions} interactions</span></div><p class="microcopy">Effets appris : stimulation ${signed(m.expected.stimulation)}, fatigue ${signed(m.expected.fatigue)}, stress ${signed(m.expected.stress)}, énergie ${signed(m.expected.energy)}.</p>`;
        },
      ).join("")}`;
    $("lab-comparison").querySelector("tbody")!.innerHTML = lab.profiles
      .map((p) => {
        const c = p.world.creature;
        return `<tr><th scope="row">${escape(p.name)}${p.id === lab.activeId ? " ●" : ""}${p.trial ? `<small>${escape(p.trial.environment.id)}</small>` : ""}</th><td>${(p.world.tick / 10).toFixed(1)} s</td><td>${c.metabolism.energy.toFixed(1)}</td><td>${c.metabolism.health.toFixed(1)}</td><td>${(motivations(c).curiosity * 100).toFixed(0)} %</td><td>${CUES.map((cue) => signed(c.brain[cue].value)).join(" / ")}</td><td>${OBJECT_CUES.map((cue) => signed(c.objectBrain[cue].value)).join(" / ")}</td></tr>`;
      })
      .join("");
    comparison.render();
  }
  function action(run: () => void): void {
    try {
      run();
      changed();
      $("lab-message").textContent = "État du laboratoire conservé.";
      render();
    } catch (error) {
      $("lab-message").textContent =
        error instanceof Error ? error.message : "Action impossible.";
    }
  }
  $("lab-selected").addEventListener("change", () => {
    selectedId = $<HTMLSelectElement>("lab-selected").value;
    render();
  });
  $("lab-close").addEventListener("click", () => dialog.close());
  $("lab-activate").addEventListener("click", () =>
    action(() => {
      activateProfile(getLab(), selectedId);
    }),
  );
  $("lab-advance").addEventListener("click", () =>
    action(() => {
      if (selectedId !== getLab().activeId)
        throw new Error("Activez ce profil avant de le faire évoluer.");
      advanceActive(
        getLab(),
        300,
        observatory.observerFor(activeProfile(getLab()).world),
      );
    }),
  );
  $("lab-capture").addEventListener("click", () =>
    action(() => {
      getLab().environment = captureEnvironment(activeProfile(getLab()).world);
    }),
  );
  $("lab-trial").addEventListener("click", () =>
    action(() => {
      const p = createTrial(getLab(), selectedId);
      selectedId = p.id;
      activateProfile(getLab(), p.id);
    }),
  );
  $("lab-reuse").addEventListener("click", () =>
    action(() => {
      const trial = getLab().profiles.find((p) => p.id === selectedId)!.trial;
      if (trial) getLab().environment = structuredClone(trial.environment);
    }),
  );
  $("lab-create").addEventListener("submit", (event) => {
    event.preventDefault();
    action(() => {
      const parentId = $<HTMLSelectElement>("lab-parent").value;
      const profile = addIndividual(getLab(), {
        name: $<HTMLInputElement>("lab-name").value,
        geneticSeed: $<HTMLInputElement>("lab-genetic-seed").value,
        environmentSeed: $<HTMLInputElement>("lab-environment-seed").value,
        ...(parentId ? { parentId } : {}),
      });
      selectedId = profile.id;
      activateProfile(getLab(), profile.id);
      $<HTMLDetailsElement>("lab-new-panel").open = false;
      $<HTMLInputElement>("lab-name").value = `Individu ${getLab().nextId}`;
      $<HTMLInputElement>("lab-genetic-seed").value =
        `genome-${getLab().nextId}`;
    });
  });
  return {
    dialog,
    open: () => {
      selectedId = getLab().activeId;
      render();
      $("lab-message").textContent = "";
      $<HTMLInputElement>("lab-name").value = `Individu ${getLab().nextId}`;
      $<HTMLInputElement>("lab-genetic-seed").value =
        `genome-${getLab().nextId}`;
      $<HTMLInputElement>("lab-environment-seed").value =
        activeProfile(getLab()).world.seed;
      dialog.showModal();
    },
  };
}
