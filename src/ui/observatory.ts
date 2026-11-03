import { activeProfile, type Laboratory } from "../lab/laboratory";
import { motivations } from "../sim/curiosity";
import { bodyState } from "../sim/diagnostics";
import { GENE_LABELS, physiology } from "../sim/genome";
import { CUES, OBJECT_CUES, type Cue, type ObjectCue } from "../sim/types";
import {
  LearningObservatory,
  actionLabel,
  HISTORY_LIMIT,
  POINT_LIMIT,
  SAMPLE_LIMIT,
  type LearningPoint,
  type TimelineKind,
} from "../observatory/recorder";
import {
  PROTOCOLS,
  runLearningExperiment,
  type Protocol,
} from "../observatory/experiments";
import { NAMES } from "./renderer";
import { OBJECT_NAMES } from "./object-info";
import { instrumentalMarkup } from "./instrumental";

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
const name = (cue: Cue | ObjectCue): string =>
  cue in NAMES ? NAMES[cue as Cue] : OBJECT_NAMES[cue as ObjectCue];
const status = (value: number, count: number): string =>
  !count
    ? "Inconnue · aucune expérience"
    : value === 0
      ? "Neutre après expérience"
      : value > 0
        ? "Association positive"
        : "Association négative";
const motiveNames = {
  hunger: "Faim",
  curiosity: "Curiosité",
  rest: "Repos",
  comfort: "Apaisement",
};
const kindNames: Record<TimelineKind, string> = {
  instrumental: "Apprentissage instrumental",
  capture: "Capture / intervention",
  perception: "Perception",
  decision: "Décision",
  action: "Action",
  ingestion: "Ingestion",
  consequence: "Conséquence",
  association: "Association",
  state: "État net",
};
const effectNames: Record<string, string> = {
  energy: "énergie",
  health: "santé",
  absorbedToxin: "dose toxique absorbée",
  stimulation: "stimulation",
  fatigue: "fatigue",
  stress: "stress",
  stomach: "estomac",
  toxins: "toxines",
};
const effects = (data: object): string =>
  Object.entries(data)
    .filter(([, n]) => typeof n === "number")
    .map(([key, n]) => `${effectNames[key] ?? key} ${signed(n as number)}`)
    .join(" · ");

// Draw measured values; never bridge capture gaps. Tables provide exact values.
function curves(series: { label: string; points: LearningPoint[] }[]): string {
  const all = series.flatMap((line) => line.points);
  if (!all.length)
    return '<p class="microcopy">Aucun historique capturé pour ce signal.</p>';
  const min = Math.min(...all.map((p) => p.tick)),
    max = Math.max(min + 1, ...all.map((p) => p.tick));
  const x = (p: LearningPoint): number =>
    12 + ((p.tick - min) / (max - min)) * 296;
  const y = (p: LearningPoint): number => 55 - p.after * 22;
  const colors = ["#315e47", "#a65a47"];
  return `<svg class="learning-chart" viewBox="0 0 320 110" role="img" aria-label="Valeur associative selon le temps simulé, de moins deux à plus deux"><line x1="12" y1="55" x2="308" y2="55" stroke="#a1b193" stroke-dasharray="4 4"/>${series
    .map((line, i) => {
      const segments = [...new Set(line.points.map((p) => p.segment))];
      return segments
        .map((segment) => {
          const points = line.points.filter((p) => p.segment === segment);
          return `<polyline points="${points.map((p, j) => `${j ? `${x(p)},${y(points[j - 1]!)} ` : ""}${x(p)},${y(p)}`).join(" ")}" fill="none" stroke="${colors[i]}" stroke-width="2"/>${points.map((p) => `<circle cx="${x(p)}" cy="${y(p)}" r="2.5" fill="${colors[i]}"/>`).join("")}`;
        })
        .join("");
    })
    .join(
      "",
    )}</svg><p class="microcopy">${(min / 10).toFixed(1)} à ${(max / 10).toFixed(1)} s · axe vertical −2 à +2 · ${series.map((line, i) => `<span style="color:${colors[i]}">${escape(line.label)}</span>`).join(" / ")} · paliers entre mises à jour ; interruptions non reliées.</p>`;
}

export function createObservatoryPanel(
  getLab: () => Laboratory,
  recorder: LearningObservatory,
): { element: HTMLElement; open: () => void; render: () => void } {
  const element = document.createElement("section");
  element.id = "observatory";
  element.className = "biology-card observatory";
  element.hidden = true;
  element.setAttribute("aria-label", "Observatoire de l’apprentissage");
  element.innerHTML = `<div class="dialog-heading"><p class="eyebrow">OBSERVATOIRE DE L’APPRENTISSAGE</p><button class="icon-button" id="obs-close" aria-label="Fermer l’observatoire">✕</button></div><h2>Voir ce qui s’apprend.</h2><p class="microcopy">Données du moteur et mesures de capture. Aucun raisonnement causal supplémentaire n’est attribué à Luma.</p><label class="sense-toggle"><input type="checkbox" id="obs-record" checked>Enregistrer l’activité</label><p id="obs-summary" class="microcopy"></p><p id="obs-current"></p><details open><summary>Dernière décision réellement calculée</summary><div id="obs-decision"></div></details><details open><summary>Actions et conséquences extérieures</summary><div id="obs-instrumental"></div></details><details open><summary>Associations et conséquences</summary><div id="obs-memories" class="observation-memories"></div></details><details open><summary>Évolution des associations</summary><label for="obs-cue">Signal à suivre</label><select id="obs-cue">${[...CUES, ...OBJECT_CUES].map((cue) => `<option value="${cue}">${name(cue)}</option>`).join("")}</select><div id="obs-curve"></div><div id="obs-values" class="observatory-table-wrap"></div></details><details><summary>Chronologie consultable</summary><label for="obs-filter">Événements à afficher</label><select id="obs-filter"><option value="all">Tous les événements</option>${Object.entries(
    kindNames,
  )
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      "",
    )}</select><p class="microcopy">Ordre d’émission du moteur, résolution de 100 ms. Les variations nettes sont échantillonnées chaque seconde ; elles ne sont pas attribuées à l’objet voisin. La perception est celle des ticks de décision.</p><ol id="obs-timeline" class="observation-timeline"></ol><div class="save-actions"><button id="obs-older">Plus ancien</button><button id="obs-newer">Plus récent</button></div></details>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
    element.querySelector(`#${id}`) as T;
  let offset = 0,
    rendered = "";
  let lastWorld: Laboratory["profiles"][number]["world"] | undefined;
  function render(): void {
    if (element.hidden) return;
    const profile = activeProfile(getLab()),
      w = profile.world,
      c = w.creature;
    const s = recorder.capture(w);
    const key = `${profile.id}/${Math.floor(w.tick / 10)}/${actionLabel(c.action)}/${s?.revision}/${recorder.enabled}/${offset}/${$<HTMLSelectElement>("obs-cue").value}/${$<HTMLSelectElement>("obs-filter").value}`;
    if (key === rendered && w === lastWorld) return;
    rendered = key;
    lastWorld = w;
    $("obs-summary").textContent =
      `${profile.name} · tick ${w.tick} · ${recorder.enabled ? "capture active" : "capture suspendue"} · historique en mémoire seulement, perdu au rechargement. Limites par profil : ${HISTORY_LIMIT} événements, ${POINT_LIMIT} points associatifs, ${SAMPLE_LIMIT} états. ${s?.dropped ?? 0} événements anciens retirés.`;
    $("obs-current").textContent = `Action actuelle : ${actionLabel(c.action)}`;
    $("obs-instrumental").innerHTML = instrumentalMarkup(w, s);
    const d = s?.lastDecision;
    $("obs-decision").innerHTML = d
      ? `<p class="microcopy">Instantané au tick ${d.tick}, avant déplacement et métabolisme : ${escape(actionLabel(d.chosen))}. Branche exécutée : <strong>${d.branch}</strong> ; politique alimentaire : <strong>${d.foodPolicy}</strong>.</p><dl class="gene-list">${Object.entries(
          d.motivations,
        )
          .map(
            ([key, value]) =>
              `<dt>${motiveNames[key as keyof typeof motiveNames]}</dt><dd>${(value * 100).toFixed(2)} %</dd>`,
          )
          .join(
            "",
          )}<dt>Stimulation / fatigue / stress</dt><dd>${d.needs.stimulation.toFixed(2)} / ${d.needs.fatigue.toFixed(2)} / ${d.needs.stress.toFixed(2)}</dd><dt>Énergie / estomac</dt><dd>${d.energy.toFixed(2)} / ${d.stomach.toFixed(2)}</dd></dl><h3>Perception utilisée</h3><p class="microcopy">Aliments : ${d.foods.map((f) => `${name(f.cue)} #${f.id}, distance ${f.distance.toFixed(2)}`).join(" ; ") || "aucun"}.</p><p class="microcopy">Objets : ${d.objects.map((o) => `${name(o.cue)} #${o.id}, distance ${o.distance.toFixed(2)}, ${o.unknown ? "inconnu" : "déjà expérimenté"}`).join(" ; ") || "aucun"}.</p><div class="observatory-table-wrap"><table><caption>Scores calculés au tick ${d.tick}</caption><thead><tr><th>Étape / candidat</th><th>Score</th><th>Association utilisée</th></tr></thead><tbody>${d.candidates.map((candidate) => `<tr><th scope="row">${candidate.stage === "food" ? "Sélection alimentaire" : "Arbitrage"}<br>${escape(actionLabel(candidate.action))}</th><td>${candidate.score.toFixed(6)}</td><td>${candidate.instrumental ? `Mémoire instrumentale #${candidate.instrumental.targetId} : estimation ${(candidate.instrumental.probability * 100).toFixed(1)} %, valeur ${signed(candidate.instrumental.value)}, ${candidate.instrumental.attempts} essais` : candidate.association ? `${name(candidate.association.cue)} : ${signed(candidate.association.value)} · ${candidate.association.experiences} expériences` : "Aucune valeur associative lue à cette étape"}${candidate.predictedEffects ? `<br>Effets attendus bornés utilisés : ${effects(candidate.predictedEffects)}` : ""}</td></tr>`).join("")}</tbody></table></div><p class="microcopy">Les étapes de sélection alimentaire et d’arbitrage sont distinctes. En exploration alimentaire, les autres aliments ne sont pas notés. Si la branche urgent-food est exécutée, repos et objets ne sont pas évalués. L’exploration spatiale de repli n’a pas de score. Aucun score n’est recalculé ici.</p>`
      : '<p class="microcopy">Aucune décision capturée depuis l’ouverture ou la reprise. L’action actuelle peut précéder cette capture.</p>';
    $("obs-memories").innerHTML = [
      ...CUES.map((cue) => {
        const m = c.brain[cue],
          observed = s?.foodEffects[cue];
        return `<article><h3>${name(cue)}</h3><p>${status(m.value, m.meals)} · <strong>${signed(m.value)}</strong> · ${m.meals} expériences</p><p class="microcopy">Dernier bilan mémorisé : ${m.meals ? signed(m.lastReward) : "aucun"}.</p><p class="microcopy">${observed ? `Dernière absorption capturée : ${effects(observed)}. ${observed.partial ? "Bilan partiel, origine antérieure inconnue." : "Bilan complet du bolus suivi."}` : "Conséquences détaillées non capturées. Une sauvegarde conserve l’association, pas cette mesure."}</p></article>`;
      }),
      ...OBJECT_CUES.map((cue) => {
        const m = c.objectBrain[cue],
          observed = s?.objectEffects[cue];
        return `<article><h3>${name(cue)}</h3><p>${status(m.value, m.interactions)} · <strong>${signed(m.value)}</strong> · ${m.interactions} expériences</p><p class="microcopy">Dernier bilan mémorisé : ${m.interactions ? signed(m.lastReward) : "aucun"}.</p><p class="microcopy">Effets attendus dans la mémoire : ${effects(m.expected)}.</p><p class="microcopy">${observed ? `Derniers effets mesurés par le moteur : ${effects(observed)}.` : "Conséquences détaillées non capturées."}</p></article>`;
      }),
    ].join("");
    const cue = $<HTMLSelectElement>("obs-cue").value;
    const points = s?.points.filter((p) => p.cue === cue) ?? [];
    $("obs-curve").innerHTML = curves([{ label: profile.name, points }]);
    $("obs-values").innerHTML =
      `<table><caption>Derniers points capturés · ${name(cue as Cue | ObjectCue)}</caption><thead><tr><th>Tick</th><th>Association</th><th>Bilan / expériences</th></tr></thead><tbody>${points
        .slice(-12)
        .map(
          (p) =>
            `<tr><td>${p.tick}</td><td>${signed(p.before)} → ${signed(p.after)}</td><td>${p.reward === undefined ? "État à la capture" : signed(p.reward)} / ${p.count}</td></tr>`,
        )
        .join("")}</tbody></table>`;
    const filter = $<HTMLSelectElement>("obs-filter").value;
    const rows = (s?.history ?? [])
      .filter((entry) => filter === "all" || filter === entry.kind)
      .slice()
      .reverse();
    offset = Math.min(
      offset,
      Math.max(0, Math.floor((rows.length - 1) / 40) * 40),
    );
    $("obs-timeline").innerHTML =
      rows
        .slice(offset, offset + 40)
        .map(
          (entry) =>
            `<li><p><time>Tick ${entry.tick} · ${(entry.tick / 10).toFixed(1)} s</time> · ${kindNames[entry.kind]} · #${entry.id}</p><strong>${escape(entry.title)}</strong>${entry.details.map((line) => `<p>${escape(line)}</p>`).join("")}${entry.refs.length ? `<small>Références disponibles : ${escape(entry.refs.join(" · "))}</small>` : ""}</li>`,
        )
        .join("") || "<li>Aucun événement capturé pour ce filtre.</li>";
    $<HTMLButtonElement>("obs-older").disabled = offset + 40 >= rows.length;
    $<HTMLButtonElement>("obs-newer").disabled = offset === 0;
  }
  $("obs-close").addEventListener("click", () => {
    recorder.setEnabled(false);
    element.hidden = true;
  });
  $("obs-record").addEventListener("change", () => {
    recorder.setEnabled($<HTMLInputElement>("obs-record").checked);
    render();
  });
  for (const id of ["obs-cue", "obs-filter"])
    $(id).addEventListener("change", () => {
      offset = 0;
      render();
    });
  $("obs-older").addEventListener("click", () => {
    offset += 40;
    render();
  });
  $("obs-newer").addEventListener("click", () => {
    offset = Math.max(0, offset - 40);
    render();
  });
  return {
    element,
    render,
    open: () => {
      element.hidden = false;
      recorder.setEnabled(true);
      $<HTMLInputElement>("obs-record").checked = true;
      rendered = "";
      render();
      element.scrollIntoView({ block: "start" });
    },
  };
}

export function createIndividualComparison(
  getLab: () => Laboratory,
  recorder: LearningObservatory,
): { element: HTMLElement; render: () => void } {
  const element = document.createElement("section");
  element.className = "lab-experiments observatory-comparison";
  element.innerHTML = `<h3>Observatoire · comparer deux individus</h3><div class="comparison-choices"><label>Individu A<select id="compare-a" aria-label="Individu A"></select></label><label>Individu B<select id="compare-b" aria-label="Individu B"></select></label></div><div id="compare-states" class="observatory-table-wrap"></div><p class="microcopy">États conservés : âges et histoires peuvent différer. Aucune expérience : association inconnue ; zéro après expérience : association neutre. Les motivations sont dérivées de ces états ; elles n’expliquent pas rétroactivement une ancienne décision.</p><label for="compare-cue">Association à comparer</label><select id="compare-cue">${[...CUES, ...OBJECT_CUES].map((cue) => `<option value="${cue}">${name(cue)}</option>`).join("")}</select><div id="compare-history"></div><h3>Expériences contrôlées, copies isolées</h3><p class="microcopy">Copies neuves des deux génomes, exécutées successivement, sans modifier les profils. Huit expositions à la baie solaire ; corps remis à énergie 10, santé 100, sans toxines, fatigue ou stress avant chacune. Associations conservées entre expositions, initialement inconnues. Commandes aux mêmes ticks : une exposition toutes les 18 s, retrait des aliments non consommés après 10 s. Terrain identique, politique habituelle sans ingestion forcée. Les histoires originales ne sont pas reproduites.</p><label for="compare-protocol">Protocole reproductible</label><select id="compare-protocol">${Object.entries(
    PROTOCOLS,
  )
    .map(([key, label]) => `<option value="${key}">${label}</option>`)
    .join(
      "",
    )}</select><p class="microcopy">Préférence : 18 nutriments, 0 toxine. Aversion / diversité : 4 nutriments, 5 toxines. Changement : quatre expositions bénéfiques puis quatre modifiées. La sensibilité biologique peut empêcher une aversion ; le résultat est mesuré, jamais imposé.</p><button id="compare-run" class="primary-button">Exécuter les deux expériences</button><div id="compare-result" role="status"></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
    element.querySelector(`#${id}`) as T;
  let selected = "",
    resultKey = "";
  function render(): void {
    const profiles = getLab().profiles;
    for (const [id, fallback] of [
      ["compare-a", 0],
      ["compare-b", 1],
    ] as const) {
      const control = $<HTMLSelectElement>(id),
        old = control.value;
      control.innerHTML = profiles
        .map(
          (p) => `<option value="${escape(p.id)}">${escape(p.name)}</option>`,
        )
        .join("");
      control.value = profiles.some((p) => p.id === old)
        ? old
        : profiles[Math.min(fallback, profiles.length - 1)]!.id;
    }
    const a = profiles.find(
      (p) => p.id === $<HTMLSelectElement>("compare-a").value,
    )!;
    const b = profiles.find(
      (p) => p.id === $<HTMLSelectElement>("compare-b").value,
    )!;
    const pair = JSON.stringify([
      a.id,
      b.id,
      a.name,
      b.name,
      a.world.creature.genome,
      b.world.creature.genome,
    ]);
    if (pair !== selected) {
      selected = pair;
      $("compare-result").innerHTML = "";
      resultKey = "";
    }
    $<HTMLButtonElement>("compare-run").disabled = a.id === b.id;
    const ga = {
      ...physiology(a.world.creature.genome),
      ...a.world.creature.genome.genes,
    };
    const gb = {
      ...physiology(b.world.creature.genome),
      ...b.world.creature.genome.genes,
    };
    const row = (label: string, va: string, vb: string): string =>
      `<tr><th scope="row">${escape(label)}</th><td>${escape(va)}</td><td>${escape(vb)}</td></tr>`;
    const group = (label: string): string =>
      `<tr><th colspan="3">${label}</th></tr>`;
    const da = motivations(a.world.creature),
      db = motivations(b.world.creature);
    const ba = bodyState(a.world.creature),
      bb = bodyState(b.world.creature);
    $("compare-states").innerHTML =
      `<table><caption>Comparaison des états réellement conservés</caption><thead><tr><th>Mesure</th><th>${escape(a.name)}</th><th>${escape(b.name)}</th></tr></thead><tbody>${row("Tick", String(a.world.tick), String(b.world.tick))}${group("Paramètres génétiques")}${Object.entries(
        ga,
      )
        .map(([key, value]) =>
          row(
            GENE_LABELS[key as keyof typeof ga],
            value.toFixed(3),
            gb[key as keyof typeof gb].toFixed(3),
          ),
        )
        .join("")}${group("Biologie et besoins actuels")}${Object.entries(ba)
        .map(([key, value]) =>
          row(
            effectNames[key] ?? key,
            value.toFixed(2),
            bb[key as keyof typeof bb].toFixed(2),
          ),
        )
        .join("")}${group("Motivations actuelles, dérivées")}${Object.entries(
        da,
      )
        .map(([key, value]) =>
          row(
            motiveNames[key as keyof typeof da],
            (value * 100).toFixed(2) + " %",
            (db[key as keyof typeof db] * 100).toFixed(2) + " %",
          ),
        )
        .join(
          "",
        )}${group("Associations : valeur et expériences")}${CUES.map((cue) => row(name(cue), `${signed(a.world.creature.brain[cue].value)} / ${a.world.creature.brain[cue].meals}`, `${signed(b.world.creature.brain[cue].value)} / ${b.world.creature.brain[cue].meals}`)).join("")}${OBJECT_CUES.map((cue) => row(name(cue), `${signed(a.world.creature.objectBrain[cue].value)} / ${a.world.creature.objectBrain[cue].interactions}`, `${signed(b.world.creature.objectBrain[cue].value)} / ${b.world.creature.objectBrain[cue].interactions}`) + row(`Effets attendus · ${name(cue)}`, effects(a.world.creature.objectBrain[cue].expected), effects(b.world.creature.objectBrain[cue].expected))).join("")}</tbody></table>`;
    const cue = $<HTMLSelectElement>("compare-cue").value;
    $("compare-history").innerHTML =
      curves(
        [a, b].map((p) => ({
          label: p.name,
          points:
            recorder
              .inspect(p.world)
              ?.points.filter((point) => point.cue === cue) ?? [],
        })),
      ) +
      '<p class="microcopy">Capture de session uniquement ; une absence de courbe ne signifie pas absence d’apprentissage. Ouvrez l’observatoire puis avancez les essais du laboratoire aux mêmes ticks pour comparer leurs histoires.</p>';
    if (
      resultKey &&
      resultKey !==
        `${selected}/${$<HTMLSelectElement>("compare-protocol").value}`
    )
      $("compare-result").innerHTML = "";
  }
  for (const id of [
    "compare-a",
    "compare-b",
    "compare-cue",
    "compare-protocol",
  ])
    $(id).addEventListener("change", render);
  $("compare-run").addEventListener("click", () => {
    const profiles = getLab().profiles;
    const pair = ["compare-a", "compare-b"].map(
      (id) => profiles.find((p) => p.id === $<HTMLSelectElement>(id).value)!,
    );
    const protocol = $<HTMLSelectElement>("compare-protocol").value as Protocol;
    const results = pair.map((p) => runLearningExperiment(p, protocol));
    resultKey = `${selected}/${protocol}`;
    $("compare-result").innerHTML =
      `<h3>${PROTOCOLS[protocol]} · baie solaire</h3>${curves(results.map((result) => ({ label: result.name, points: result.session.points.filter((p) => p.domain === "food" && p.cue === "amber") })))}<div class="observatory-table-wrap"><table><caption>Points d’apprentissage des copies expérimentales</caption><thead><tr><th>Individu</th><th>Tick / expérience</th><th>Valeur / bilan</th></tr></thead><tbody>${results
        .map((result) =>
          result.session.points
            .filter(
              (p) =>
                p.domain === "food" &&
                p.cue === "amber" &&
                p.reward !== undefined,
            )
            .map(
              (p) =>
                `<tr><th scope="row">${escape(result.name)}</th><td>${p.tick} / ${p.count}</td><td>${signed(p.after)} / ${signed(p.reward!)}</td></tr>`,
            )
            .join(""),
        )
        .join(
          "",
        )}</tbody></table></div><p class="microcopy">${results.map((r) => `${escape(r.name)} : ${r.completed}/8 digestions terminées, ${r.ticks} ticks, valeur finale ${signed(r.finalValue)}`).join(" ; ")}. Un refus peut produire moins de huit expériences ; la politique n’est pas contournée.</p>`;
  });
  return { element, render };
}
