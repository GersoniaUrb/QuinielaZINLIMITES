import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase, hashPassword } from "../_db.js";
import { matches } from "../_helpers.js";

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

  const { nickname, password, predictions } = req.body || {};

  if (!nickname || !password || !predictions || !Array.isArray(predictions)) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios (nickname, password, predictions)." });
  }

  const cleanNickname = nickname.trim().toLowerCase();

  try {
    // 1. Autenticar usuario y verificar aprobación
    const { data: user, error: authError } = await supabase
      .from("quiniela_users")
      .select("id, password_hash, approved")
      .eq("nickname", cleanNickname)
      .maybeSingle();

    if (authError) {
      console.error("Error al buscar usuario:", authError);
      return res.status(500).json({ error: "Error en el servidor al autenticar." });
    }

    if (!user) {
      return res.status(401).json({ error: "Credenciales incorrectas (usuario no encontrado)." });
    }

    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Credenciales incorrectas (contraseña inválida)." });
    }

    if (!user.approved) {
      return res.status(403).json({ error: "Aún estás pendiente de aprobación por el administrador." });
    }

    // 2. Procesar y validar cada predicción
    const now = new Date();
    const recordsToInsert = [];
    const skippedMatches = [];

    for (const pred of predictions) {
      const { match_id, home_score, away_score } = pred;
      if (match_id === undefined || home_score === undefined || away_score === undefined) {
        continue; // Saltar predicciones inválidas
      }

      // Buscar el partido en el calendario oficial
      const officialMatch = matches.find((m) => m.id === match_id);
      if (!officialMatch) {
        continue; // Partido inexistente
      }

      // Validar si el partido ya comenzó para evitar trampas
      // Combinamos la fecha y hora UTC oficial del partido
      const matchStartTime = new Date(`${officialMatch.date}T${officialMatch.time_utc}:00Z`);
      if (now >= matchStartTime) {
        skippedMatches.push(match_id);
        continue; // Bloquear predicción si ya comenzó
      }

      recordsToInsert.push({
        user_id: user.id,
        match_id,
        home_score: Math.max(0, parseInt(home_score, 10)),
        away_score: Math.max(0, parseInt(away_score, 10)),
        updated_at: new Date().toISOString(),
      });
    }

    if (recordsToInsert.length === 0) {
      return res.status(400).json({
        error: "No se procesó ninguna predicción. Asegúrate de ingresar marcadores válidos y que los partidos no hayan comenzado.",
        skipped: skippedMatches,
      });
    }

    // 3. Upsert en la base de datos (Supabase)
    const { error: upsertError } = await supabase
      .from("match_predictions")
      .upsert(recordsToInsert, {
        onConflict: "user_id,match_id",
      });

    if (upsertError) {
      console.error("Error al guardar predicciones:", upsertError);
      return res.status(500).json({ error: "Error al guardar las predicciones en la base de datos." });
    }

    return res.status(200).json({
      success: true,
      message: `¡Se guardaron con éxito ${recordsToInsert.length} predicciones!`,
      skipped: skippedMatches,
    });

  } catch (error) {
    console.error("Error general en submit-scores:", error);
    return res.status(500).json({ error: "Error interno del servidor al guardar puntuaciones." });
  }
}
