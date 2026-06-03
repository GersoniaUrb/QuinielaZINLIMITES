// SCRIPT DE PRUEBAS PARA EL CÁLCULO DE PUNTOS DE LA QUINIELA MUNDIAL 2026
// Corre esto con: npx tsx test/quiniela.test.ts

import assert from "assert";

// 1. Simulación del Tipo Match y resultados oficiales
interface Match {
  id: string;
  round: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score?: number;
  away_score?: number;
  status: string;
}

const mockMatches: Match[] = [
  // Grupos
  { id: "m1", round: "Group Stage", home_team_id: "mex", away_team_id: "rsa", home_score: 2, away_score: 1, status: "completed" },
  { id: "m2", round: "Group Stage", home_team_id: "can", away_team_id: "usa", home_score: 1, away_score: 1, status: "completed" },
  { id: "m3", round: "Group Stage", home_team_id: "ger", away_team_id: "bra", home_score: 0, away_score: 3, status: "completed" },
  // Octavos
  { id: "m89", round: "Round of 16", home_team_id: "mex", away_team_id: "arg", home_score: 1, away_score: 2, status: "completed" },
  { id: "m90", round: "Round of 16", home_team_id: "bra", away_team_id: "fra", home_score: 3, away_score: 1, status: "completed" },
  // Final
  { id: "m104", round: "Final", home_team_id: "arg", away_team_id: "bra", home_score: 3, away_score: 2, status: "completed" }
];

// 2. Simulación de predicciones del usuario
interface MatchPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
}

interface BracketPrediction {
  r16: string[];
  qf: string[];
  sf: string[];
  finalists: string[];
  champion: string;
}

// 3. Algoritmo de cálculo de puntos (idéntico al de api/quiniela/leaderboard.ts)
function calculateUserPoints(
  matchPreds: MatchPrediction[],
  bracketPred: BracketPrediction | null,
  officialMatches: Match[]
) {
  let points = 0;
  let exactMatches = 0;
  let winnerMatches = 0;
  let groupPoints = 0;
  let playoffPoints = 0;

  // Calcular puntos de Fase de Grupos
  matchPreds.forEach((pred) => {
    const match = officialMatches.find((m) => m.id === pred.match_id);
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

  // Determinar clasificados reales para Playoffs
  const actualR16: string[] = [];
  const actualQF: string[] = [];
  const actualSF: string[] = [];
  const actualFinalists: string[] = [];
  let actualChampion: string | null = null;

  officialMatches.forEach((m) => {
    if (m.round === "Round of 16") {
      if (m.home_team_id) actualR16.push(m.home_team_id);
      if (m.away_team_id) actualR16.push(m.away_team_id);
    } else if (m.round === "Quarter-final") {
      if (m.home_team_id) actualQF.push(m.home_team_id);
      if (m.away_team_id) actualQF.push(m.away_team_id);
    } else if (m.round === "Semi-final") {
      if (m.home_team_id) actualSF.push(m.home_team_id);
      if (m.away_team_id) actualSF.push(m.away_team_id);
    } else if (m.round === "Final") {
      if (m.home_team_id) actualFinalists.push(m.home_team_id);
      if (m.away_team_id) actualFinalists.push(m.away_team_id);

      if (m.status === "completed" && m.home_score !== undefined && m.away_score !== undefined) {
        actualChampion = m.home_score > m.away_score ? m.home_team_id : m.away_team_id;
      }
    }
  });

  // Calcular puntos del Bracket (Playoffs)
  if (bracketPred) {
    const { r16, qf, sf, finalists, champion } = bracketPred;

    // 1. Octavos: 2 puntos c/u
    if (Array.isArray(r16)) {
      r16.forEach((team) => {
        if (actualR16.includes(team)) {
          points += 2;
          playoffPoints += 2;
        }
      });
    }

    // 2. Cuartos: 4 puntos c/u
    if (Array.isArray(qf)) {
      qf.forEach((team) => {
        if (actualQF.includes(team)) {
          points += 4;
          playoffPoints += 4;
        }
      });
    }

    // 3. Semis: 8 puntos c/u
    if (Array.isArray(sf)) {
      sf.forEach((team) => {
        if (actualSF.includes(team)) {
          points += 8;
          playoffPoints += 8;
        }
      });
    }

    // 4. Finalistas: 16 puntos c/u
    if (Array.isArray(finalists)) {
      finalists.forEach((team) => {
        if (actualFinalists.includes(team)) {
          points += 16;
          playoffPoints += 16;
        }
      });
    }

    // 5. Campeón: 32 puntos
    if (champion && actualChampion && champion === actualChampion) {
      points += 32;
      playoffPoints += 32;
    }
  }

  return { points, exactMatches, winnerMatches, groupPoints, playoffPoints };
}

// 4. Casos de Prueba
function runTests() {
  console.log("=== INICIANDO PRUEBAS DE PUNTUACIÓN DE LA QUINIELA ===");

  // CASO 1: Aciertos en Grupos (1 pleno, 1 acierto de ganador, 1 fallo)
  const matchPreds1: MatchPrediction[] = [
    { match_id: "m1", home_score: 2, away_score: 1 }, // Exacto: 3 pts
    { match_id: "m2", home_score: 2, away_score: 0 }, // Fallo (fue empate): 0 pts
    { match_id: "m3", home_score: 1, away_score: 2 }  // Ganó visita pero no exacto (fue 0-3): 1 pt
  ];
  
  const res1 = calculateUserPoints(matchPreds1, null, mockMatches);
  console.log("Caso 1 (Solo Grupos):", res1);
  assert.strictEqual(res1.points, 4, "Debe tener 4 puntos totales (3 + 0 + 1).");
  assert.strictEqual(res1.exactMatches, 1, "Debe tener 1 pleno.");
  assert.strictEqual(res1.winnerMatches, 1, "Debe tener 1 acierto simple.");
  console.log("✔ Caso 1 exitoso.");

  // CASO 2: Octavos de Final y Finalistas (Playoffs)
  // Reales R16: "mex", "arg", "bra", "fra"
  // Reales Finalistas: "arg", "bra"
  // Real Campeón: "arg"
  const bracketPred2: BracketPrediction = {
    r16: ["mex", "usa", "bra", "ger"], // Acertó "mex" y "bra" -> 2 + 2 = 4 pts
    qf: [],
    sf: [],
    finalists: ["arg", "fra"],        // Acertó "arg" -> 16 pts
    champion: "arg"                   // Acertó campeón "arg" -> 32 pts
  };

  const res2 = calculateUserPoints([], bracketPred2, mockMatches);
  console.log("Caso 2 (Solo Playoffs):", res2);
  // Puntos esperados: 4 (R16) + 16 (finalistas) + 32 (campeón) = 52 pts
  assert.strictEqual(res2.points, 52, "Debe tener 52 puntos totales.");
  assert.strictEqual(res2.playoffPoints, 52, "Los 52 puntos deben ser de playoffs.");
  console.log("✔ Caso 2 exitoso.");

  // CASO 3: Combinado Completo
  const res3 = calculateUserPoints(matchPreds1, bracketPred2, mockMatches);
  console.log("Caso 3 (Combinado):", res3);
  assert.strictEqual(res3.points, 56, "Debe tener 56 puntos totales (4 + 52).");
  console.log("✔ Caso 3 exitoso.");

  console.log("=== ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE! ===");
}

runTests();
