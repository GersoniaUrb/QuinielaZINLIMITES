import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase, hashPassword } from "../_db.js";
import { getLiveMatches } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { nickname, password } = req.body || {};

  if (!nickname || !password) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios (nickname, password)." });
  }

  const cleanNickname = nickname.trim().toLowerCase();

  try {
    // 1. Autenticar usuario
    const { data: user, error: authError } = await supabase
      .from("quiniela_users")
      .select("id, nickname, fullname, avatar_url, password_hash, approved")
      .eq("nickname", cleanNickname)
      .maybeSingle();

    if (authError) {
      console.error("Error al buscar usuario:", authError);
      return res.status(500).json({ error: "Error en el servidor al autenticar." });
    }

    if (!user || user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    if (!user.approved) {
      return res.status(403).json({ error: "Cuenta no aprobada." });
    }

    // 2. Obtener predicciones de partidos
    const { data: matchPredictions, error: matchError } = await supabase
      .from("match_predictions")
      .select("match_id, home_score, away_score")
      .eq("user_id", user.id);

    if (matchError) {
      console.error("Error al cargar predicciones de partidos:", matchError);
      return res.status(500).json({ error: "Error al cargar las predicciones de partidos." });
    }

    // 3. Obtener predicciones del bracket
    const { data: bracketPrediction, error: bracketError } = await supabase
      .from("bracket_predictions")
      .select("predictions")
      .eq("user_id", user.id)
      .maybeSingle();

    if (bracketError) {
      console.error("Error al cargar predicciones del bracket:", bracketError);
      return res.status(500).json({ error: "Error al cargar las predicciones del cuadro." });
    }

    // 4. Calcular resumen de puntos del usuario
    let totalPoints = 0;
    let groupPoints = 0;
    let exactMatches = 0;
    let winnerMatches = 0;

    const matches = await getLiveMatches();

    (matchPredictions || []).forEach((pred: any) => {
      const match = matches.find((m) => m.id === pred.match_id);
      if (match && match.status === "completed" && match.home_score !== undefined && match.away_score !== undefined) {
        const actHome = match.home_score;
        const actAway = match.away_score;
        const predHome = pred.home_score;
        const predAway = pred.away_score;

        if (predHome === actHome && predAway === actAway) {
          totalPoints += 3;
          groupPoints += 3;
          exactMatches += 1;
        } else {
          const actWinner = actHome > actAway ? "home" : actHome < actAway ? "away" : "draw";
          const predWinner = predHome > predAway ? "home" : predHome < predAway ? "away" : "draw";
          if (actWinner === predWinner) {
            totalPoints += 1;
            groupPoints += 1;
            winnerMatches += 1;
          }
        }
      }
    });

    return res.status(200).json({
      success: true,
      user: {
        nickname: user.nickname,
        fullname: user.fullname,
        avatar_url: user.avatar_url,
      },
      matchPredictions: matchPredictions || [],
      bracketPredictions: bracketPrediction ? bracketPrediction.predictions : null,
      summary: {
        total_points: totalPoints,
        group_points: groupPoints,
        playoff_points: 0, // Se calcula en el leaderboard con bracket data
        exact_matches: exactMatches,
        winner_matches: winnerMatches,
        predictions_count: (matchPredictions || []).length,
      },
    });

  } catch (error) {
    console.error("Error general en get-user-data:", error);
    return res.status(500).json({ error: "Error en el servidor al cargar datos del usuario." });
  }
}

