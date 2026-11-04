import {
  EcologicalObservatory,
  availability,
  ECO_POINTS,
  LIFE_POINTS,
  ECO_EVENTS,
} from "../observatory/ecological";
import type {
  EcologicalSample,
  LifeSample,
  DeathReport,
} from "../observatory/ecological-types";
import { CUES, type World } from "../sim/types";
import { actionLabel } from "../observatory/recorder";
import { NAMES } from "./renderer";
import { STAGE_NAMES } from "./ecology";
const esc = (x: string) =>
  x.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const number = (x: number) => x.toFixed(2);
const factors: Record<string, string> = {
  dormantExpired: "dormance expirée",
  waterDeficit: "déficit d’eau",
  energyDeficit: "réserves énergétiques épuisées",
  mineralDeficit: "déficit minéral",
  oldAge: "longévité dépassée",
};
const eventText = (text: string) => {
  for (const [key, label] of Object.entries(factors))
    text = text.replaceAll(key, label);
  return text
    .replaceAll("blue", "Perle de rosée")
    .replaceAll("amber", "Grain solaire")
    .replaceAll("rose", "Baie corail");
};
const colors = ["#ac7a16", "#267d99", "#b14e69"];
const clock = (tick: number) => `${(tick / 10).toFixed(1)} s`;
type Point = { tick: number; segment: number };
export function chart<T extends Point>(
  rows: T[],
  series: { label: string; color: string; value: (p: T) => number }[],
  label: string,
): string {
  if (!rows.length) return "<p>Aucune mesure enregistrée.</p>";
  const first = rows[0]!.tick,
    last = Math.max(first + 1, rows.at(-1)!.tick),
    max = Math.max(1, ...rows.flatMap((p) => series.map((s) => s.value(p))));
  const x = (p: T) => 35 + ((p.tick - first) / (last - first)) * 270,
    y = (v: number) => 115 - (v / max) * 90;
  const paths = series
    .flatMap((s) =>
      [...new Set(rows.map((p) => p.segment))].map((segment) => {
        const points = rows
          .filter((p) => p.segment === segment)
          .map((p) => `${x(p).toFixed(2)},${y(s.value(p)).toFixed(2)}`)
          .join(" ");
        return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2"/><g fill="${s.color}">${rows
          .filter((p) => p.segment === segment)
          .map((p) => `<circle cx="${x(p)}" cy="${y(s.value(p))}" r="1.8"/>`)
          .join("")}</g>`;
      }),
    )
    .join("");
  return `<figure class="eco-figure"><figcaption>${esc(label)}</figcaption><svg viewBox="0 0 320 145" role="img" aria-label="${esc(label)}"><path d="M35 20V115H305" fill="none" stroke="#8b9e83"/><text x="0" y="28">${max.toFixed(1)}</text><text x="14" y="118">0</text><text x="35" y="138">${clock(first)}</text><text x="235" y="138">${clock(last)}</text>${paths}</svg><div class="eco-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div></figure>`;
}
const byVariety = (key: "plants" | "fruits") =>
  CUES.map((c, i) => ({
    label: NAMES[c],
    color: colors[i]!,
    value: (p: EcologicalSample) => p[key][c],
  }));
const foodText = (f: ReturnType<typeof availability>) =>
  `Présents : ${f.physicalCount} · perceptibles : ${f.visibleCount} · contact + capacité stomacale : ${f.contactAndFits}.`;
function foodDetails(f: ReturnType<typeof availability>): string {
  return `<p>${foodText(f)}</p><p class="microcopy">Présence physique ≠ perception ≠ ingestion ≠ absorption. Ce test passif du rayon sensoriel est distinct de la perception effectivement enregistrée lors d’une décision. Après un décès, il n’implique aucune activité sensorielle. « Contact + capacité » signifie distance ≤ 9 et place pour la masse de l’aliment, sans garantir une ingestion. Le monde ne calcule pas de chemin ni de garantie d’accessibilité future.</p><p>Distance au plus proche aliment physique : ${f.nearestPhysical === null ? "aucun" : number(f.nearestPhysical)} unités. Nutriments physiques présents : ${number(f.presentNutrients)} ; ils ne sont pas encore assimilés.</p><ul>${f.visible.map((x) => `<li>${esc(NAMES[x.cue])} #${x.id} · distance ${number(x.distance)} · trajet minimal théorique ${number(x.minimumTravelSeconds)} s · ${x.contact ? "au contact" : "hors contact"} · ${x.stomachFits ? "place stomacale suffisante" : "estomac trop plein"}</li>`).join("") || "<li>Aucun aliment perceptible.</li>"}</ul>`;
}
function activeLife(samples: LifeSample[]): LifeSample[] {
  let cut = 0;
  return samples.flatMap((p) => {
    if (!p.present) {
      cut++;
      return [];
    }
    return [{ ...p, segment: p.segment * 1000 + cut }];
  });
}
function lifeCurves(samples: LifeSample[]): string {
  samples = activeLife(samples);
  return chart(
    samples,
    [
      { label: "Énergie", color: "#8b701b", value: (p) => p.body.energy },
      { label: "Santé", color: "#386b48", value: (p) => p.body.health },
      { label: "Faim × 100", color: "#a7574c", value: (p) => p.hunger * 100 },
    ],
    "Physiologie récente — valeurs de 0 à 100",
  );
}
export function deathMarkup(r: DeathReport): string {
  const recentAbsorbed = CUES.map((c) => ({
    c,
    n: r.recentTotals.absorbed[c].nutrients,
    e: r.recentTotals.absorbed[c].energy,
  }));
  return `<h3>Rapport de décès · ${clock(r.tick)}</h3><p>${r.provenance === "recorded" ? "Arrêt observé pendant la capture." : "Décès non capturé : passé causal inconnu."}</p><h4>Faits mesurés</h4><ul>${r.facts.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p>Énergie ${number(r.final.body.energy)} · santé ${number(r.final.body.health)} · faim ${number(r.final.hunger)} · fatigue ${number(r.final.body.fatigue)} · stress ${number(r.final.body.stress)} · toxines ${number(r.final.body.toxins)}.</p>${lifeCurves(r.samples)}<h4>Présence, perception et conditions de contact</h4>${foodDetails(r.final.food)}<h4>Ingestions et absorption enregistrées</h4><p>Fenêtres bornées : ${r.ingestions.length} dernières ingestions et ${r.samples.length} relevés physiologiques. Ces fenêtres peuvent couvrir des durées différentes. Les totaux ci-dessous proviennent des ${r.recentTotals.sampleCount} relevés originaux de ${clock(r.recentTotals.firstSampleTick)} à ${clock(r.recentTotals.lastSampleTick)}, avant réduction éventuelle de la courbe.</p><ul>${recentAbsorbed.map((x) => `<li>${esc(NAMES[x.c])} : ${number(x.n)} nutriments absorbés, ${number(x.e)} énergie effectivement gagnée dans les intervalles retenus.</li>`).join("")}</ul><ol>${
    r.ingestions
      .slice(-12)
      .map(
        (x) =>
          `<li>${clock(x.tick)} · ${esc(NAMES[x.food.cue])} #${x.food.id} · masse ${x.food.mass}, dose nutritive ${x.food.nutrients} ; ${x.plantFruit ? "fruit végétal" : "autre aliment"}.</li>`,
      )
      .join("") ||
    "<li>Aucune ingestion capturée dans la fenêtre conservée.</li>"
  }</ol><h4>Dernières décisions effectivement prises</h4><ol>${
    r.decisions
      .slice(-10)
      .map(
        (x) =>
          `<li>${clock(x.tick)} · ${esc(actionLabel(x.trace.chosen))} · branche ${esc(x.trace.branch)} · ${x.trace.foods.length} aliments perçus : ${x.trace.foods.map((f) => `#${f.id} à ${number(f.distance)}`).join(", ") || "aucun"}.</li>`,
      )
      .join("") || "<li>Aucune décision capturée.</li>"
  }</ol><details><summary>Associations finales et scores du dernier choix</summary><p>Associations conservées à l’arrêt : ${CUES.map((c) => `${NAMES[c]} ${number(r.foodAssociations[c].value)} (${r.foodAssociations[c].meals} repas achevés)`).join(" · ")}. Elles ne sont pas nécessairement identiques à celles d’une décision antérieure.</p>${r.lastDecision ? `<p>Dernière décision capturée à ${clock(r.lastDecision.tick)} : branche ${esc(r.lastDecision.branch)}, politique ${esc(r.lastDecision.foodPolicy)}.</p><ul>${r.lastDecision.candidates.map((c) => `<li>${esc(actionLabel(c.action))} · étape ${esc(c.stage)} · score calculé ${number(c.score)}${c.association ? ` · association utilisée ${number(c.association.value)}, expériences ${c.association.experiences}` : ""}.</li>`).join("") || "<li>Aucun score calculé dans cette branche.</li>"}</ul>` : "<p>Aucun choix antérieur capturé ; aucun score reconstruit.</p>"}</details><details><summary>Actions exécutées et état écologique</summary><ol>${r.executions
    .slice(-12)
    .map(
      (x) =>
        `<li>${clock(x.tick)} · ${esc(actionLabel(x.action))} · déplacement réellement mesuré ${number(x.distance)} sur ce tick.</li>`,
    )
    .join(
      "",
    )}</ol><p>Plantes vivantes : ${CUES.map((c) => `${NAMES[c]} ${r.ecosystem.plants[c]}`).join(" · ")}.</p><p>Fruits végétaux : ${CUES.map((c) => `${NAMES[c]} ${r.ecosystem.fruits[c]}`).join(" · ")}. Eau du sol ${number(r.ecosystem.soilWater)}, minéraux ${number(r.ecosystem.soilMinerals)}.</p></details><h4>Hypothèses à examiner</h4><ul>${r.hypotheses.map((x) => `<li>${esc(x)}</li>`).join("") || "<li>Aucune hypothèse supplémentaire étayée par les relevés disponibles.</li>"}</ul><h4>Limites et incertitudes</h4><ul>${r.limitations.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}
export function createEcologicalPanel(
  getWorld: () => World,
  observer: EcologicalObservatory,
  save: () => void,
) {
  const element = document.createElement("section");
  element.id = "ecological-observatory";
  element.hidden = true;
  element.className = "biology-card ecological-observatory";
  element.innerHTML = `<div class="dialog-heading"><h2>Observatoire écologique</h2><button id="eco-obs-close" aria-label="Fermer l’observatoire écologique">Fermer</button></div><label class="sense-toggle"><input type="checkbox" id="eco-obs-capture" checked> Enregistrer passivement</label><p class="microcopy">Fermer ce panneau conserve la capture. Désactiver crée une lacune, jamais reconstruite. ${ECO_POINTS} relevés écologiques (5 s), ${LIFE_POINTS} physiologiques (1 s), ${ECO_EVENTS} événements maximum.</p><p id="eco-obs-status" role="status"></p><div id="eco-obs-overview"></div><div id="eco-obs-charts"></div><details id="eco-obs-advanced"><summary>Détails scientifiques et chronologie</summary><div id="eco-obs-spatial"></div><div id="eco-obs-counts"></div><ol id="eco-obs-events"></ol><div id="eco-obs-life"></div></details><section id="eco-death-report"></section><button id="eco-report-download">Exporter le relevé scientifique JSON</button><p class="microcopy">Cet export de diagnostic ne remplace pas une sauvegarde du jeu. Les historiques ordinaires ne sont pas rechargés. Les rapports de décès sont conservés séparément sur cet appareil avec le laboratoire correspondant.</p>`;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    element.querySelector<T>("#" + id)!;
  let lastWorld: World | undefined,
    lastRevision = -1,
    lastDead: DeathReport | undefined,
    lastChartKey = "";
  $("eco-obs-close").addEventListener("click", () => {
    element.hidden = true;
    document
      .querySelector("#open-ecological-observatory")
      ?.setAttribute("aria-expanded", "false");
    document
      .querySelector<HTMLButtonElement>("#open-ecological-observatory")
      ?.focus({ preventScroll: true });
  });
  $("eco-obs-capture").addEventListener("change", () => {
    observer.setEnabled($<HTMLInputElement>("eco-obs-capture").checked);
    observer.capture(getWorld());
    lastRevision = -1;
    render();
    save();
  });
  $("eco-obs-advanced").addEventListener("toggle", () => {
    lastRevision = -1;
    render();
  });
  $("eco-report-download").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            kind: "luma-ecological-observation",
            version: 1,
            seed: getWorld().seed,
            tick: getWorld().tick,
            session: observer.inspect(getWorld()),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "luma-observation-ecologique.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function render() {
    if (element.hidden) return;
    const w = getWorld(),
      s = observer.inspect(w);
    if (lastWorld === w && lastRevision === s.revision && lastDead === s.death)
      return;
    if (lastWorld !== w) lastChartKey = "";
    lastWorld = w;
    lastRevision = s.revision;
    lastDead = s.death;
    $("eco-obs-status").textContent =
      `${observer.enabled ? "Capture active" : "Capture suspendue"} · depuis ${clock(s.startTick)} · lacunes ${s.gaps} · ${s.ecological.length} relevés écologiques, ${s.life.length} corporels.`;
    const latest = s.ecological.at(-1)!;
    $("eco-obs-overview").innerHTML = CUES.map(
      (c) =>
        `<p><strong>${esc(NAMES[c])}</strong> : ${latest.plants[c]} plantes vivantes (graines incluses), ${latest.fruits[c]} fruits végétaux. ${latest.plants[c] === 0 ? "Absence végétale locale constatée à ce relevé." : latest.fruits[c] === 0 ? "Pas de fruit disponible ; la variété végétale est encore présente." : ""}</p>`,
    ).join("");
    const chartKey = `${w.seed}/${s.segment}/${s.ecological.at(-1)?.tick}/${s.ecological.length}/${s.startTick}`;
    if (lastChartKey !== chartKey) {
      lastChartKey = chartKey;
      $("eco-obs-charts").innerHTML =
        chart(
          s.ecological,
          byVariety("plants"),
          "Populations végétales vivantes par variété",
        ) +
        chart(
          s.ecological,
          byVariety("fruits"),
          "Fruits végétaux disponibles par variété",
        ) +
        chart(
          s.ecological,
          [
            {
              label: "Eau du sol",
              color: "#267d99",
              value: (p) => p.soilWater,
            },
            {
              label: "Minéraux du sol",
              color: "#705e38",
              value: (p) => p.soilMinerals,
            },
          ],
          "Ressources du sol — sommes des 25 zones",
        );
    }
    if ($<HTMLDetailsElement>("eco-obs-advanced").open) {
      $("eco-obs-spatial").innerHTML =
        `<h3>Occupation des 25 zones au dernier relevé</h3><div class="eco-occupancy">${latest.cells.map((cell, i) => `<div><strong>${i + 1}</strong>${CUES.map((c, j) => `<span style="color:${colors[j]}">${cell[c]}</span>`).join("")}</div>`).join("")}</div><p class="microcopy">Chaque case indique solaire / rosée / corail. L’historique spatial figure dans l’export, pas seulement dans cette carte.</p>`;
      $("eco-obs-counts").innerHTML = `<h3>Stades et événements</h3>${CUES.map(
        (c) =>
          `<p><strong>${NAMES[c]}</strong> : ${Object.entries(
            latest.stagesByVariety[c],
          )
            .map(
              ([k, n]) => `${STAGE_NAMES[k as keyof typeof STAGE_NAMES]} ${n}`,
            )
            .join(
              " · ",
            )}. Depuis la capture : germinations ${s.germinations[c]}, descendants ${s.births[c]}, morts ${s.deaths[c]}, fruits produits ${s.produced[c]}, consommés ${s.consumed[c]}. Facteurs actifs aux décès observés : ${
            Object.entries(s.mortalityFactors[c])
              .map(([k, n]) => `${factors[k] ?? k} ${n}`)
              .join(", ") || "aucun relevé"
          } (plusieurs possibles par mort).</p>`,
      ).join(
        "",
      )}<p class="microcopy">Compteurs mondiaux persistants : ${Object.entries(
        latest.counters,
      )
        .map(([k, n]) => `${k} ${n}`)
        .join(
          " · ",
        )}. Les compteurs par variété sont limités aux périodes observées.</p>`;
      $("eco-obs-events").innerHTML = s.events
        .slice()
        .reverse()
        .map(
          (e) =>
            `<li><strong>${clock(e.tick)}</strong> · ${esc(eventText(e.text))}</li>`,
        )
        .join("");
      $("eco-obs-life").innerHTML =
        lifeCurves(s.life) +
        chart(
          activeLife(s.life),
          [
            {
              label: "Fatigue",
              color: "#7a5840",
              value: (p) => p.body.fatigue,
            },
            { label: "Stress", color: "#a74e65", value: (p) => p.body.stress },
          ],
          "Fatigue et stress récents",
        ) +
        `<h3>Disponibilité alimentaire actuelle</h3>${foodDetails(availability(w))}<p class="microcopy">Événements retirés par les limites : ${
          Object.entries(s.dropped)
            .map(([k, n]) => `${k} ${n}`)
            .join(" · ") || "aucun"
        }. Les courbes ne relient pas les interruptions de capture.</p>`;
    }
    $("eco-death-report").innerHTML = s.death
      ? deathMarkup(s.death)
      : "<p>Aucun décès capturé pour ce monde.</p>";
  }
  return {
    element,
    render,
    open() {
      observer.capture(getWorld());
      element.hidden = false;
      document
        .querySelector("#open-ecological-observatory")
        ?.setAttribute("aria-expanded", "true");
      lastRevision = -1;
      lastChartKey = "";
      render();
      element.scrollIntoView({ block: "start", behavior: "smooth" });
    },
  };
}
