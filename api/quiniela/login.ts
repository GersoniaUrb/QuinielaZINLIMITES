import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase, hashPassword } from "../_db.js";

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
    return res.status(400).json({ error: "Por favor ingresa tu Apodo y Contraseña." });
  }

  const cleanNickname = nickname.trim().toLowerCase();

  try {
    // Buscar usuario en base de datos
    const { data: user, error: fetchError } = await supabase
      .from("quiniela_users")
      .select("nickname, fullname, password_hash, avatar_url, approved")
      .eq("nickname", cleanNickname)
      .maybeSingle();

    if (fetchError) {
      console.error("Error al buscar usuario:", fetchError);
      return res.status(500).json({ error: "Error interno del servidor al procesar el inicio de sesión." });
    }

    if (!user) {
      return res.status(401).json({ error: "El apodo ingresado no está registrado." });
    }

    // Verificar contraseña
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: "Contraseña incorrecta." });
    }

    // Verificar si está aprobado
    if (!user.approved) {
      return res.status(403).json({ error: "Aún estás pendiente de aprobación por el administrador." });
    }

    // Login exitoso
    return res.status(200).json({
      success: true,
      message: "¡Inicio de sesión exitoso!",
      user: {
        nickname: user.nickname,
        fullname: user.fullname,
        avatar_url: user.avatar_url,
      }
    });

  } catch (error) {
    console.error("Error general en login:", error);
    return res.status(500).json({ error: "Error en el servidor durante el inicio de sesión." });
  }
}
