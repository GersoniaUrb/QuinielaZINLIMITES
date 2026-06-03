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

  if (!nickname || !password || !predictions) {
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
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Credenciales incorrectas." });
    }

    if (!user.approved) {
      return res.status(403).json({ error: "Aún estás pendiente de aprobación por el administrador." });
    }

    // 2. Validar si el torneo ya empezó
    // Buscamos el partido número 1
    const firstMatch = matches.find((m) => m.match_number === 1);
    if (firstMatch) {
      const kickoffTime = new Date(`${firstMatch.date}T${firstMatch.time_utc}:00Z`);
      const now = new Date();
      if (now >= kickoffTime) {
        return res.status(400).json({ error: "El torneo ya ha comenzado. Ya no se pueden ingresar ni modificar predicciones del Cuadro Final." });
      }
    }

    // 3. Validar la estructura del bracket
    const { r16, qf, sf, finalists, champion } = predictions;
    if (!Array.isArray(r16) || !Array.isArray(qf) || !Array.isArray(sf) || !Array.isArray(finalists) || !champion) {
      return res.status(400).json({ error: "Estructura del Cuadro Final inválida. Debe incluir Octavos (r16), Cuartos (qf), Semis (sf), Finalistas (finalists) y Campeón (champion)." });
    }

    const cleanPredictions = {
      r16: r16.map((s) => String(s).trim().toLowerCase()),
      qf: qf.map((s) => String(s).trim().toLowerCase()),
      sf: sf.map((s) => String(s).trim().toLowerCase()),
      finalists: finalists.map((s) => String(s).trim().toLowerCase()),
      champion: String(champion).trim().toLowerCase(),
    };

    // 4. Guardar en la base de datos (Supabase)
    const { error: upsertError } = await supabase
      .from("bracket_predictions")
      .upsert({
        user_id: user.id,
        predictions: cleanPredictions,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      });

    if (upsertError) {
      console.error("Error al guardar bracket predictions:", upsertError);
      return res.status(500).json({ error: "Error al guardar el Cuadro Final en la base de datos." });
    }

    return res.status(200).json({
      success: true,
      message: "¡Tu Cuadro Final (Bracket) ha sido guardado con éxito!",
    });

  } catch (error) {
    console.error("Error general en submit-bracket:", error);
    return res.status(500).json({ error: "Error interno del servidor al guardar el bracket." });
  }
}
