import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase, verifyAdminToken } from "../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const nickname = (req.query.nickname as string || "").trim().toLowerCase();
  const token = req.query.token as string || "";

  if (!nickname || !token) {
    return sendHtmlResponse(res, 400, "Error de Aprobación", "Faltan parámetros obligatorios en la solicitud (nickname o token).");
  }

  // 1. Verificar la firma del token
  const isValid = verifyAdminToken(nickname, token);
  if (!isValid) {
    return sendHtmlResponse(res, 403, "Acceso Denegado", "El token de aprobación proporcionado no es válido o ha expirado.");
  }

  try {
    // 2. Buscar si el usuario existe
    const { data: user, error: fetchError } = await supabase
      .from("quiniela_users")
      .select("id, fullname, approved")
      .eq("nickname", nickname)
      .maybeSingle();

    if (fetchError) {
      console.error("Error al buscar usuario:", fetchError);
      return sendHtmlResponse(res, 500, "Error del Servidor", "Ocurrió un error al buscar al participante en la base de datos.");
    }

    if (!user) {
      return sendHtmlResponse(res, 404, "Usuario no Encontrado", `El usuario con apodo <strong>${nickname}</strong> no existe en el sistema.`);
    }

    if (user.approved) {
      return sendHtmlResponse(res, 200, "Ya Aprobado", `El participante <strong>${user.fullname} (${nickname})</strong> ya había sido aprobado anteriormente.`);
    }

    // 3. Aprobar al usuario en la base de datos
    const { error: updateError } = await supabase
      .from("quiniela_users")
      .update({ approved: true })
      .eq("nickname", nickname);

    if (updateError) {
      console.error("Error al actualizar usuario:", updateError);
      return sendHtmlResponse(res, 500, "Error del Servidor", "No se pudo actualizar el estado de aprobación del participante en la base de datos.");
    }

    return sendHtmlResponse(
      res,
      200,
      "¡Aprobación Exitosa!",
      `El participante <strong>${user.fullname}</strong> con el apodo <strong style="color:#d4a843">${nickname}</strong> ha sido aprobado de manera impecable.<br/><br/>Ya puede iniciar sesión y registrar sus predicciones en la plataforma.`,
      true
    );

  } catch (error) {
    console.error("Error general al aprobar usuario:", error);
    return sendHtmlResponse(res, 500, "Error del Servidor", "Ocurrió un error general e inesperado en el servidor.");
  }
}

// Helper para renderizar páginas HTML bonitas en español
function sendHtmlResponse(res: VercelResponse, statusCode: number, title: string, message: string, isSuccess = false) {
  res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" });
  
  const icon = isSuccess ? "&#10004;" : "&#9888;";
  const iconColor = isSuccess ? "#22c55e" : "#f87171";
  const accentColor = isSuccess ? "#22c55e" : "#8b1a1a";

  res.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - Quiniela Mundial 2026</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Inter', sans-serif;
          background-color: #0a0a0a;
          color: #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
        }
        .card {
          background-color: #141414;
          border: 1px solid #2a2a2a;
          border-top: 5px solid ${accentColor};
          border-radius: 12px;
          padding: 40px 30px;
          max-width: 480px;
          width: 100%;
          text-align: center;
          box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        }
        .icon {
          font-size: 48px;
          color: ${iconColor};
          margin-bottom: 20px;
          display: inline-block;
          line-height: 1;
        }
        h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 15px 0;
          letter-spacing: -0.02em;
          color: #ffffff;
        }
        p {
          font-size: 15px;
          line-height: 1.6;
          color: #a3a3a3;
          margin: 0 0 30px 0;
        }
        .btn {
          display: inline-block;
          background-color: #1e1e1e;
          color: #ffffff;
          border: 1px solid #2a2a2a;
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .btn:hover {
          background-color: #2a2a2a;
          border-color: #d4a843;
          color: #d4a843;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="icon">${icon}</span>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/" class="btn">Volver al Inicio</a>
      </div>
    </body>
    </html>
  `);
  res.end();
}
