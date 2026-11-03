import type { World } from "../sim/types";
import type { ObservationSession } from "../observatory/recorder";

const signed = (n: number): string => `${n >= 0 ? "+" : ""}${n.toFixed(3)}`;
const situation = (key: string): string =>
  key === "clear" ? "Sans ressource proche" : "Ressource visible proche";

export function instrumentalMarkup(
  world: World,
  session?: ObservationSession,
): string {
  const s = world.instrumental;
  if (!s?.devices.length)
    return '<p class="microcopy">Placez une distributrice depuis la palette Objets pour observer les essais de Luma.</p>';
  const perceived = session?.lastDecision?.actuators ?? [];
  return `<p class="microcopy">Luma essaie des actions par curiosité. Une nouvelle baie aperçue après son action peut former une association temporelle. Seule sa digestion apprend la valeur biologique. Ce mécanisme n’établit pas une preuve de causalité.</p>${!s.learning ? '<p class="instrumental-summary">Témoin : apprentissage instrumental désactivé. La physiologie et l’apprentissage alimentaire continuent.</p>' : ""}<p class="microcopy">Leviers perçus à la dernière décision capturée (tick ${session?.lastDecision?.tick ?? "—"}) : ${perceived.map((a) => `#${a.id}, distance ${a.distance.toFixed(1)}`).join(" ; ") || "aucun instantané disponible"}.</p>${s.devices
    .map((d) => {
      const memories = s.memories.filter((m) => m.targetId === d.id);
      const attempts = memories.reduce((sum, m) => sum + m.attempts, 0),
        outcomes = memories.reduce((sum, m) => sum + m.outcomes, 0);
      const bio = outcomes
        ? memories.reduce((sum, m) => sum + m.value * m.outcomes, 0) / outcomes
        : 0;
      const meaning = !outcomes
        ? "La valeur de l’action est encore inconnue : aucune digestion attribuée."
        : bio > 0
          ? "La valeur actuellement mémorisée est positive ; elle peut favoriser cette action si Luma attend un événement."
          : bio < 0
            ? "La valeur actuellement mémorisée est négative ; elle peut diminuer le score de cette action."
            : "Des expériences ont eu lieu, avec une valeur actuellement neutre.";
      const points =
        session?.instrumental.filter(
          (p) => p.targetId === d.id && p.phase === "transition",
        ) ?? [];
      const min = Math.min(...points.map((p) => p.tick), world.tick),
        max = Math.max(min + 1, ...points.map((p) => p.tick));
      const x = (p: (typeof points)[number]): number =>
        12 + ((p.tick - min) / (max - min)) * 296;
      const y = (p: (typeof points)[number]): number =>
        95 - (p.probability ?? 0) * 80;
      const segments = [
        ...new Set(points.map((p) => `${p.segment}/${p.situation}`)),
      ];
      const chart = points.length
        ? `<svg class="learning-chart" viewBox="0 0 320 110" role="img" aria-label="Estimation apprise de transition, de zéro à un"><line x1="12" y1="95" x2="308" y2="95" stroke="#b1bd9f"/>${segments
            .map((key) => {
              const ps = points.filter(
                (p) => `${p.segment}/${p.situation}` === key,
              );
              return `<polyline fill="none" stroke="${ps[0]?.situation === "clear" ? "#315e47" : "#a65a47"}" stroke-width="2" points="${ps.map((p, i) => `${i ? `${x(p)},${y(ps[i - 1]!)} ` : ""}${x(p)},${y(p)}`).join(" ")}"/>${ps.map((p) => `<circle cx="${x(p)}" cy="${y(p)}" r="2.5" fill="#315e47"/>`).join("")}`;
            })
            .join(
              "",
            )}</svg><p class="microcopy">Estimation d’apparition d’une ressource, 0 à 100 % ; vert : sans ressource proche, brun : ressource visible. Points de capture uniquement, interruptions séparées.</p>`
        : '<p class="microcopy">Aucune évolution de transition capturée pour ce levier.</p>';
      const recent =
        session?.instrumental
          .filter(
            (p) =>
              p.targetId === d.id &&
              (p.phase === "transition" ||
                p.phase === "credit" ||
                p.phase === "score"),
          )
          .slice(-12) ?? [];
      return `<article class="instrumental-device"><h3>Levier #${d.id}</h3><p class="instrumental-summary">${attempts} tentatives · ${outcomes} bilans biologiques attribués. ${meaning}</p><p class="microcopy"><strong>Faits physiques du monde, invisibles au cerveau :</strong> réserve ${d.stock}/${d.capacity}, recharge restante ${Math.max(0, (d.readyAt - world.tick) / 10).toFixed(1)} s${d.pendingAt !== null ? ", production en attente" : ""}.</p><div class="observatory-table-wrap"><table><caption>Relations estimées par Luma, distinctes des faits physiques</caption><thead><tr><th>Situation</th><th>Essais / événements / digestions</th><th>Transition estimée / valeur</th></tr></thead><tbody>${memories.map((m) => `<tr><th>${situation(m.situation)}</th><td>${m.attempts} / ${m.successes} / ${m.outcomes}</td><td>${m.observations ? `${(m.probability * 100).toFixed(1)} %` : "inconnue"} / ${m.outcomes ? signed(m.value) : "inconnue"}</td></tr>`).join("") || '<tr><td colspan="3">Aucune expérience de cette action.</td></tr>'}</tbody></table></div>${chart}<div class="observatory-table-wrap"><table><caption>Évolution mesurée : estimation et score réellement calculé</caption><thead><tr><th>Tick / étape</th><th>Estimation / valeur</th><th>Score</th></tr></thead><tbody>${recent.map((p) => `<tr><td>${p.tick} / ${p.phase}<br>${situation(p.situation ?? "clear")}</td><td>${p.probability === undefined ? "—" : (p.probability * 100).toFixed(1) + " %"} / ${p.value === undefined ? "—" : signed(p.value)}</td><td>${p.score === undefined ? "Non calculé à cette étape" : signed(p.score)}</td></tr>`).join("")}</tbody></table></div></article>`;
    })
    .join(
      "",
    )}<p class="microcopy">Une absence réduit l’estimation seulement si toute la fenêtre d’observation a été couverte. Une baie sans ingestion ou dont les effets sont nocifs n’apporte pas automatiquement une récompense. Une association négative n’interdit pas tout essai : la curiosité demeure.</p>`;
}
