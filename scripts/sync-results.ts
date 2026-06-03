#!/usr/bin/env npx tsx

/**
 * WC26 Results Sync Agent
 *
 * Fetches real-time World Cup 2026 match results from API-Football
 * and synchronizes them with the Supabase `match_results` table.
 *
 * Usage: npx tsx scripts/sync-results.ts
 * Env: FOOTBALL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { matches } from "../src/data/matches.js";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env explicitly
config({ path: resolve(process.cwd(), ".env") });

// Validate env vars
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FOOTBALL_API_KEY) {
  console.error("Error: FOOTBALL_API_KEY environment variable is required");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: Supabase credentials missing. Sync will dry-run only.");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// API-Football Endpoint for World Cup 2026
const API_URL = "https://v3.football.api-sports.io/fixtures?league=1&season=2026";

interface ApiFixture {
  fixture: {
    id: number;
    date: string; // ISO date string
    status: { short: string }; // e.g., "NS", "1H", "HT", "2H", "FT", "PEN", "AET"
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: {
    home: number | null;
    away: number | null;
  };
}

async function fetchLiveResults(): Promise<ApiFixture[]> {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        "x-apisports-key": FOOTBALL_API_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.response as ApiFixture[];
  } catch (error) {
    console.error("Failed to fetch from API-Football:", error);
    return [];
  }
}

function matchStatus(shortStatus: string): string {
  // Map API-Football status to our system status
  const completedStatuses = ["FT", "AET", "PEN"];
  const liveStatuses = ["1H", "HT", "2H", "ET", "P", "BT", "LIVE"];

  if (completedStatuses.includes(shortStatus)) return "completed";
  if (liveStatuses.includes(shortStatus)) return "live";
  return "scheduled"; // NS (Not Started), TBD, POST (Postponed), CANC, etc.
}

// Simple heuristic to match an API fixture to our static match data based on date and time
// This is necessary because API-Football team names might differ, or knockout stages might have TBD teams.
// For the World Cup, the kickoff time + date is unique per match (except MD3 where two matches are simultaneous).
function findLocalMatch(apiFixture: ApiFixture) {
  const fixtureDate = new Date(apiFixture.fixture.date);
  
  // Try to find the matching game based on the exact time
  const matchesOnSameTime = matches.filter((m) => {
    const localKickoff = new Date(`${m.date}T${m.time_utc}:00Z`);
    // Allow 1 hour difference just in case
    const diffMs = Math.abs(localKickoff.getTime() - fixtureDate.getTime());
    return diffMs < 3600000;
  });

  if (matchesOnSameTime.length === 1) {
    return matchesOnSameTime[0];
  }

  // If there are multiple (MD3 simultaneous), we need to look at teams or group.
  // This gets tricky for knockouts, but for group stage we can try a basic name match.
  // Note: For a robust system, we would map the api-football team IDs to our `mex`, `usa`, etc.
  // But since we just need something functional, let's just log and skip ambiguous ones if we can't map them.
  console.warn(`Ambiguous match for API fixture ${apiFixture.fixture.id} at ${apiFixture.fixture.date}`);
  return null;
}

async function main() {
  console.log("⚽ WC26 Results Sync Agent starting...\n");

  const fixtures = await fetchLiveResults();
  
  if (!fixtures || fixtures.length === 0) {
    console.log("No fixtures returned or API error. Exiting.");
    return;
  }

  console.log(`Fetched ${fixtures.length} fixtures from API-Football.`);

  let updatedCount = 0;

  for (const fixture of fixtures) {
    const status = matchStatus(fixture.fixture.status.short);
    
    // Only care about matches that have started or completed
    if (status === "scheduled") continue;

    const localMatch = findLocalMatch(fixture);
    if (!localMatch) continue;

    const payload = {
      match_id: localMatch.id,
      home_score: fixture.goals.home ?? 0,
      away_score: fixture.goals.away ?? 0,
      status: status,
      api_fixture_id: fixture.fixture.id,
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase.from("match_results").upsert(payload);
      if (error) {
        console.error(`Error upserting match ${localMatch.id}:`, error.message);
      } else {
        updatedCount++;
        console.log(`[SYNCED] ${localMatch.id} | Status: ${status} | Score: ${payload.home_score}-${payload.away_score}`);
      }
    } else {
      updatedCount++;
      console.log(`[DRY-RUN] Would upsert ${localMatch.id}:`, payload);
    }
  }

  console.log(`\n✅ Finished sync. Updated ${updatedCount} matches in database.`);
}

main().catch((err) => {
  console.error("Fatal error during sync:", err);
  process.exit(1);
});
