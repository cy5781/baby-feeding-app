var TYPE_WHITELIST = {
  milk: 1, solid: 1, med: 1, poop: 1,
  sleep: 1, vaccine: 1, illness: 1, weight: 1
}
var SOLID_PORTIONS = { "少量": 1, "半碗": 1, "一碗": 1, "很多": 1 }
var POOP_TYPES = { "干": 1, "正常": 1, "稀": 1 }
var POOP_COLORS = { "黄": 1, "绿": 1, "褐": 1, "黑": 1 }
var POOP_AMOUNTS = { "少": 1, "正常": 1, "多": 1 }
var SLEEP_EVENTS = { "入睡": 1, "醒来": 1 }
var MED_NAME_MAP = {
  AD: "AD", D3: "D3", DHA: "DHA",
  CALCIUM: "CALCIUM", "钙": "CALCIUM", "液体钙": "CALCIUM"
}
var MED_LABELS = { AD: "AD", D3: "D3", DHA: "DHA", CALCIUM: "液体钙" }
var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
var TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

function trimStr(v) {
  return String(v === null || v === undefined ? "" : v).trim()
}

function isValidDateKey(s) {
  var m = DATE_RE.exec(s)
  if (!m) return false
  var y = parseInt(m[1], 10)
  var mo = parseInt(m[2], 10)
  var d = parseInt(m[3], 10)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  var dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

function isValidTime(s) {
  return TIME_RE.test(s)
}

function isPhotoUploadPath(fileID) {
  return trimStr(fileID).indexOf("photo-import/") !== -1
}

function normFeedMethod(v) {
  var s = trimStr(v)
  if (s === "母乳" || s === "混合" || s === "奶粉") return s
  return ""
}

function normalizeItem(raw, ctx) {
  if (!raw || typeof raw !== "object") return null
  var type = trimStr(raw.type)
  if (!TYPE_WHITELIST[type]) return null

  var ownDate = trimStr(raw.dateKey)
  if (!isValidDateKey(ownDate) || (ctx.todayKey && ownDate > ctx.todayKey)) ownDate = ""
  var hasOwnDate = !!ownDate
  var dateKey = ownDate || ctx.detectedDate || ctx.defaultDateKey
  if (!dateKey) return null

  var time = trimStr(raw.time)
  if (!isValidTime(time)) time = ""

  var out = {
    type: type,
    dateKey: dateKey,
    hasOwnDate: hasOwnDate,
    time: time,
    timeMissing: !time,
    note: trimStr(raw.note).slice(0, 200)
  }

  if (type === "milk") {
    var amount = parseInt(raw.milkAmount, 10)
    if (!isFinite(amount) || amount < 1 || amount > 500) return null
    out.milkAmount = amount
    out.feedMethod = normFeedMethod(raw.feedMethod)
  } else if (type === "solid") {
    var solidItem = trimStr(raw.solidItem).slice(0, 100)
    if (!solidItem) return null
    out.solidItem = solidItem
    var portion = trimStr(raw.solidPortion)
    out.solidPortion = SOLID_PORTIONS[portion] ? portion : ""
  } else if (type === "med") {
    var medRaw = trimStr(raw.medName) || trimStr(raw.medNameLabel)
    if (!medRaw) return null
    var upper = medRaw.toUpperCase()
    if (MED_NAME_MAP[upper]) medRaw = MED_NAME_MAP[upper]
    else if (MED_NAME_MAP[medRaw]) medRaw = MED_NAME_MAP[medRaw]
    out.medName = medRaw
    out.medNameLabel = MED_LABELS[medRaw] || medRaw
  } else if (type === "poop") {
    var poopType = trimStr(raw.poopType)
    var poopColor = trimStr(raw.poopColor)
    if (!POOP_TYPES[poopType] || !POOP_COLORS[poopColor]) return null
    out.poopType = poopType
    out.poopColor = poopColor
    var poopAmount = trimStr(raw.poopAmount)
    out.poopAmount = POOP_AMOUNTS[poopAmount] ? poopAmount : ""
  } else if (type === "sleep") {
    var sleepEvent = trimStr(raw.sleepEvent)
    if (!SLEEP_EVENTS[sleepEvent]) return null
    out.sleepEvent = sleepEvent
  } else if (type === "vaccine") {
    out.subType = trimStr(raw.subType).slice(0, 100) || "疫苗"
  } else if (type === "illness") {
    var illnessType = trimStr(raw.subType).slice(0, 100)
    if (!illnessType) return null
    out.subType = illnessType
  } else if (type === "weight") {
    var kg = parseFloat(raw.weightKg)
    if (!isFinite(kg) || kg <= 0 || kg >= 50) return null
    out.weightKg = Math.round(kg * 10) / 10
  }

  return out
}

function signature(item) {
  var parts = [item.type, item.dateKey, item.time]
  if (item.type === "milk") {
    parts.push(item.milkAmount, item.feedMethod)
  } else if (item.type === "solid") {
    parts.push(item.solidItem, item.solidPortion)
  } else if (item.type === "med") {
    parts.push(item.medName)
  } else if (item.type === "poop") {
    parts.push(item.poopType, item.poopColor, item.poopAmount)
  } else if (item.type === "sleep") {
    parts.push(item.sleepEvent)
  } else if (item.type === "vaccine" || item.type === "illness") {
    parts.push(item.subType)
  } else if (item.type === "weight") {
    parts.push(item.weightKg)
  }
  return parts.join("|")
}

function normalizeParsed(parsed, opts) {
  opts = opts || {}
  var todayKey = trimStr(opts.todayKey)
  if (!isValidDateKey(todayKey)) todayKey = ""
  var defaultDateKey = trimStr(opts.defaultDateKey)
  if (!isValidDateKey(defaultDateKey)) defaultDateKey = todayKey
  var maxItems = parseInt(opts.maxItems, 10)
  if (!isFinite(maxItems) || maxItems <= 0) maxItems = 30

  if (!parsed || typeof parsed !== "object") {
    return { items: [], detectedDate: "" }
  }

  var detectedDate = trimStr(parsed.detectedDate)
  if (!isValidDateKey(detectedDate)) detectedDate = ""
  if (detectedDate && todayKey && detectedDate > todayKey) detectedDate = ""

  var rawItems = Array.isArray(parsed.items) ? parsed.items : []
  var items = []
  var seen = {}

  for (var i = 0; i < rawItems.length && items.length < maxItems; i++) {
    var item = normalizeItem(rawItems[i], {
      todayKey: todayKey,
      detectedDate: detectedDate,
      defaultDateKey: defaultDateKey
    })
    if (!item) continue
    var sig = signature(item)
    if (seen[sig]) continue
    seen[sig] = true
    items.push(item)
  }

  return { items: items, detectedDate: detectedDate }
}

function ocrTextFromResponse(response) {
  var detections = response && response.TextDetections ? response.TextDetections : []
  var lines = []
  for (var i = 0; i < detections.length; i++) {
    var d = detections[i] || {}
    var text = trimStr(d.DetectedText)
    if (!text) continue
    var x = 0
    var y = 0
    var hasPos = false
    var poly = d.Polygon
    if (poly && poly.length) {
      var xs = []
      var ys = []
      for (var p = 0; p < poly.length; p++) {
        if (typeof poly[p].X === "number") xs.push(poly[p].X)
        if (typeof poly[p].Y === "number") ys.push(poly[p].Y)
      }
      if (xs.length && ys.length) {
        x = Math.min.apply(null, xs)
        y = Math.min.apply(null, ys)
        hasPos = true
      }
    }
    lines.push({ text: text, x: x, y: y, hasPos: hasPos, order: i })
  }
  lines.sort(function (a, b) {
    if (a.hasPos && b.hasPos) {
      if (Math.abs(a.y - b.y) > 12) return a.y - b.y
      return a.x - b.x
    }
    return a.order - b.order
  })
  var out = []
  for (var j = 0; j < lines.length; j++) out.push(lines[j].text)
  return out.join("\n")
}

function buildSystemPrompt(todayKey) {
  return [
    "你是一个信息抽取服务，只输出 JSON。",
    "下面是一页纸质喂养记录本经 OCR 识别出的文字。请把其中所有喂养记录拆成结构化条目。",
    "今天的日期是 " + todayKey + "。",
    "年份推断：文中只写「8月12日」「8.12」时，若该日期晚于今天，则视为上一年；否则为今年。",
    "输出 JSON schema：",
    "{",
    '  "detectedDate": "YYYY-MM-DD 或空字符串（整页统一日期，通常来自页眉）",',
    '  "items": [',
    "    {",
    '      "type": "milk|solid|med|poop|sleep|vaccine|illness|weight",',
    '      "time": "HH:mm 或空字符串（没写就留空）",',
    '      "dateKey": "YYYY-MM-DD 或空字符串",',
    '      "milkAmount": 145,',
    '      "feedMethod": "母乳|混合|奶粉|空字符串",',
    '      "solidItem": "米糊",',
    '      "solidPortion": "少量|半碗|一碗|很多|空字符串",',
    '      "medName": "AD|D3|DHA|CALCIUM 或原文",',
    '      "poopType": "干|正常|稀|空字符串",',
    '      "poopColor": "黄|绿|褐|黑|空字符串",',
    '      "poopAmount": "少|正常|多|空字符串",',
    '      "sleepEvent": "入睡|醒来|空字符串",',
    '      "subType": "疫苗名或症状",',
    '      "weightKg": 8.5,',
    '      "note": "对应的原始行"',
    "    }",
    "  ]",
    "}",
    "规则：",
    "1. 一行通常对应一条记录；一个时间点有多个项目（如同时喝了奶和吃了 D3）就拆成多条。",
    "2. 「9:00-10:00 睡」这类区间拆成「入睡」和「醒来」两条。",
    "3. 中文数字转阿拉伯数字：「一百四十五」→145，「九点半」→09:30。",
    "4. 没写时间就留空，绝不编造；没写日期就留空，或使用页眉 detectedDate。",
    "5. 常见简写：奶/奶粉/配方奶→milk；母乳→milk 且 feedMethod=母乳；便/臭臭/拉→poop；睡/入睡→入睡；醒/起床→醒来；D3/AD/DHA/钙→med。",
    "6. 无法归类的行不要输出；最多 30 条。",
    "7. 只输出 JSON，不要解释。"
  ].join("\n")
}

module.exports = {
  normalizeParsed: normalizeParsed,
  ocrTextFromResponse: ocrTextFromResponse,
  buildSystemPrompt: buildSystemPrompt,
  isPhotoUploadPath: isPhotoUploadPath
}
