#!/usr/bin/env npx tsx

/**
 * WC26 Results Sync Agent (Free Alternative using Football-Data.org)
 *
 * Fetches World Cup 2026 match results from Football-Data.org
 * (free tier with ~10-15 min delay) and synchronizes them with Supabase.
 *
 * Usage: npx tsx scripts/sync-football-data.ts
 * Env: FOOTBALL_DATA_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import { matches } from "../src/data/matches.js";
import { teams } from "../src/data/teams.js";
import { config } from "dotenv";
import { resolve } from "path";


// Load .env explicitly
config({ path: resolve(process.cwd(), ".env") });

// Validate env vars
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!API_KEY) {
  console.error("Error: FOOTBALL_DATA_API_KEY environment variable is required.");
  console.log("Please register for a free API token at: https://www.football-data.org/client/register");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: Supabase credentials missing. Sync will dry-run only.");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

// Football-Data.org World Cup Match list URL
const API_URL = "https://api.football-data.org/v4/competitions/WC/matches";

interface ApiMatch {
  id: number;
  utcDate: string; // ISO date string e.g., "2026-06-11T19:00:00Z"
  status: string;  // "SCHEDULED" | "TIMED" | "IN_PLAY" | "PAUSED" | "FINISHED" | "POSTPONED" | "SUSPENDED" | "CANCELLED"
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    }
  }
}

async function fetchLiveResults(): Promise<ApiMatch[]> {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: {
        "X-Auth-Token": API_KEY!,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.matches as ApiMatch[];
  } catch (error) {
    console.error("Failed to fetch from Football-Data.org:", error);
    return [];
  }
}

function mapMatchStatus(apiStatus: string): string {
  if (apiStatus === "FINISHED") return "completed";
  if (apiStatus === "IN_PLAY" || apiStatus === "PAUSED") return "live";
  return "scheduled"; // SCHEDULED, TIMED, POSTPONED, etc.
}

function resolveLocalTeamId(apiTeamName: string): string | null {
  const normalizedApiName = apiTeamName.toLowerCase();
  
  // 1. Exact match
  let found = teams.find(
    (t) => t.name.toLowerCase() === normalizedApiName || t.code.toLowerCase() === normalizedApiName
  );
  if (found) return found.id;

  // 2. Substring match
  found = teams.find(
    (t) => {
      const staticName = t.name.toLowerCase();
      return normalizedApiName.includes(staticName) || staticName.includes(normalizedApiName);
    }
  );
  if (found) return found.id;

  // 3. Word overlap match (e.g. "USA" vs "United States", "Korea Republic" vs "South Korea")
  const apiWords = normalizedApiName.split(/\s+/).filter(w => w.length > 2);
  found = teams.find((t) => {
    const staticWords = t.name.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return apiWords.some(aw => staticWords.includes(aw));
  });
  if (found) return found.id;

  return null;
}

// Map the API match to our static matches list based on kickoff date/time
function findLocalMatch(apiMatch: ApiMatch) {
  const apiKickoff = new Date(apiMatch.utcDate);

  const matched = matches.filter((m) => {
    const localKickoff = new Date(`${m.date}T${m.time_utc}:00Z`);
    // Match logic: Kickoff time difference is less than 1 hour
    const diffMs = Math.abs(localKickoff.getTime() - apiKickoff.getTime());
    return diffMs < 3600000;
  });

  if (matched.length === 1) {
    return matched[0];
  }

  // Handle simultaneous matches (like Matchday 3) by checking team names
  if (matched.length > 1) {
    const apiHomeId = resolveLocalTeamId(apiMatch.homeTeam.name);
    const apiAwayId = resolveLocalTeamId(apiMatch.awayTeam.name);
    
    const exactMatch = matched.find(
      (m) => m.home_team_id === apiHomeId || m.away_team_id === apiAwayId
    );
    if (exactMatch) return exactMatch;
  }

  return null;
}

async function main() {
  console.log("⚽ WC26 Results Sync Agent (Football-Data.org FREE) starting...\n");

  const apiMatches = await fetchLiveResults();
  
  if (!apiMatches || apiMatches.length === 0) {
    console.log("No matches returned or API error. Exiting.");
    return;
  }

  console.log(`Fetched ${apiMatches.length} matches from Football-Data.org.`);

  let updatedCount = 0;

  for (const apiMatch of apiMatches) {
    const status = mapMatchStatus(apiMatch.status);
    
    // Only care about matches that are live or completed
    if (status === "scheduled") continue;

    const localMatch = findLocalMatch(apiMatch);
    if (!localMatch) {
      console.warn(`Could not map API match ${apiMatch.id} (${apiMatch.homeTeam.name} vs ${apiMatch.awayTeam.name}) to local match.`);
      continue;
    }

    const payload = {
      match_id: localMatch.id,
      home_score: apiMatch.score.fullTime.home ?? 0,
      away_score: apiMatch.score.fullTime.away ?? 0,
      status: status,
      api_fixture_id: apiMatch.id,
      updated_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase.from("match_results").upsert(payload);
      if (error) {
        console.error(`Error upserting match ${localMatch.id}:`, error.message);
      } else {
        updatedCount++;
        console.log(`[SYNCED] ${localMatch.id} | Status: ${status} | Score: ${payload.home_score}-${payload.away_score} (${localMatch.home_team_id.toUpperCase()} vs ${localMatch.away_team_id.toUpperCase()})`);
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
