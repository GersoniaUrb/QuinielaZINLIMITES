import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function main() {
  const { supabase } = await import("../api/_db.js");

  // Get approved users
  const { data: users, error: userError } = await supabase
    .from("quiniela_users")
    .select("id, nickname")
    .eq("approved", true);

  if (userError || !users || users.length === 0) {
    console.error("❌ No approved users found to add predictions for. Make sure coyote or prueba3 exist and are approved.");
    return;
  }

  const coyote = users.find((u: any) => u.nickname.toLowerCase() === "coyote");
  const prueba3 = users.find((u: any) => u.nickname.toLowerCase() === "prueba3");

  if (!coyote && !prueba3) {
    console.error("❌ Could not find users 'coyote' or 'prueba3' in the database. Please register them on the website first.");
    return;
  }

  console.log("Adding mock predictions for Match m1 (MEX vs RSA):");
  
  if (coyote) {
    const payload = {
      user_id: coyote.id,
      match_id: "m1",
      home_score: 2,
      away_score: 1,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("match_predictions").upsert(payload, { onConflict: "user_id,match_id" });
    if (error) {
      console.error(`❌ Error inserting prediction for coyote:`, error.message);
    } else {
      console.log(`✅ User 'coyote' predicted MEX 2 - 1 RSA (Exact prediction)`);
    }
  }

  if (prueba3) {
    const payload = {
      user_id: prueba3.id,
      match_id: "m1",
      home_score: 1,
      away_score: 0,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabase.from("match_predictions").upsert(payload, { onConflict: "user_id,match_id" });
    if (error) {
      console.error(`❌ Error inserting prediction for prueba3:`, error.message);
    } else {
      console.log(`✅ User 'prueba3' predicted MEX 1 - 0 RSA (Winner prediction)`);
    }
  }

  console.log("\nDone! Now run the leaderboard script to check the points.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
});
