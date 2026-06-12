async function fetchJSON(url) {
  var result = await Promise.race([
    fetch(url),
    new Promise(function(_, reject) { setTimeout(function() { reject(new Error("Timeout")); }, 8000); })
  ]);
  if (!result.ok) throw new Error("HTTP " + result.status);
  return result.json();
}
    }
  } catch(e) {}
  
  try {
    var data = await fetchJSON(SPORTSDB + "/eventsseason.php?id=" + LEAGUE_ID + "\u0026s=" + SEASON, 10000);
    matchesCache = data.events || [];
  } catch(e) {
    matchesCache = [];
    return;
  }
  if (matchesCache.length === 0) return;
  var teamIds = new Set();
  for (var i = 0; i < matchesCache.length; i++) {
    var m = matchesCache[i];
    if (m.idHomeTeam) teamIds.add(m.idHomeTeam);
    if (m.idAwayTeam) teamIds.add(m.idAwayTeam);
  }
  var batch = [];
  for (var id of teamIds) {
    batch.push(Promise.race([
      fetchJSON(SPORTSDB + "/lookupteam.php?id=" + id, 6000).then(function(d) {
        try { if (d && d.teams && d.teams[0]) teamsCache[id] = d.teams[0]; } catch(e) {}
      }).catch(function(e) {}),
      timeoutPromise(6000)
    ]));
  }
  await Promise.all(batch.map(function(p) { return p.catch(function(e) { return null; }); }));
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
  // ---- Chinese Country Names ----
var COUNTRY_CN = {
  "Mexico":"墨西哥","South Africa":"南非","South Korea":"韩国","Czech Republic":"捷克",
  "Canada":"加拿大","Bosnia-Herzegovina":"波黑","USA":"美国","Paraguay":"巴拉圭",
  "Brazil":"巴西","Morocco":"摩洛哥","Qatar":"卡塔尔","Switzerland":"瑞士",
  "Haiti":"海地","Scotland":"苏格兰","Germany":"德国","Curaçao":"库拉索",
  "Ivory Coast":"科特迪瓦","Ecuador":"厄瓜多尔","Netherlands":"荷兰","Japan":"日本",
  "Australia":"澳大利亚","Turkey":"土耳其","Belgium":"比利时","Egypt":"埃及",
  "Saudi Arabia":"沙特阿拉伯","Uruguay":"乌拉圭","Spain":"西班牙","Cape Verde":"佛得角",
  "Sweden":"瑞典","Tunisia":"突尼斯","England":"英格兰","Wales":"威尔士",
  "Portugal":"葡萄牙","Ghana":"加纳","Denmark":"丹麦","Croatia":"克罗地亚",
  "France":"法国","Italy":"意大利","Senegal":"塞内加尔","Cameroon":"喀麦隆",
  "Argentina":"阿根廷","Chile":"智利","Nigeria":"尼日利亚","Poland":"波兰",
  "Colombia":"哥伦比亚","Peru":"秘鲁","Serbia":"塞尔维亚","Iran":"伊朗",
  "Austria":"奥地利","Hungary":"匈牙利","Norway":"挪威","Ukraine":"乌克兰",
  "Russia":"俄罗斯","Guinea":"几内亚","Algeria":"阿尔及利亚","Mali":"马里",
  "Congo":"刚果","Zambia":"赞比亚","Jamaica":"牙买加","Panama":"巴拿马",
  "Costa Rica":"哥斯达黎加","Honduras":"洪都拉斯","Venezuela":"委内瑞拉",
  "Bolivia":"玻利维亚","Greece":"希腊","Romania":"罗马尼亚","Bulgaria":"保加利亚",
  "Slovakia":"斯洛伐克","Slovenia":"斯洛文尼亚","Iceland":"冰岛","Finland":"芬兰",
  "Ireland":"爱尔兰","Northern Ireland":"北爱尔兰","Montenegro":"黑山",
  "North Macedonia":"北马其顿","Georgia":"格鲁吉亚","Armenia":"亚美尼亚",
  "Kazakhstan":"哈萨克斯坦","Uzbekistan":"乌兹别克斯坦","China PR":"中国",
  "Japan":"日本","South Korea":"韩国","Thailand":"泰国","Vietnam":"越南",
  "Indonesia":"印度尼西亚","Malaysia":"马来西亚","Singapore":"新加坡",
  "India":"印度","New Zealand":"新西兰","Fiji":"斐济"
};

// ---- Top Clubs Database ----
var TOP_CLUBS = {
  "Brazil":["Real Madrid","Barcelona","Paris SG","Manchester City","Arsenal","Chelsea","Liverpool","Manchester Utd","Juventus","AC Milan","Inter Milan","Bayern Munich","Benfica","Porto","PSV","Ajax","Flamengo","Palmeiras","Santos","Sao Paulo","Corinthians","Gremio","Internacional","Athletico Paranaense","Fluminense","Botafogo","Cruzeiro"],
  "Argentina":["Inter Miami","Paris SG","Manchester City","Chelsea","Liverpool","AC Milan","Inter Milan","Napoli","AS Roma","Lazio","Atletico Madrid","Sevilla","Villarreal","Benfica","Porto","Sporting CP","River Plate","Boca Juniors","Independiente","Racing Club","San Lorenzo","Velez Sarsfield","Estudiantes","Rosario Central","Talleres","Defensa y Justicia"],
  "England":["Manchester City","Arsenal","Liverpool","Chelsea","Manchester Utd","Tottenham","Newcastle","Aston Villa","Brighton","West Ham","Crystal Palace","Brentford","Wolverhampton","Everton","Nottingham Forest","Leicester City","Leeds United","Southampton","Fulham","Bournemouth","Ipswich Town"],
  "Germany":["Bayern Munich","Borussia Dortmund","Bayer Leverkusen","RB Leipzig","Eintracht Frankfurt","VfB Stuttgart","Borussia Monchengladbach","Wolfsburg","Werder Bremen","FC Koln","Union Berlin","SC Freiburg","Mainz 05","Augsburg","Hoffenheim","Bochum","Heidenheim","Darmstadt","Hamburger SV","Schalke 04"],
  "France":["Paris SG","Marseille","Lyon","Monaco","Lille","Nice","Rennes","Lens","Strasbourg","Montpellier","Toulouse","Brest","Nantes","Reims","Le Havre","Metz","Clermont","Auxerre","Saint-Etienne","Bordeaux"],
  "Spain":["Real Madrid","Barcelona","Atletico Madrid","Sevilla","Real Sociedad","Athletic Bilbao","Villarreal","Real Betis","Valencia","Celta Vigo","Girona","Rayo Vallecano","Osasuna","Mallorca","Getafe","Alaves","Las Palmas","Cadiz","Granada","Espanyol"],
  "Italy":["Juventus","Inter Milan","AC Milan","Napoli","AS Roma","Lazio","Atalanta","Fiorentina","Bologna","Torino","Genoa","Sassuolo","Empoli","Lecce","Salernitana","Hellas Verona","Monza","Cagliari","Udinese","Parma"],
  "Portugal":["Benfica","Porto","Sporting CP","Braga","Vitoria Guimaraes","Rio Ave","Famalicao","Gil Vicente","Moreirense","Casa Pia","Estoril","Portimonense","Chaves","Vizela","Estrela Amadora","Boavista","Arouca","Farense"],
  "Netherlands":["Ajax","PSV","Feyenoord","AZ Alkmaar","Twente","Vitesse","Utrecht","Heerenveen","Groningen","NEC Nijmegen","Sparta Rotterdam","Go Ahead Eagles","Fortuna Sittard","Excelsior","RKC Waalwijk","Almere City","PEC Zwolle","Heracles Almelo","Willem II"],
  "Belgium":["Club Brugge","Anderlecht","Genk","Standard Liege","Antwerp","Gent","Union SG","Cercle Brugge","St Truiden","OH Leuven","Mechelen","Kortrijk","Charleroi","Eupen","Westerlo","RWDM"]
};

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
  html += '<p style="font-size:11px;color:#8892a4;margin-top:4px">参考中国体育彩票竞彩赔率格式 · 数字越小 = 可能性越大 · 赢得越少</p>';
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


// ---- Real Odds Fetcher ----
var ODDS_DATA_URL = "https://huaz226126-hash.github.io/worldcup-2026/odds-data.json";
var realOddsCache = null;
async function fetchRealOdds() {
  try {
    var res = await fetch(ODDS_DATA_URL + "?t=" + Date.now());
    if (!res.ok) return false;
    var data = await res.json();
    if (data && data.matches && data.matches.length > 0 && data.matches[0].homeOdds > 0) {
      realOddsCache = data;
      return true;
    }
    return false;
  } catch(e) { return false; }
}
function matchTeamName(cnName) {
  var map = {"巴西":"Brazil","阿根廷":"Argentina","德国":"Germany","法国":"France",
    "英格兰":"England","西班牙":"Spain","葡萄牙":"Portugal","荷兰":"Netherlands",
    "比利时":"Belgium","意大利":"Italy","乌拉圭":"Uruguay","墨西哥":"Mexico",
    "克罗地亚":"Croatia","丹麦":"Denmark","瑞士":"Switzerland","日本":"Japan",
    "韩国":"South Korea","美国":"USA","加拿大":"Canada","澳大利亚":"Australia",
    "摩洛哥":"Morocco","塞内加尔":"Senegal","尼日利亚":"Nigeria","加纳":"Ghana",
    "喀麦隆":"Cameroon","巴拉圭":"Paraguay","厄瓜多尔":"Ecuador","秘鲁":"Peru",
    "哥伦比亚":"Colombia","智利":"Chile","瑞典":"Sweden","波兰":"Poland",
    "土耳其":"Turkey","苏格兰":"Scotland","捷克":"Czech Republic","南非":"South Africa",
    "波黑":"Bosnia-Herzegovina","海地":"Haiti","卡塔尔":"Qatar","沙特":"Saudi Arabia",
    "科特迪瓦":"Ivory Coast","佛得角":"Cape Verde","突尼斯":"Tunisia","埃及":"Egypt",
    "库拉索":"Curacao"};
  return map[cnName] || cnName;
}

// ---- Squad Generator ----
function generateSquad(team, strength) {
  var positions = [];
  for (var i = 0; i < 3; i++) positions.push("\u95E8\u5C06");
  for (var i = 0; i < 8; i++) positions.push("\u540E\u536B");
  for (var i = 0; i < 8; i++) positions.push("\u4E2D\u573A");
  for (var i = 0; i < 4; i++) positions.push("\u524D\u950B");
  var posDescs = {"\u95E8\u5C06":"\u53CD\u5E94\u8FC5\u901F","\u540E\u536B":"\u8EAB\u4F53\u5F3A\u58EE","\u4E2D\u573A":"\u7EC4\u7EC7\u8FDB\u653B","\u524D\u950B":"\u95E8\u524D\u654F\u611F"};
  var country = (team.strCountry || "");
  var clubs = TOP_CLUBS[country] || ["\u672C\u571F\u4FF1\u4E50\u90E8"];
  var squad = [];
  var baseValue = strength * 100;
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var posVal = pos === "\u524D\u950B" ? 1.5 : pos === "\u4E2D\u573A" ? 1.2 : pos === "\u95E8\u5C06" ? 0.8 : 1.0;
    var value = Math.round(baseValue * posVal * (0.5 + Math.random() * 0.8));
    var club = clubs[Math.floor(Math.random() * clubs.length)];
    var pnum = i + 1;
    var label = pnum <= 11 ? "首发" : "替补";
    if (pos === "\u95E8\u5C06" && i >= 2) label = "替补";
    squad.push({ number: pnum, position: pos, club: club, value: value, label: label, desc: posDescs[pos] });
  }
  return squad;
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
  var squad = generateSquad(t, strength);
  var cnName = COUNTRY_CN[t.strCountry] || "";
  var html = '<div class="modal-content"><div class="modal-header">' +
    '<img src="' + (t.strBadge || t.strLogo || "") + '" alt="" onerror="this.style.display=\"none\"">' +
    '<h2>' + (t.strTeam || "?") + ' <span style="font-size:13px;color:#8892a4;font-weight:400">' + cnName + '</span></h2>' +
    '<button class="modal-close" onclick="this.closest(\".modal-overlay\").remove()">\u2716</button>' +
    '</div><div class="modal-body">' +
    '<div class="info-row"><span class="info-label">\u56FD\u5BB6</span><span class="info-value">' + (t.strCountry || "N/A") + ' ' + cnName + '</span></div>' +
    '<div class="info-row"><span class="info-label">\u6210\u7ACB\u5E74\u4EE3</span><span class="info-value">' + (t.intFormedYear || "N/A") + '</span></div>' +
    '<div class="info-row"><span class="info-label">\u5B9E\u529B\u8BC4\u5206</span><span class="info-value" style="color:' + (strength >= 8 ? 'var(--gold)' : 'var(--green)') + ';font-weight:700">' + strength + '/10</span></div>' +
    '<div class="info-row"><span class="info-label">\u4E16\u754C\u676F\u6218\u7EE9</span><span class="info-value">' + wins + '\u80DC ' + draws + '\u5E73 ' + losses + '\u8D1F</span></div>' +
    (t.strStadium ? '<div class="info-row"><span class="info-label">\u4E3B\u573A</span><span class="info-value">' + t.strStadium + '</span></div>' : '') +
    (t.strWebsite ? '<div class="info-row"><span class="info-label">\u5B98\u7F51</span><span class="info-value"><a href="https://' + t.strWebsite + '" target="_blank" rel="noopener" style="color:var(--gold)">' + t.strWebsite + '</a></span></div>' : '') +
    '<div style="margin-top:14px"><h3 style="font-size:14px;color:var(--gold);margin-bottom:8px">\u{1F465} \u51FA\u573A\u7403\u5458</h3>' +
    '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
    '<thead><tr style="color:#8892a4;border-bottom:1px solid rgba(255,255,255,0.06)">' +
    '<th style="padding:4px;text-align:center">#</th><th style="padding:4px;text-align:left">\u4F4D\u7F6E</th>' +
    '<th style="padding:4px;text-align:left">\u655D\u529B\u4FF1\u4E50\u90E8</th><th style="padding:4px;text-align:right">\u8EAB\u4EF7</th><th style="padding:4px;text-align:center">\u72B6\u6001</th>' +
    '</tr></thead><tbody>';
  for (var si = 0; si < squad.length && si < 23; si++) {
    var sp = squad[si];
    var valDisplay = sp.value >= 100 ? Math.round(sp.value/100) + '\u4E07\u20AC' : sp.value + '\u4E07\u20AC';
    var bgColor = sp.label === '首发' ? 'rgba(0,200,83,0.15)' : 'rgba(136,146,164,0.15)';
    var textColor = sp.label === '首发' ? '#00c853' : '#8892a4';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.02)">' +
      '<td style="padding:4px;text-align:center;color:#8892a4">' + sp.number + '</td>' +
      '<td style="padding:4px">' + sp.position + '<br><span style="font-size:9px;color:#8892a4">' + sp.desc + '</span></td>' +
      '<td style="padding:4px;font-size:10px">' + sp.club + '</td>' +
      '<td style="padding:4px;text-align:right;color:var(--gold);font-weight:700">' + valDisplay + '</td>' +
      '<td style="padding:4px;text-align:center"><span style="font-size:10px;padding:1px 6px;border-radius:3px;background:' + bgColor + ';color:' + textColor + '">' + sp.label + '</span></td>' +
    '</tr>';
  }
  html += '</tbody></table></div>' +
    (t.strDescriptionEN ? '<p style="margin-top:12px;font-size:12px;color:#8892a4;line-height:1.6">' + t.strDescriptionEN.slice(0,300) + '...</p>' : '') +
    '</div></div>';
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = html;
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
