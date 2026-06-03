import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { data: users, error } = await supabase
      .from("quiniela_users")
      .select("nickname, fullname, avatar_url")
      .eq("approved", true);

    if (error) {
      return res.status(500).json({ error: "Error al cargar participantes." });
    }

    return res.status(200).json({
      success: true,
      count: (users || []).length,
      participants: users || [],
    });
  } catch (err) {
    console.error("Error en participants:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
