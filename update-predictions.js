const fetch = require("node-fetch");
const fs = require("fs");

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) { console.error("No API key"); process.exit(1); }

const matches = [
  {home:"Brazil",away:"Morocco"},{home:"Qatar",away:"Switzerland"},
  {home:"Haiti",away:"Scotland"},{home:"Germany",away:"Curacao"},
  {home:"Ivory Coast",away:"Ecuador"},{home:"Netherlands",away:"Japan"},
  {home:"Australia",away:"Turkey"},{home:"Belgium",away:"Egypt"},
  {home:"Saudi Arabia",away:"Uruguay"},{home:"Spain",away:"Cape Verde"},
  {home:"Sweden",away:"Tunisia"}
];

async function main() {
  const prompt = "You are a World Cup analyst. For each match, return a JSON array with: score, home_prob(0-100), draw_prob, away_prob, home_odds, draw_odds, away_odds, analysis in Chinese. Matches:\n" + matches.map((m,i)=>(i+1)+". "+m.home+" vs "+m.away).join("\n");
  console.log("Calling DeepSeek...");
  const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+API_KEY},
    body: JSON.stringify({model:"deepseek-chat",messages:[{role:"user",content:prompt}],temperature:0.3,max_tokens:4000})
  });
  if(!res.ok){console.error("API error:",res.status,await res.text());process.exit(1);}
  const data = await res.json();
  let c = data.choices[0].message.content;
  c = c.replace(/```json?[\s\S]*?```/g, (m)=>m.replace(/```json?\n?/,"").replace(/```/,"").trim());
  const aiData = JSON.parse(c.trim());
  console.log("Got", aiData.length, "predictions");

  let html = fs.readFileSync("index.html", "utf-8");

  // Build predictions HTML
  let predHtml = "";
  for (const a of aiData) {
    predHtml += '<div class="mc"><div class="mr"><span class="tb" style="background:hsl(' + (Math.random()*360) + ',60%,40%)'>' + a.match[0] + '</span><div class="mn"><div>' + a.match.split(" vs ")[0] + '</div><small style="color:#f0c040">vs ' + a.match.split(" vs ")[1] + '</small></div><div class="sc" style="font-size:15px">' + a.score + '</div></div>';
    predHtml += '<div class="pb" style="margin-bottom:4px"><div class="pbh" style="width:' + a.home_prob + '%">' + a.home_prob + '%</div><div class="pbd" style="width:' + a.draw_prob + '%">平' + a.draw_prob + '%</div><div class="pba" style="width:' + a.away_prob + '%">' + a.away_prob + '%</div></div>';
    predHtml += '<div style="font-size:10px;color:#8892a4;margin-top:2px">分析：' + (a.analysis||"") + '</div></div>';
  }

  // Build odds HTML
  let oddsHtml = '<table><thead><tr><th>主队</th><th>客队</th><th>预测比分</th><th>主胜</th><th>平局</th><th>客胜</th></tr></thead><tbody>';
  for (const a of aiData) {
    const parts = a.match.split(" vs ");
    oddsHtml += '<tr><td>' + parts[0] + '</td><td style="text-align:center">' + parts[1] + '</td><td class="ov">' + a.score + '</td><td class="ov">' + a.home_odds.toFixed(2) + '</td><td class="ov">' + a.draw_odds.toFixed(2) + '</td><td class="ov">' + a.away_odds.toFixed(2) + '</td></tr>';
  }
  oddsHtml += "</tbody></table>";

  // Replace sections
  const v2Start = html.indexOf('id=v2');
  let v2TagEnd = html.indexOf(">", v2Start) + 1;
  let v2ContentEnd = html.indexOf("</div>", v2TagEnd);
  html = html.substring(0, v2TagEnd) + predHtml + html.substring(v2ContentEnd);

  const v3Start = html.indexOf('id=v3');
  let v3TagEnd = html.indexOf(">", v3Start) + 1;
  let v3ContentEnd = html.indexOf("</div>", v3TagEnd);
  html = html.substring(0, v3TagEnd) + oddsHtml + html.substring(v3ContentEnd);

  fs.writeFileSync("index.html", html, "utf-8");
  console.log("Updated index.html successfully!");
}

main().catch(e => { console.error(e); process.exit(1); });