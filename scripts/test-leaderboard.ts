import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env") });

async function test() {
  console.log("Loading leaderboard handler...");
  const { default: handler } = await import("../api/quiniela/leaderboard.js");

  // Mock Request & Response
  const req = {
    method: "GET",
    headers: {},
    query: {},
  };

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    statusCode: 200,
    setHeader() {},
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    end() {}
  };

  try {
    await handler(req as any, res as any);
    console.log("Response status:", statusCode);
    if (statusCode === 200 && responseData && responseData.success) {
      console.log(`Successfully calculated leaderboard for ${responseData.leaderboard.length} users:`);
      responseData.leaderboard.forEach((user: any, idx: number) => {
        console.log(`${idx + 1}. Nickname: ${user.nickname} | Total Points: ${user.total_points} (Group: ${user.group_points}, Playoff: ${user.playoff_points}, Exact: ${user.exact_matches}, Winner: ${user.winner_matches})`);
      });
    } else {
      console.error("Leaderboard calculation failed or returned error:", responseData);
    }
  } catch (error) {
    console.error("Error running leaderboard handler:", error);
  }
}

test();
