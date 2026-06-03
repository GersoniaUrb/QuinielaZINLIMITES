#!/usr/bin/env npx tsx

import fs from "fs";
import path from "path";

// Function to manually load .env variables if present
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

loadEnv();

async function main() {
  const { supabase } = await import("../api/_db.js");
  const { matches } = await import("../src/data/matches.js");

  const args = process.argv.slice(2);
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
⚽ SIMULADOR DE RESULTADOS DE LA QUINIELA MUNDIAL 2026

Uso:
  npx tsx scripts/simulate-match.ts [opciones]

Opciones:
  --match <id>       ID del partido a simular (ej. m1, m2, etc.)
  --home <goles>     Goles del equipo local (home)
  --away <goles>     Goles del equipo visitante (away)
  --status <estado>  Estado del partido: 'live' (en vivo) o 'completed' (finalizado). Por defecto: 'completed'
  --reset            Borra todas las simulaciones de resultados de partidos.
  --list             Muestra los resultados simulados actuales en la base de datos.
  
Ejemplos:
  Simular que México 2 - 1 Sudáfrica finalizó (Match 1):
    npx tsx scripts/simulate-match.ts --match m1 --home 2 --away 1 --status completed

  Simular que Canadá 1 - 1 Suecia está En Vivo (Match 2):
    npx tsx scripts/simulate-match.ts --match m2 --home 1 --away 1 --status live

  Reiniciar todos los marcadores:
    npx tsx scripts/simulate-match.ts --reset
`);
    return;
  }

  // 1. Manejar RESET
  if (args.includes("--reset")) {
    console.log("🧹 Limpiando resultados simulados en la base de datos...");
    const { error } = await supabase.from("match_results").delete().neq("match_id", "none");
    if (error) {
      console.error("❌ Error al limpiar resultados:", error.message);
    } else {
      console.log("✅ Todos los resultados simulados han sido eliminados de la base de datos.");
    }
    return;
  }

  // 2. Manejar LIST
  if (args.includes("--list") || args.length === 0) {
    console.log("🔍 Consultando resultados registrados en la base de datos...");
    const { data: results, error } = await supabase.from("match_results").select("*");
    if (error) {
      console.error("❌ Error al consultar resultados:", error.message);
      return;
    }

    if (!results || results.length === 0) {
      console.log("ℹ️ No hay ningún resultado simulado registrado. Todos los partidos están en su estado programado inicial ('scheduled').");
      return;
    }

    console.log("\n📋 Resultados Registrados:");
    console.log("----------------------------------------------------------------------");
    results.forEach((r: any) => {
      const matchDetails = matches.find((m) => m.id === r.match_id);
      const teamsStr = matchDetails 
        ? `${matchDetails.home_team_id.toUpperCase()} vs ${matchDetails.away_team_id.toUpperCase()}`
        : "Desconocido";
      console.log(`Partido: ${r.match_id.padEnd(5)} | ${teamsStr.padEnd(15)} | Marcador: ${r.home_score}-${r.away_score} | Estado: ${r.status} | Actualizado: ${r.updated_at}`);
    });
    console.log("----------------------------------------------------------------------");
    return;
  }

  // 3. Manejar UPSERT/SIMULACIÓN de un partido
  const matchIdx = args.indexOf("--match");
  const homeIdx = args.indexOf("--home");
  const awayIdx = args.indexOf("--away");
  const statusIdx = args.indexOf("--status");

  if (matchIdx === -1 || homeIdx === -1 || awayIdx === -1) {
    console.error("❌ Error: Debes especificar --match <id>, --home <goles> y --away <goles>.");
    console.log("Usa 'npx tsx scripts/simulate-match.ts --help' para ver ejemplos.");
    return;
  }

  const matchId = args[matchIdx + 1];
  const homeScore = parseInt(args[homeIdx + 1], 10);
  const awayScore = parseInt(args[awayIdx + 1], 10);
  let status = "completed";
  if (statusIdx !== -1) {
    status = args[statusIdx + 1];
  }

  if (!matchId) {
    console.error("❌ Error: ID de partido inválido.");
    return;
  }

  if (isNaN(homeScore) || isNaN(awayScore)) {
    console.error("❌ Error: Los marcadores de goles deben ser números enteros.");
    return;
  }

  if (status !== "completed" && status !== "live" && status !== "scheduled") {
    console.error("❌ Error: El estado debe ser 'live', 'completed' o 'scheduled'.");
    return;
  }

  // Verificar si el partido existe en nuestro catálogo local
  const localMatch = matches.find((m) => m.id === matchId);
  if (!localMatch) {
    console.error(`❌ Error: El partido con ID '${matchId}' no existe en la programación del Mundial.`);
    return;
  }

  const homeTeam = localMatch.home_team_id.toUpperCase();
  const awayTeam = localMatch.away_team_id.toUpperCase();

  console.log(`🚀 Simulando partido ${matchId} (${homeTeam} vs ${awayTeam}):`);
  console.log(`Marcador: ${homeScore} - ${awayScore}`);
  console.log(`Estado: ${status}`);

  const payload = {
    match_id: matchId,
    home_score: homeScore,
    away_score: awayScore,
    status: status,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("match_results").upsert(payload);

  if (error) {
    console.error("❌ Error al guardar en la base de datos:", error.message);
  } else {
    console.log(`✅ ¡Partido ${matchId} actualizado exitosamente en la base de datos!`);
    console.log("Entra a la página web y ve a 'Tabla de Posiciones' para ver los puntajes recalculados.");
  }
}

main().catch((err) => {
  console.error("Fatal error en el simulador:", err);
});
