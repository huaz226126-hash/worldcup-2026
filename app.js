const SPORTSDB = "https://www.thesportsdb.com/api/v1/json/3";
const LEAGUE_ID = "4429";
const SEASON = "2026";
let currentTab = "matches";
let matchesCache = [];
let teamsCache = {};

document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("tabs").addEventListener("click", function(e) {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentTab = tab.dataset.tab;
    loadTab(currentTab);
  });
  loadTab("matches");
  setInterval(function() { loadTab(currentTab); }, 300000);
});

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadAllData() {
  if (matchesCache.length > 0) return;
  const data = await fetchJSON(SPORTSDB + "/eventsseason.php?id=" + LEAGUE_ID + "&s=" + SEASON);
  matchesCache = data.events || [];
  const teamIds = new Set();
  for (const m of matchesCache) {
    if (m.idHomeTeam) teamIds.add(m.idHomeTeam);
    if (m.idAwayTeam) teamIds.add(m.idAwayTeam);
  }
  const batch = [];
  for (const id of teamIds) {
    batch.push(fetchJSON(SPORTSDB + "/lookupteam.php?id=" + id).then(d => {
      if (d.teams && d.teams[0]) teamsCache[id] = d.teams[0];
    }));
  }
  await Promise.all(batch);
}

function showLoading() {
  document.getElementById("main-content").innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
}

function showError(msg) {
  document.getElementById("main-content").innerHTML = '<div class="error">' + msg + '<br><br><button onclick="loadTab(currentTab)" style="background:var(--gold);border:none;padding:8px 20px;border-radius:6px;color:#0a0e17;font-weight:700;cursor:pointer;">重试</button></div>';
}

async function loadTab(tab) {
  showLoading();
  try {
    await loadAllData();
    switch(tab) {
      case "matches": renderMatches(); break;
      case "teams": renderTeams(); break;
      case "predictions": renderPredictions(); break;
      case "odds": renderOdds(); break;
    }
  } catch(e) {
    showError("加载失败: " + e.message);
  }
}

function getStatusLabel(m) {
  var st = m.strStatus || "NS";
  if (st === "FT") return { label: "已结束", cls: "ft" };
  if (st === "LIVE") return { label: "进行中", cls: "live" };
  return { label: "未开始", cls: "ns" };
}

// ---- Team strength calculation ----
function calcTeamStrength(team) {
  if (!team) return 5;
  var score = 5;
  // Older formed teams = more established
  var age = 2026 - parseInt(team.intFormedYear || 2000);
  score += Math.min(3, Math.round(age / 30));
  // Country prestige proxy
  var country = (team.strCountry || "").toLowerCase();
  var powerCountries = ["brazil","argentina","germany","france","italy","spain","england","netherlands","uruguay"];
  if (powerCountries.includes(country)) score += 2;
  var strongCountries = ["portugal","belgium","croatia","colombia","mexico","japan","south korea","usa","senegal","morocco","switzerland","denmark","sweden","poland","australia","ghana","ivory coast","nigeria","cameroon","ecuador","peru","chile","paraguay"];
  if (strongCountries.includes(country)) score += 1;
  return Math.min(10, Math.max(1, score));
}

// ---- Score prediction ----
function predictScore(homeStr, awayStr) {
  var scorePairs = [
    { s: "1-0", w: 15 }, { s: "2-0", w: 12 }, { s: "2-1", w: 15 },
    { s: "1-1", w: 18 }, { s: "0-0", w: 8 },  { s: "0-1", w: 12 },
    { s: "0-2", w: 10 }, { s: "1-2", w: 12 }, { s: "3-1", w: 6 },
    { s: "3-0", w: 5 },  { s: "0-3", w: 4 },  { s: "2-2", w: 6 },
    { s: "1-3", w: 4 },  { s: "3-2", w: 4 },  { s: "4-1", w: 2 },
    { s: "4-0", w: 2 },  { s: "0-4", w: 2 },
  ];
  
  var totalStr = homeStr + awayStr;
  var bias = (homeStr - awayStr) / totalStr; // -1 to 1
  
  var weighted = [];
  for (var i = 0; i < scorePairs.length; i++) {
    var sp = scorePairs[i];
    var parts = sp.s.split("-");
    var hg = parseInt(parts[0]);
    var ag = parseInt(parts[1]);
    var diff = hg - ag;
    // Adjust weight based on team strength bias
    var adj = sp.w + (bias * diff * 5);
    if (adj < 0) adj = 0;
    weighted.push({ score: sp.s, weight: adj, home: hg, away: ag });
  }
  
  // Random pick weighted
  var totalWeight = 0;
  for (var i = 0; i < weighted.length; i++) totalWeight += weighted[i].weight;
  var r = Math.random() * totalWeight;
  var cum = 0;
  for (var i = 0; i < weighted.length; i++) {
    cum += weighted[i].weight;
    if (r <= cum) {
      return { score: weighted[i].score, home: weighted[i].home, away: weighted[i].away };
    }
  }
  return { score: "1-1", home: 1, away: 1 };
}

// ---- Generate analysis text ----
function generateAnalysis(team, opponent, homeStr, awayStr, hScore, aScore) {
  var diff = homeStr - awayStr;
  var analysis = [];
  var hName = team ? (team.strTeam || "主队") : "主队";
  var aName = opponent ? (opponent.strTeam || "客队") : "客队";
  var hCountry = team ? (team.strCountry || "") : "";
  var aCountry = opponent ? (opponent.strCountry || "") : "";
  
  // Team analysis
  if (diff > 2) {
    analysis.push(hName + "历史底蕴深厚，整体实力明显占优");
    analysis.push(aName + "面临强大压力，需稳固防守寻找反击机会");
  } else if (diff > 0) {
    analysis.push(hName + "实力稍占上风，主场气势旺盛");
    analysis.push(aName + "具备一定抗衡能力，比赛不会轻松");
  } else if (diff > -2) {
    analysis.push(aName + "实力略强于对手，但比赛充满变数");
    analysis.push(hName + "坐拥主场之利，有望制造惊喜");
  } else {
    analysis.push(aName + "整体实力明显占优，胜面较大");
    analysis.push(hName + "需超水平发挥才有可能拿分");
  }
  
  // Score analysis
  var total = hScore + aScore;
  if (total >= 4) {
    analysis.push("预计将是一场进球大战");
  } else if (total >= 2) {
    analysis.push("预计双方都有机会破门");
  } else {
    analysis.push("预计场面较为谨慎，进球不会太多");
  }
  
  // Prestige check
  var prestigeKeys = ["brazil","argentina","germany","france","italy","spain","england","netherlands"];
  var hPrestige = prestigeKeys.some(function(k) { return hCountry.toLowerCase().includes(k); });
  var aPrestige = prestigeKeys.some(function(k) { return aCountry.toLowerCase().includes(k); });
  if (hPrestige && aPrestige) {
    analysis.push("两支传统豪门对决，经典之战值得期待");
  } else if (hPrestige || aPrestige) {
    analysis.push(hPrestige ? hName : aName + "作为传统豪门，大赛经验丰富");
  }
  
  return analysis.join(" | ");
}

// ---- Confidence level ----
function getConfidence(homeStr, awayStr) {
  var diff = Math.abs(homeStr - awayStr);
  if (diff >= 4) return { level: "高", cls: "high" };
  if (diff >= 2) return { level: "中", cls: "med" };
  return { level: "低", cls: "low" };
}

// ---- Matches ----
function renderMatches() {
  var groups = {};
  for (var i = 0; i < matchesCache.length; i++) {
    var m = matchesCache[i];
    var d = m.dateEvent || "未知日期";
    if (!groups[d]) groups[d] = [];
    groups[d].push(m);
  }
  var dates = Object.keys(groups).sort();
  var today = new Date();
  var todayStr = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
  var html = '<div class="section-title">\u{1F3C6} \u8D5B\u7A0B\u4E0E\u7ED3\u679C</div>';
  for (var di = 0; di < dates.length; di++) {
    var date = dates[di];
    var matches = groups[date];
    var d = new Date(date);
    var weekdays = ["日","一","二","三","四","五","六"];
    var wd = weekdays[d.getDay()];
    var isToday = date === todayStr;
    var dateLabel = isToday ? "\u{1F534} \u4ECA\u5929 " + date : date + " \u5468" + wd;
    html += '<div class="date-group"><div class="date-header">' + dateLabel + '</div>';
    for (var mi = 0; mi < matches.length; mi++) {
      var m = matches[mi];
      var st = getStatusLabel(m);
      var score = (m.intHomeScore !== null && m.intAwayScore !== null) ? m.intHomeScore + "-" + m.intAwayScore : "vs";
      var roundText = m.intRound ? "\u7B2C" + m.intRound + "\u8F6E" : "";
      var timeText = m.strTime ? m.strTime.slice(0,5) : "";
      html += '<div class="match-card">';
      html += '<div class="match-header"><span>' + (m.strVenue || "") + '</span><span class="match-status ' + st.cls + '">' + st.label + '</span></div>';
      html += '<div class="match-teams">';
      html += '<img class="team-badge" src="' + (m.strHomeTeamBadge || "") + '" alt="" onerror="this.style.display=\'none\'">';
      html += '<span class="team-name">' + m.strHomeTeam + '</span>';
      html += '<span class="score">' + score + '</span>';
      html += '<span class="team-name right">' + m.strAwayTeam + '</span>';
      html += '<img class="team-badge" src="' + (m.strAwayTeamBadge || "") + '" alt="" onerror="this.style.display=\'none\'">';
      html += '</div>';
      html += '<div class="match-info">' + timeText + (timeText && roundText ? " | " : "") + roundText + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }
  document.getElementById("main-content").innerHTML = html;
}

// ---- Teams ----
function renderTeams() {
  var list = Object.entries(teamsCache);
  if (list.length === 0) {
    document.getElementById("main-content").innerHTML = '<div class="error">暂无球队数据</div>';
    return;
  }
  var html = '<div class="section-title">\u{1F3C6} \u53C2\u8D5B\u7403\u961F</div><div class="teams-grid">';
  for (var i = 0; i < list.length; i++) {
    var id = list[i][0];
    var t = list[i][1];
    var badge = t.strBadge || t.strLogo || "";
    var country = t.strCountry || "";
    var formed = t.intFormedYear || "";
    html += '<div class="team-card" onclick="showTeamDetail(\'' + id + '\')">';
    html += '<img src="' + badge + '" alt="" onerror="this.style.display=\'none\'">';
    html += '<div class="name">' + (t.strTeam || t.strTeamAlternate || "?") + '</div>';
    html += '<div class="record">' + country + (formed ? " \u00B7 \u6210\u7ACB" + formed : "") + '</div>';
    html += '</div>';
  }
  html += '</div>';
  document.getElementById("main-content").innerHTML = html;
}

// ---- Predictions (Enhanced) ----
function renderPredictions() {
  var upcoming = matchesCache.filter(function(m) { return m.strStatus === "NS"; });
  if (upcoming.length === 0) {
    document.getElementById("main-content").innerHTML = '<div class="error">暂无未开始的比赛</div>';
    return;
  }
  
  var html = '<div class="section-title">\u{1F9E9} \u6BD4\u8D5B\u9884\u6D4B</div>';
  html += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:12px">\u{1F916} AI分析 + 球队历史数据 | 仅供参考</p>';
  
  for (var i = 0; i < upcoming.length && i < 20; i++) {
    var m = upcoming[i];
    var ht = teamsCache[m.idHomeTeam];
    var at = teamsCache[m.idAwayTeam];
    var hs = calcTeamStrength(ht);
    var as = calcTeamStrength(at);
    
    // Score prediction
    var pred = predictScore(hs, as);
    var hProb = Math.round(hs / (hs + as) * 60 + 15);
    var dProb = Math.round(Math.random() * 10 + 10);
    var aProb = Math.max(1, 100 - hProb - dProb);
    hProb = Math.max(1, 100 - dProb - aProb);
    
    // Confidence
    var conf = getConfidence(hs, as);
    
    // Analysis text
    var analysis = generateAnalysis(ht, at, hs, as, pred.home, pred.away);
    
    // Team badges
    var hBadge = m.strHomeTeamBadge || "";
    var aBadge = m.strAwayTeamBadge || "";
    
    html += '<div class="match-card prediction-enhanced">';
    html += '<div class="match-header"><span>' + (m.strVenue || "") + '</span><span>' + m.dateEvent + " " + (m.strTime ? m.strTime.slice(0,5) : "") + '</span></div>';
    
    // Teams row
    html += '<div class="match-teams" style="margin-bottom:6px">';
    html += '<img class="team-badge" src="' + hBadge + '" alt="" onerror="this.style.display=\'none\'">';
    html += '<span class="team-name">' + m.strHomeTeam + '</span>';
    html += '<span style="font-size:12px;color:var(--text-dim)">vs</span>';
    html += '<span class="team-name right">' + m.strAwayTeam + '</span>';
    html += '<img class="team-badge" src="' + aBadge + '" alt="" onerror="this.style.display=\'none\'">';
    html += '</div>';
    
    // Score prediction - big display
    html += '<div class="score-prediction">';
    html += '<span class="pred-score">' + pred.score + '</span>';
    html += '<span class="pred-label">预测比分</span>';
    html += '<span class="pred-conf conf-' + conf.cls + '">可信度: ' + conf.level + '</span>';
    html += '</div>';
    
    // Probability bar
    html += '<div class="prediction-bar">';
    html += '<div class="pred-bar-home" style="width:' + hProb + '%">' + hProb + '%</div>';
    html += '<div class="pred-bar-draw" style="width:' + dProb + '%">平</div>';
    html += '<div class="pred-bar-away" style="width:' + aProb + '%">' + aProb + '%</div>';
    html += '</div>';
    
    // Analysis text
    html += '<div class="analysis-text">\u{1F4A1} ' + analysis + '</div>';
    
    html += '</div>';
  }
  
  document.getElementById("main-content").innerHTML = html;
}

// ---- Odds ----
function renderOdds() {
  var upcoming = matchesCache.filter(function(m) { return m.strStatus === "NS"; });
  if (upcoming.length === 0) {
    document.getElementById("main-content").innerHTML = '<div class="error">暂无数据</div>';
    return;
  }
  var html = '<div class="section-title">💰 购买指数</div>';
  html += '<div class="odds-explainer">';
  html += '<p>👇 这些数字是什么意思？比如你下注 100元，猜对就拿到：</p>';
  html += '<div class="odds-example">';
  html += '<span class="ex-home">主能 2.44 → 赢 $244</span>';
  html += '<span class="ex-draw">平局 6.60 → 赢 $660</span>';
  html += '<span class="ex-away">客胜 11.0 → 赢 $1100</span>';
  html += '</div>';
  html += '<p style="font-size:11px;color:#8892a4;margin-top:4px">数字越小 = 发生可能性越大 · 但赢得也越少</p>';
  html += '</div>';
  html += '<table class="odds-table"><thead><tr>';
  html += '<th>对阵</th><th>主胜</th><th>平局</th><th>客胜</th><th>🎯推荐</th>';
  html += '</tr></thead><tbody>';
  for (var i = 0; i < upcoming.length && i < 30; i++) {
    var m = upcoming[i];
    var ht = teamsCache[m.idHomeTeam];
    var at = teamsCache[m.idAwayTeam];
    var hs = ht ? Math.min(10, Math.max(1, Math.round((2026 - parseInt(ht.intFormedYear || 1900)) / 15))) : 5;
    var as = at ? Math.min(10, Math.max(1, Math.round((2026 - parseInt(at.intFormedYear || 1900)) / 15))) : 5;
    var total = hs + as;
    var hOdds = (total / hs * 2).toFixed(2);
    var dOdds = (total / 2.5 * 1.5).toFixed(2);
    var aOdds = (total / as * 2).toFixed(2);
    var best = Math.min(parseFloat(hOdds), parseFloat(dOdds), parseFloat(aOdds));
    var rec = best === parseFloat(hOdds) ? m.strHomeTeam : best === parseFloat(dOdds) ? "平局" : m.strAwayTeam;
    var recCls = best === parseFloat(hOdds) ? "rec-home" : best === parseFloat(dOdds) ? "rec-draw" : "rec-away";
    var homePct = Math.round(1 / parseFloat(hOdds) * 100);
    var drawPct = Math.round(1 / parseFloat(dOdds) * 100);
    var awayPct = Math.round(1 / parseFloat(aOdds) * 100);
    html += '<tr>';
    html += '<td><div class="team-cell">';
    html += '<img src="' + (m.strHomeTeamBadge || "") + '" alt="" onerror="this.style.display=\'none\'">';
    html += m.strHomeTeam + ' vs ' + m.strAwayTeam;
    html += '<img src="' + (m.strAwayTeamBadge || "") + '" alt="" onerror="this.style.display=\'none\'">';
    html += '</div></td>';
    html += '<td class="odds-value">' + hOdds + '<br><span class="odds-pct">' + homePct + '%</span></td>';
    html += '<td>' + dOdds + '<br><span class="odds-pct">' + drawPct + '%</span></td>';
    html += '<td class="odds-value">' + aOdds + '<br><span class="odds-pct">' + awayPct + '%</span></td>';
    html += '<td><span class="odds-rec ' + recCls + '">' + rec + '</span></td>';
    html += '</tr>';
  }
  html += '</tbody></table>';
  html += '<p style="font-size:10px;color:#8892a4;margin-top:8px;text-align:center">模拟数据仅供参考 · % = 可能性</p>';
  document.getElementById("main-content").innerHTML = html;
}

// ---- Team Detail Modal ----
async function showTeamDetail(id) {
  var data = await fetchJSON(SPORTSDB + "/lookupteam.php?id=" + id);
  if (!data.teams || !data.teams[0]) return;
  var t = data.teams[0];
  var teamMatches = matchesCache.filter(function(m) { return m.idHomeTeam === id || m.idAwayTeam === id; });
  var wins = 0, losses = 0, draws = 0;
  for (var i = 0; i < teamMatches.length; i++) {
    var m = teamMatches[i];
    if (m.intHomeScore === null) continue;
    if (m.idHomeTeam === id) {
      if (parseInt(m.intHomeScore) > parseInt(m.intAwayScore)) wins++;
      else if (parseInt(m.intHomeScore) < parseInt(m.intAwayScore)) losses++;
      else draws++;
    } else {
      if (parseInt(m.intAwayScore) > parseInt(m.intHomeScore)) wins++;
      else if (parseInt(m.intAwayScore) < parseInt(m.intHomeScore)) losses++;
      else draws++;
    }
  }
  var strength = calcTeamStrength(t);
  var overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = '<div class="modal-content"><div class="modal-header">' +
    '<img src="' + (t.strBadge || t.strLogo || "") + '" alt="" onerror="this.style.display=\'none\'">' +
    '<h2>' + (t.strTeam || "?") + '</h2>' +
    '<button class="modal-close" onclick="this.closest(\'.modal-overlay\').remove()">\u2716</button>' +
    '</div><div class="modal-body">' +
    '<div class="info-row"><span class="info-label">国家</span><span class="info-value">' + (t.strCountry || "N/A") + '</span></div>' +
    '<div class="info-row"><span class="info-label">成立年代</span><span class="info-value">' + (t.intFormedYear || "N/A") + '</span></div>' +
    '<div class="info-row"><span class="info-label">实力评分</span><span class="info-value" style="color:' + (strength >= 8 ? "var(--gold)" : "var(--green)") + ';font-weight:700">' + strength + '/10</span></div>' +
    '<div class="info-row"><span class="info-label">世界杯战绩</span><span class="info-value">' + wins + "胜 " + draws + "平 " + losses + "负" + '</span></div>' +
    (t.strStadium ? '<div class="info-row"><span class="info-label">主场</span><span class="info-value">' + t.strStadium + '</span></div>' : "") +
    (t.strWebsite ? '<div class="info-row"><span class="info-label">官网</span><span class="info-value"><a href="https://' + t.strWebsite + '" target="_blank" rel="noopener" style="color:var(--gold)">' + t.strWebsite + '</a></span></div>' : "") +
    (t.strDescriptionEN ? '<p style="margin-top:12px;font-size:12px;color:var(--text-dim);line-height:1.6">' + t.strDescriptionEN.slice(0,300) + '...</p>' : "") +
    '</div></div>';
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) overlay.remove();
  });
  document.body.appendChild(overlay);
}
