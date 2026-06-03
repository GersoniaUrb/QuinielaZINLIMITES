import fs from "fs";
import path from "path";


// Función para cargar variables de entorno desde .env manualmente si existe
function loadEnv() {
  try {
    const envPath = path.resolve(".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      envContent.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const match = trimmed.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = match[2] || "";
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.substring(1, value.length - 1);
          } else if (value.startsWith("'") && value.endsWith("'")) {
            value = value.substring(1, value.length - 1);
          }
          process.env[key] = value.trim();
        }
      });
    }
  } catch (e) {
    console.warn("No se pudo cargar el archivo .env:", e);
  }
}

async function registerAdmin() {
  loadEnv();

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn("⚠️ ADVERTENCIA: Faltan las variables de entorno de Supabase. Registrando en la base de datos simulada local (quiniela_db.json).");
  }


  // Importar dinámicamente para que loadEnv() haya establecido las variables de entorno primero
  const { supabase, hashPassword } = await import("../api/_db.js");

  const nickname = "gerson";
  const fullname = "Gerson";
  const password = "Valle1997";
  const avatarUrl = "https://raw.githubusercontent.com/jordanlyall/wc26-mcp/main/website/favicon.png"; // Placeholder por defecto

  console.log(`Intentando registrar al administrador '${nickname}'...`);

  try {
    // 1. Verificar si el apodo ya existe
    const { data: existingUser, error: checkError } = await supabase
      .from("quiniela_users")
      .select("id")
      .eq("nickname", nickname)
      .maybeSingle();

    if (checkError) {
      console.error("❌ Error al consultar la base de datos:", checkError.message);
      process.exit(1);
    }

    if (existingUser) {
      console.log(`El usuario '${nickname}' ya existe. Actualizando contraseña y marcándolo como aprobado...`);
      const pwdHash = hashPassword(password);
      const { error: updateError } = await supabase
        .from("quiniela_users")
        .update({
          password_hash: pwdHash,
          approved: true,
          fullname: fullname
        })
        .eq("nickname", nickname);

      if (updateError) {
        console.error("❌ Error al actualizar el usuario administrador:", updateError.message);
        process.exit(1);
      }
      console.log("✅ ¡Administrador actualizado exitosamente con nueva contraseña y estado aprobado!");
    } else {
      console.log(`El usuario '${nickname}' no existe. Registrando como nuevo...`);
      const pwdHash = hashPassword(password);
      const { error: insertError } = await supabase
        .from("quiniela_users")
        .insert({
          nickname: nickname,
          fullname: fullname,
          password_hash: pwdHash,
          avatar_url: avatarUrl,
          approved: true
        });

      if (insertError) {
        console.error("❌ Error al insertar el usuario administrador:", insertError.message);
        process.exit(1);
      }
      console.log("✅ ¡Administrador registrado exitosamente como Aprobado!");
    }
  } catch (err: any) {
    console.error("❌ Ocurrió un error inesperado:", err.message || err);
  }
}

registerAdmin();
