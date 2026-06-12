const https = require("https");
const fs = require("fs");
const path = require("path");

const ODDS_URL = "https://trade.500.com/jczq/?playid=354&amp;g=2&amp;vtype=nspf";
const OUTPUT = path.join(__dirname, "..", "odds-data.json");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      timeout: 15000
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

async function main() {
  try {
    console.log("Fetching odds from 500.com...");
    let html = await fetch(ODDS_URL);
    console.log("Downloaded: " + html.length + " bytes");
    
    // Extract team names
    let teamRegex = /td_name[^>]*>([^<]+)</g;
    let teams = [];
    let t;
    while ((t = teamRegex.exec(html)) !== null) {
      teams.push(t[1].trim());
    }
    
    // Extract odds values
    let homeRegex = /nspf_3[^>]*>([0-9.]+)/g;
    let drawRegex = /nspf_1[^>]*>([0-9.]+)/g;
    let awayRegex = /nspf_0[^>]*>([0-9.]+)/g;
    
    let homeOdds = []; let h;
    while ((h = homeRegex.exec(html)) !== null) homeOdds.push(parseFloat(h[1]));
    let drawOdds = []; let d;
    while ((d = drawRegex.exec(html)) !== null) drawOdds.push(parseFloat(d[1]));
    let awayOdds = []; let a;
    while ((a = awayRegex.exec(html)) !== null) awayOdds.push(parseFloat(a[1]));
    
    console.log("Teams: " + teams.length + ", Home odds: " + homeOdds.length + ", Draw: " + drawOdds.length + ", Away: " + awayOdds.length);
    
    let matches = [];
    for (let i = 0; i < Math.min(homeOdds.length, teams.length/2); i++) {
      matches.push({
        home: teams[i*2] || "?",
        away: teams[i*2+1] || "?",
        homeOdds: homeOdds[i] || 0,
        drawOdds: drawOdds[i] || 0,
        awayOdds: awayOdds[i] || 0
      });
    }
    
    let result = {
      updated: new Date().toISOString(),
      source: "500.com",
      totalMatches: matches.length,
      matches: matches
    };
    
    fs.writeFileSync(OUTPUT, JSON.stringify(result, null, 2), "utf8");
    console.log("Saved " + matches.length + " matches to odds-data.json");
  } catch(e) {
    console.error("Error: " + e.message);
    process.exit(1);
  }
}

main();
