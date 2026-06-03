import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { supabase, hashPassword, generateAdminToken } from "../_db.js";

// Handler principal
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

  const { fullname, nickname, password, avatarBase64, agreeBet } = req.body || {};

  // Validaciones
  if (!fullname || !nickname || !password || !avatarBase64) {
    return res.status(400).json({ error: "Todos los campos son obligatorios: Nombre completo, Apodo, Contraseña y Foto de Perfil." });
  }

  if (!agreeBet) {
    return res.status(400).json({ error: "Debes aceptar la apuesta de $10 USD para poder registrarte." });
  }

  const cleanNickname = nickname.trim().toLowerCase();

  try {
    // 1. Verificar si el apodo ya existe
    const { data: existingUser, error: checkError } = await supabase
      .from("quiniela_users")
      .select("id")
      .eq("nickname", cleanNickname)
      .maybeSingle();

    if (checkError) {
      console.error("Error al buscar usuario existente:", checkError);
      return res.status(500).json({ error: "Error en el servidor al verificar el apodo." });
    }

    if (existingUser) {
      return res.status(400).json({ error: "Este apodo ya está en uso. Por favor elige otro." });
    }

    // 2. Procesar y subir la foto de perfil a Supabase Storage
    const base64Parts = avatarBase64.split(";base64,");
    const mimeType = base64Parts[0].split(":")[1] || "image/png";
    const rawBase64 = base64Parts[1];
    if (!rawBase64) {
      return res.status(400).json({ error: "Formato de foto de perfil inválido." });
    }

    const buffer = Buffer.from(rawBase64, "base64");
    
    // Determinar la extensión del archivo a partir del MIME type
    let extension = "png";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) extension = "jpg";
    else if (mimeType.includes("webp")) extension = "webp";

    const fileName = `${cleanNickname}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Error al subir avatar a Storage:", uploadError);
      return res.status(500).json({ error: "Error al guardar la foto de perfil. Asegúrate de que el bucket 'avatars' esté creado y configurado como público." });
    }

    // Generar la URL pública del avatar
    const { data: { publicUrl } } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    // 3. Crear el hash de la contraseña e insertar el usuario
    const pwdHash = hashPassword(password);
    const { data: newUser, error: insertError } = await supabase
      .from("quiniela_users")
      .insert({
        nickname: cleanNickname,
        fullname: fullname.trim(),
        password_hash: pwdHash,
        avatar_url: publicUrl,
        approved: false,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error al insertar usuario en la base de datos:", insertError);
      return res.status(500).json({ error: "Error al registrar al usuario en la base de datos." });
    }

    // 4. Generar enlace de aprobación y enviar correo si está configurado
    const approvalToken = generateAdminToken(cleanNickname);
    let host = req.headers.host || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const approveUrl = `${protocol}://${host}/api/quiniela/approve?nickname=${encodeURIComponent(cleanNickname)}&token=${approvalToken}`;

    // Imprimir en consola de desarrollo local para facilitar la prueba
    console.log(`\n======================================================`);
    console.log(`🔑 NUEVO REGISTRO: ${cleanNickname} (${fullname.trim()})`);
    console.log(`👉 Enlace de aprobación para pruebas locales:`);
    console.log(`   ${approveUrl}`);
    console.log(`======================================================\n`);

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const resend = new Resend(resendApiKey);
      try {
        await resend.emails.send({
          from: "Quiniela 2026 <onboarding@resend.dev>",
          to: "gersonurbina51@gmail.com",
          subject: `Nuevo Registro de Quiniela: ${cleanNickname}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background-color: #fcfcfc;">
              <h2 style="color: #8b1a1a; text-align: center; border-bottom: 2px solid #8b1a1a; padding-bottom: 10px;">¡Nuevo Registro Solicitado!</h2>
              <p>Un nuevo miembro se ha registrado y está en espera de aprobación para tu Quiniela del Mundial 2026:</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd; width: 180px;">Nombre Completo:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${fullname.trim()}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Apodo (Nickname):</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #d4a843; font-weight: bold;">${cleanNickname}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #ddd;">Acepta apostar $10:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #22c55e; font-weight: bold;">Sí, de acuerdo</td>
                </tr>
              </table>
              <div style="text-align: center; margin: 20px 0;">
                <p style="font-weight: bold;">Foto de perfil del participante:</p>
                <img src="${publicUrl}" alt="Avatar" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid #8b1a1a; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
              </div>
              <p>Una vez que verifiques que te ha pagado los $10 USD (por ejemplo, a tu cuenta bancaria o billetera móvil), puedes aprobar su acceso inmediatamente haciendo clic en el siguiente enlace:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${approveUrl}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">APROBAR PARTICIPANTE</a>
              </div>
              <p style="font-size: 12px; color: #888; text-align: center;">Si el botón no funciona, copia y pega esto en tu navegador:<br/>${approveUrl}</p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Error al enviar correo con Resend:", emailError);
      }
    } else {
      console.warn("Falta la variable RESEND_API_KEY, no se envió el correo de notificación por correo.");
    }

    return res.status(200).json({ success: true, message: "Registro exitoso. Tu cuenta está en espera de aprobación por el administrador." });

  } catch (error) {
    console.error("Error general en el registro:", error);
    return res.status(500).json({ error: "Error en el servidor al procesar el registro." });
  }
}
