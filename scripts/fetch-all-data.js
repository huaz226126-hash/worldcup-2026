var https = require("https");
var fs = require("fs");
var path = require("path");

var SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";
var LEAGUE_ID = "4429";
var OUTPUT = path.join(__dirname, "..", "cached-data.json");

function fetch(url, timeout) {
  return new Promise(function(resolve, reject) {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeout || 10000);
    https.get(url, { signal: controller.signal, headers: {"User-Agent": "Mozilla/5.0"} }, function(res) {
      var d = "";
      res.on("data", function(c) { d += c; });
      res.on("end", function() { clearTimeout(timer); try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
    }).on("error", function(e) { clearTimeout(timer); reject(e); });
  });
}

async function main() {
  console.log("Fetching match data...");
  var matchesData = await fetch(SPORTSDB + "/eventsseason.php?id=" + LEAGUE_ID + "&s=2026", 15000);
  var matches = matchesData && matchesData.events ? matchesData.events : [];
  console.log("Got " + matches.length + " matches");

  var teamIds = new Set();
  for (var i = 0; i < matches.length; i++) {
    if (matches[i].idHomeTeam) teamIds.add(matches[i].idHomeTeam);
    if (matches[i].idAwayTeam) teamIds.add(matches[i].idAwayTeam);
  }
  console.log("Fetching " + teamIds.size + " teams...");

  var teams = {};
  var count = 0;
  for (var id of teamIds) {
    try {
      var t = await fetch(SPORTSDB + "/lookupteam.php?id=" + id, 5000);
      if (t && t.teams && t.teams[0]) teams[id] = t.teams[0];
    } catch(e) {}
    count++;
    if (count % 5 === 0) process.stdout.write(".");
  }
  console.log("\nGot " + Object.keys(teams).length + " teams");

  var cache = {
    updated: new Date().toISOString(),
    matches: matches,
    teams: teams
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(cache, null, 2), "utf8");
  console.log("Saved to " + OUTPUT + " (" + (JSON.stringify(cache).length / 1024).toFixed(0) + "KB)");
}

main().catch(function(e) { console.error("Fatal:", e.message); process.exit(1); });
