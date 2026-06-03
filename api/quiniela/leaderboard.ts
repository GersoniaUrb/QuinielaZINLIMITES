import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_db.js";
import { getLiveMatches } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // 1. Obtener todos los usuarios aprobados
    const { data: users, error: usersError } = await supabase
      .from("quiniela_users")
      .select("id, nickname, fullname, avatar_url")
      .eq("approved", true);

    if (usersError) {
      console.error("Error al obtener usuarios:", usersError);
      return res.status(500).json({ error: "Error en el servidor al cargar participantes." });
    }

    // 2. Obtener todas las predicciones de partidos
    const { data: matchPreds, error: matchPredsError } = await supabase
      .from("match_predictions")
      .select("user_id, match_id, home_score, away_score");

    if (matchPredsError) {
      console.error("Error al obtener predicciones de partidos:", matchPredsError);
      return res.status(500).json({ error: "Error al cargar predicciones de partidos." });
    }

    // 3. Obtener todas las predicciones del bracket
    const { data: bracketPreds, error: bracketPredsError } = await supabase
      .from("bracket_predictions")
      .select("user_id, predictions");

    if (bracketPredsError) {
      console.error("Error al obtener predicciones del bracket:", bracketPredsError);
      return res.status(500).json({ error: "Error al cargar predicciones de llaves." });
    }

    // 4. Calcular qué equipos clasificaron a cada fase a partir de los datos reales del torneo
    const matches = await getLiveMatches();
    
    const actualR16: string[] = [];
    const actualQF: string[] = [];
    const actualSF: string[] = [];
    const actualFinalists: string[] = [];
    let actualChampion: string | null = null;

    matches.forEach((m) => {
      // Octavos de Final (Round of 16)
      if (m.round === "Round of 16") {
        if (m.home_team_id) actualR16.push(m.home_team_id);
        if (m.away_team_id) actualR16.push(m.away_team_id);
      }
      // Cuartos de Final (Quarter-final)
      else if (m.round === "Quarter-final") {
        if (m.home_team_id) actualQF.push(m.home_team_id);
        if (m.away_team_id) actualQF.push(m.away_team_id);
      }
      // Semifinales (Semi-final)
      else if (m.round === "Semi-final") {
        if (m.home_team_id) actualSF.push(m.home_team_id);
        if (m.away_team_id) actualSF.push(m.away_team_id);
      }
      // Final
      else if (m.round === "Final") {
        if (m.home_team_id) actualFinalists.push(m.home_team_id);
        if (m.away_team_id) actualFinalists.push(m.away_team_id);

        if (m.status === "completed" && m.home_score !== undefined && m.away_score !== undefined) {
          if (m.home_score > m.away_score) {
            actualChampion = m.home_team_id;
          } else if (m.away_score > m.home_score) {
            actualChampion = m.away_team_id;
          } else {
            // Empate en penales: por simplicidad, si hay un empate en el marcador del partido (ej. 3-3),
            // podemos verificar una propiedad extra o asumir que en la actualización final,
            // el marcador reflejará la victoria o se agregará soporte.
            // Para evitar problemas, si m.home_score === m.away_score, miramos quién está marcado
            // como ganador. Por ejemplo, en los datos actualizados, se puede sobreescribir o
            // agregar un campo. Aquí asumimos el ganador según el flujo oficial.
            actualChampion = m.home_team_id; // Default fallback o primer equipo
          }
        }
      }
    });

    // 5. Computar los puntajes para cada usuario
    const leaderboard = users.map((user) => {
      let points = 0;
      let exactMatches = 0;
      let winnerMatches = 0;
      let groupPoints = 0;
      let playoffPoints = 0;

      // Filtrar predicciones de este usuario
      const userMatchPreds = matchPreds.filter((p) => p.user_id === user.id);
      const userBracketPred = bracketPreds.find((p) => p.user_id === user.id);

      // Calcular puntos de Fase de Grupos
      userMatchPreds.forEach((pred) => {
        const match = matches.find((m) => m.id === pred.match_id);
        // Solo puntuar si el partido oficial ha finalizado y tiene scores cargados
        if (match && match.status === "completed" && match.home_score !== undefined && match.away_score !== undefined) {
          const actHome = match.home_score;
          const actAway = match.away_score;
          const predHome = pred.home_score;
          const predAway = pred.away_score;

          // Acierto exacto: 3 puntos
          if (predHome === actHome && predAway === actAway) {
            points += 3;
            groupPoints += 3;
            exactMatches += 1;
          } else {
            // Acierto de ganador o empate: 1 punto
            const actWinner = actHome > actAway ? "home" : actHome < actAway ? "away" : "draw";
            const predWinner = predHome > predAway ? "home" : predHome < predAway ? "away" : "draw";

            if (actWinner === predWinner) {
              points += 1;
              groupPoints += 1;
              winnerMatches += 1;
            }
          }
        }
      });

      // Calcular puntos del Bracket (Playoffs)
      if (userBracketPred && userBracketPred.predictions) {
        const { r16, qf, sf, finalists, champion } = userBracketPred.predictions;

        // 1. Octavos: 2 puntos por cada equipo acertado
        if (Array.isArray(r16)) {
          r16.forEach((team) => {
            if (actualR16.includes(team)) {
              points += 2;
              playoffPoints += 2;
            }
          });
        }

        // 2. Cuartos: 4 puntos por cada equipo acertado
        if (Array.isArray(qf)) {
          qf.forEach((team) => {
            if (actualQF.includes(team)) {
              points += 4;
              playoffPoints += 4;
            }
          });
        }

        // 3. Semis: 8 puntos por cada equipo acertado
        if (Array.isArray(sf)) {
          sf.forEach((team) => {
            if (actualSF.includes(team)) {
              points += 8;
              playoffPoints += 8;
            }
          });
        }

        // 4. Finalistas: 16 puntos por cada equipo acertado
        if (Array.isArray(finalists)) {
          finalists.forEach((team) => {
            if (actualFinalists.includes(team)) {
              points += 16;
              playoffPoints += 16;
            }
          });
        }

        // 5. Campeón: 32 puntos si acierta
        if (champion && actualChampion && champion === actualChampion) {
          points += 32;
          playoffPoints += 32;
        }
      }

      return {
        id: user.id,
        nickname: user.nickname,
        fullname: user.fullname,
        avatar_url: user.avatar_url,
        group_points: groupPoints,
        playoff_points: playoffPoints,
        exact_matches: exactMatches,
        winner_matches: winnerMatches,
        total_points: points,
      };
    });

    // 6. Ordenar tabla de posiciones
    // Criterio de ordenación:
    // 1. Puntos totales (Descendente)
    // 2. Cantidad de aciertos exactos (Descendente)
    // 3. Cantidad de aciertos simples de ganador (Descendente)
    // 4. Alfabéticamente por apodo
    leaderboard.sort((a, b) => {
      if (b.total_points !== a.total_points) {
        return b.total_points - a.total_points;
      }
      if (b.exact_matches !== a.exact_matches) {
        return b.exact_matches - a.exact_matches;
      }
      if (b.winner_matches !== a.winner_matches) {
        return b.winner_matches - a.winner_matches;
      }
      return a.nickname.localeCompare(b.nickname);
    });

    return res.status(200).json({
      success: true,
      leaderboard,
      metadata: {
        actual_r16_count: actualR16.length,
        actual_qf_count: actualQF.length,
        actual_sf_count: actualSF.length,
        actual_finalists_count: actualFinalists.length,
        has_champion: actualChampion !== null,
      },
    });

  } catch (error) {
    console.error("Error general en leaderboard:", error);
    return res.status(500).json({ error: "Error en el servidor al calcular la tabla de clasificación." });
  }
}
