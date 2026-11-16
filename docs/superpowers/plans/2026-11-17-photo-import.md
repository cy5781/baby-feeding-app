# 拍照导入喂养记录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户拍一张手写喂养记录本的照片，自动 OCR 识别并由 DeepSeek 拆成多条结构化记录，在确认页勾选/改时间后批量入库。

**Architecture:** 新增 `pages/photo-import` 页面负责拍照、预览、确认与批量保存；新增 `photo_parse` 云函数串联腾讯云 `GeneralHandwritingOCR` 与 DeepSeek 多记录解析；新增 `event_add_batch` 云函数一次性写入最多 30 条记录。首页在快捷入口下方增加拍照入口。纯逻辑抽到同目录的 `normalize.js` / `validate.js` / `helpers.js`，用 Node 脚本做单元测试。

**Tech Stack:** WeChat Mini Program 原生（ES5）、WeChat Cloud Development、腾讯云 OCR `GeneralHandwritingOCR`（TC3 签名）、DeepSeek `deepseek-v4-flash`、Node.js 断言脚本。

**Spec:** `docs/superpowers/specs/2026-11-16-photo-import-design.md`

## Global Constraints

- 小程序 JS 一律 ES5：不用箭头函数、模板字符串、解构、`const`/`let`；函数写成 `function () {}`。
- WXML 属性值中禁止 `{{}}` 内使用 `===` 或三元表达式；动态 class/文案必须在 JS 里预计算成字段。
- WXML 布尔属性必须显式赋值，如 `scroll-x="{{true}}"`。
- WXSS 禁止 `inset` 简写；禁止在 `page` 选择器使用 CSS 自定义属性。
- 云函数必须自包含；不得 `require()` 兄弟目录文件。同目录内的辅助文件（`normalize.js`、`validate.js`）允许。
- 密钥只从 `process.env` 读取：`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`DEEPSEEK_API_KEY`。
- 设计 token：`--paper #F5FAF3`、`--paper-line #D3E6CB`、`--ink #33422E`、`--ink-soft #7E9078`、`--primary #4F9668`、`--primary-soft #DCEFDA`、`--accent #E3A857`、`--accent-soft #FBEBD2`、`--success #3F8F7A`、`--warn #E38A72`。正文字号 ≥ 28rpx，触控高度 ≥ 88rpx，卡片圆角 28rpx。
- 记录类型与字段名必须与现有 `event_add` 一致：`milk/solid/med/poop/sleep/vaccine/illness/weight`。
- 一次最多 30 条；`source` 固定写 `"photo"`；照片保存或离开页面后删除。
- 每个 commit 末尾加：
  ```
  Co-Authored-By: Claude Code <noreply@anthropic.com>
  ```

## Review Focus

- **拍糊/反光/空白页**：OCR 可能返回空或残缺文字。预期是给出「没识别到文字，请拍清楚」的可操作提示和重试入口，而不是白屏或崩溃。测试：`normalizeParsed({}, ...)` 返回空数组；`photoErrorMessage("ocr_empty")` 文案正确。
- **本子上没写时间**：不能静默编造时间。预期显示「12:00（未识别，点此修改）」，并在保存时备注「时间未识别，按12:00记录」。测试：`timeMissing` 与 `buildPayload` 的 note 追加。
- **本子日期与今天不同**：页眉写「8月12日」时必须记到该日期，未来日期不能被接受。测试：日期优先级、未来日期回退。
- **同一页重复行**：OCR/LLM 可能重复输出。预期去重，不重复入库。测试：相同签名只保留一条。
- **OCR 未开通/密钥缺失/云函数超时**：预期显示可操作的中文提示，而不是「操作失败」。测试：`photoErrorMessage` 对每个错误码的映射。

---

### Task 1: 归一化逻辑 `normalize.js`

**Files:**
- Create: `cloudfunctions/photo_parse/normalize.js`
- Test: `tests/photo-import-normalize.test.js`

**Interfaces:**
- Produces:
  - `normalizeParsed(parsed, opts) -> { items: NormalizedItem[], detectedDate: string }`
  - `ocrTextFromResponse(response) -> string`
  - `buildSystemPrompt(todayKey) -> string`
  - `NormalizedItem = { type, dateKey, hasOwnDate, time, timeMissing, note, milkAmount?, feedMethod?, solidItem?, solidPortion?, medName?, medNameLabel?, poopType?, poopColor?, poopAmount?, sleepEvent?, subType?, weightKg? }`

- [ ] **Step 1: Write the failing test**

Create `tests/photo-import-normalize.test.js`:

```js
var assert = require("assert")
var n = require("../cloudfunctions/photo_parse/normalize")

var cases = []
function test(name, fn) { cases.push({ name: name, fn: fn }) }

test("mixed page keeps four records and fills detected date", function () {
  var res = n.normalizeParsed({
    detectedDate: "2026-11-16",
    items: [
      { type: "milk", time: "09:10", milkAmount: 145, note: "9:10 奶粉150" },
      { type: "poop", time: "10:30", poopType: "正常", poopColor: "黄", poopAmount: "正常" },
      { type: "sleep", time: "11:00", sleepEvent: "入睡" },
      { type: "med", time: "12:00", medName: "D3" }
    ]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 4)
  assert.strictEqual(res.items[0].milkAmount, 145)
  assert.strictEqual(res.items[0].dateKey, "2026-11-16")
  assert.strictEqual(res.items[0].hasOwnDate, false)
  assert.strictEqual(res.items[0].timeMissing, false)
  assert.strictEqual(res.items[3].medName, "D3")
  assert.strictEqual(res.items[3].medNameLabel, "D3")
})

test("missing time is marked, not invented", function () {
  var res = n.normalizeParsed({
    items: [{ type: "milk", milkAmount: 130 }]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items[0].time, "")
  assert.strictEqual(res.items[0].timeMissing, true)
})

test("future date falls back to today", function () {
  var res = n.normalizeParsed({
    items: [{ type: "milk", milkAmount: 100, dateKey: "2099-01-01" }]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items[0].dateKey, "2026-11-16")
  assert.strictEqual(res.items[0].hasOwnDate, false)
})

test("own past date is preserved", function () {
  var res = n.normalizeParsed({
    items: [{ type: "milk", milkAmount: 100, dateKey: "2026-11-15" }]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items[0].dateKey, "2026-11-15")
  assert.strictEqual(res.items[0].hasOwnDate, true)
})

test("invalid type is dropped", function () {
  var res = n.normalizeParsed({
    items: [{ type: "dance", milkAmount: 100 }, { type: "milk", milkAmount: 100 }]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 1)
  assert.strictEqual(res.items[0].type, "milk")
})

test("duplicate rows are deduped", function () {
  var res = n.normalizeParsed({
    items: [
      { type: "milk", time: "09:10", milkAmount: 145 },
      { type: "milk", time: "09:10", milkAmount: 145 }
    ]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 1)
})

test("more than 30 items are capped", function () {
  var items = []
  for (var i = 0; i < 35; i++) items.push({ type: "milk", milkAmount: i + 1 })
  var res = n.normalizeParsed({ items: items }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 30)
})

test("numeric strings are coerced and out-of-range values dropped", function () {
  var res = n.normalizeParsed({
    items: [
      { type: "milk", milkAmount: "145ml" },
      { type: "milk", milkAmount: 900 },
      { type: "weight", weightKg: 60 },
      { type: "weight", weightKg: "8.55" }
    ]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 2)
  assert.strictEqual(res.items[0].milkAmount, 145)
  assert.strictEqual(res.items[1].weightKg, 8.6)
})

test("med labels map to keys", function () {
  var res = n.normalizeParsed({
    items: [{ type: "med", medName: "钙" }]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items[0].medName, "CALCIUM")
  assert.strictEqual(res.items[0].medNameLabel, "液体钙")
})

test("solid portion whitelist and invalid poop are handled", function () {
  var res = n.normalizeParsed({
    items: [
      { type: "solid", solidItem: "米糊", solidPortion: "两大碗" },
      { type: "poop", poopType: "正常", poopColor: "紫" },
      { type: "sleep", sleepEvent: "入睡" }
    ]
  }, { todayKey: "2026-11-16" })
  assert.strictEqual(res.items.length, 2)
  assert.strictEqual(res.items[0].solidPortion, "")
  assert.strictEqual(res.items[1].sleepEvent, "入睡")
})

test("ocr text is sorted by position", function () {
  var text = n.ocrTextFromResponse({
    TextDetections: [
      { DetectedText: "B", Polygon: [{ X: 10, Y: 100 }] },
      { DetectedText: "A", Polygon: [{ X: 10, Y: 10 }] }
    ]
  })
  assert.strictEqual(text, "A\nB")
})

test("empty ocr response yields empty string", function () {
  assert.strictEqual(n.ocrTextFromResponse({}), "")
  assert.strictEqual(n.ocrTextFromResponse(null), "")
})

test("system prompt carries today and item cap", function () {
  var p = n.buildSystemPrompt("2026-11-16")
  assert.ok(p.indexOf("2026-11-16") !== -1)
  assert.ok(p.indexOf("最多 30 条") !== -1)
})

var failed = 0
for (var i = 0; i < cases.length; i++) {
  try {
    cases[i].fn()
    console.log("PASS " + cases[i].name)
  } catch (e) {
    failed++
    console.error("FAIL " + cases[i].name)
    console.error(e && e.stack ? e.stack : e)
  }
}
if (failed > 0) {
  console.error(failed + " test(s) failed")
  process.exit(1)
}
console.log("ALL PASS (" + cases.length + ")")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/photo-import-normalize.test.js`
Expected: FAIL with `Cannot find module '../cloudfunctions/photo_parse/normalize'`

- [ ] **Step 3: Write minimal implementation**

Create `cloudfunctions/photo_parse/normalize.js`:

```js
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
  buildSystemPrompt: buildSystemPrompt
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/photo-import-normalize.test.js`
Expected: `ALL PASS` and exit code 0.

- [ ] **Step 5: Syntax check and commit**

```bash
node --check cloudfunctions/photo_parse/normalize.js
git add cloudfunctions/photo_parse/normalize.js tests/photo-import-normalize.test.js
git commit -m "feat: add photo import normalization and tests"
```

---

### Task 2: `photo_parse` 云函数

**Files:**
- Create: `cloudfunctions/photo_parse/index.js`
- Create: `cloudfunctions/photo_parse/package.json`
- Depends on: `cloudfunctions/photo_parse/normalize.js` (Task 1)

**Interfaces:**
- Consumes: `normalize.normalizeParsed`, `normalize.ocrTextFromResponse`, `normalize.buildSystemPrompt`
- Produces cloud function `photo_parse`:
  - Input `{ fileID: string, todayKey: "YYYY-MM-DD" }`
  - Output `{ items: NormalizedItem[], detectedDate: string, rawText: string, error?: "ocr_empty" | "no_items" }`
  - Throws: `missing_fileID`, `missing_todayKey`, `ocr_credentials_missing`, `ocr_service_unavailable`, `ocr_failed`, `llm_failed`

- [ ] **Step 1: Write `package.json`**

Create `cloudfunctions/photo_parse/package.json`:

```json
{
  "name": "photo_parse",
  "version": "1.0.0",
  "description": "Handwritten notebook photo OCR + multi-record parsing",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

- [ ] **Step 2: Write `index.js`**

Create `cloudfunctions/photo_parse/index.js`:

```js
const cloud = require("wx-server-sdk")
const https = require("https")
const crypto = require("crypto")
const normalize = require("./normalize")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function sha256Hex(msg) {
  return crypto.createHash("sha256").update(msg).digest("hex")
}

function hmac(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest()
}

function postTC3(endpoint, action, version, region, service, payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const algorithm = "TC3-HMAC-SHA256"
  const host = endpoint
  const httpRequestMethod = "POST"
  const canonicalUri = "/"
  const canonicalQueryString = ""
  const canonicalHeaders = "content-type:application/json\nhost:" + host + "\n"
  const signedHeaders = "content-type;host"
  const hashedRequestPayload = sha256Hex(payload)
  const canonicalRequest = httpRequestMethod + "\n"
    + canonicalUri + "\n"
    + canonicalQueryString + "\n"
    + canonicalHeaders + "\n"
    + signedHeaders + "\n"
    + hashedRequestPayload

  const credentialScope = date + "/" + service + "/tc3_request"
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = algorithm + "\n"
    + timestamp.toString() + "\n"
    + credentialScope + "\n"
    + hashedCanonicalRequest

  const kDate = hmac("TC3" + secretKey, date)
  const kService = hmac(kDate, service)
  const kSigning = hmac(kService, "tc3_request")
  const signature = hmac(kSigning, stringToSign).toString("hex")

  const authorization = algorithm + " "
    + "Credential=" + secretId + "/" + credentialScope + ", "
    + "SignedHeaders=" + signedHeaders + ", "
    + "Signature=" + signature

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      hostname: host,
      path: "/",
      headers: {
        "Content-Type": "application/json",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Version": version,
        "X-TC-Timestamp": timestamp.toString(),
        "X-TC-Region": region,
        "Authorization": authorization
      }
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { raw += chunk })
      res.on("end", () => {
        let data
        try {
          data = JSON.parse(raw)
        } catch (e) {
          reject(new Error("ocr_failed"))
          return
        }
        const resp = data && data.Response
        if (!resp) {
          reject(new Error("ocr_failed"))
          return
        }
        if (resp.Error) {
          const codeText = String(resp.Error.Code || "") + " " + String(resp.Error.Message || "")
          if (/AuthFailure|Unauthorized|Permission|NotActivated|Unopened|ServiceNot|not activated/i.test(codeText)) {
            reject(new Error("ocr_service_unavailable"))
          } else {
            reject(new Error("ocr_failed"))
          }
          return
        }
        resolve(resp)
      })
    })
    req.on("error", () => reject(new Error("ocr_failed")))
    req.write(payload)
    req.end()
  })
}

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + (u.search || ""),
      headers: Object.assign({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }, headers)
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { raw += chunk })
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error("llm_failed"))
          }
        } else {
          reject(new Error("llm_failed"))
        }
      })
    })
    req.on("error", () => reject(new Error("llm_failed")))
    req.write(data)
    req.end()
  })
}

exports.main = async (event) => {
  const fileID = String(event.fileID || "").trim()
  const todayKey = String(event.todayKey || "").trim()
  if (!fileID) throw new Error("missing_fileID")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) throw new Error("missing_todayKey")

  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) throw new Error("ocr_credentials_missing")

  const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
  const fileInfo = (urlRes.fileList && urlRes.fileList[0]) || {}
  if (fileInfo.status !== 0 || !fileInfo.tempFileURL) throw new Error("ocr_failed")

  const ocrResp = await postTC3(
    "ocr.tencentcloudapi.com",
    "GeneralHandwritingOCR",
    "2018-11-19",
    "ap-guangzhou",
    "ocr",
    JSON.stringify({ ImageUrl: fileInfo.tempFileURL }),
    secretId,
    secretKey
  )

  const rawText = normalize.ocrTextFromResponse(ocrResp)
  if (!rawText) {
    return { items: [], detectedDate: "", rawText: "", error: "ocr_empty" }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("llm_failed")

  const body = {
    model: "deepseek-v4-flash",
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_tokens: 2000,
    messages: [
      { role: "system", content: normalize.buildSystemPrompt(todayKey) },
      { role: "user", content: rawText }
    ]
  }

  let resp
  try {
    resp = await postJson("https://api.deepseek.com/chat/completions", body, {
      Authorization: "Bearer " + apiKey
    })
  } catch (e) {
    throw new Error("llm_failed")
  }

  const content = resp && resp.choices && resp.choices[0]
    && resp.choices[0].message && resp.choices[0].message.content
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error("llm_failed")
  }

  const normalized = normalize.normalizeParsed(parsed, {
    todayKey: todayKey,
    defaultDateKey: todayKey,
    maxItems: 30
  })

  if (!normalized.items.length) {
    return {
      items: [],
      detectedDate: normalized.detectedDate,
      rawText: rawText,
      error: "no_items"
    }
  }

  return {
    items: normalized.items,
    detectedDate: normalized.detectedDate,
    rawText: rawText
  }
}
```

- [ ] **Step 3: Verify syntax and existing tests**

Run:

```bash
node --check cloudfunctions/photo_parse/index.js
node --check cloudfunctions/photo_parse/normalize.js
node tests/photo-import-normalize.test.js
```

Expected: no syntax errors; `ALL PASS (13)` from Task 1 tests.

- [ ] **Step 4: Commit**

```bash
git add cloudfunctions/photo_parse/index.js cloudfunctions/photo_parse/package.json
git commit -m "feat: add photo_parse cloud function"
```

---

### Task 3: `event_add_batch` 云函数

**Files:**
- Create: `cloudfunctions/event_add_batch/validate.js`
- Create: `cloudfunctions/event_add_batch/index.js`
- Create: `cloudfunctions/event_add_batch/package.json`
- Test: `tests/photo-import-event-batch.test.js`

**Interfaces:**
- Produces:
  - `validateEvent(event) -> { ok: true, data: EventData } | { ok: false, reason: string }`
  - Cloud function `event_add_batch` input `{ events: [] }`; output `{ saved: number, ids: string[], failed: [{ index, reason }] }`

- [ ] **Step 1: Write the failing test**

Create `tests/photo-import-event-batch.test.js`:

```js
var assert = require("assert")
var v = require("../cloudfunctions/event_add_batch/validate")

var cases = []
function test(name, fn) { cases.push({ name: name, fn: fn }) }

test("valid milk builds minimal data", function () {
  var res = v.validateEvent({
    type: "milk", dateKey: "2026-11-16", ts: 1000,
    milkAmount: "145", feedMethod: "奶粉", note: "9:10 奶粉150"
  })
  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.data.type, "milk")
  assert.strictEqual(res.data.milkAmount, 145)
  assert.strictEqual(res.data.feedMethod, "奶粉")
  assert.strictEqual(res.data.note, "9:10 奶粉150")
})

test("milk without amount fails", function () {
  var res = v.validateEvent({ type: "milk", dateKey: "2026-11-16", ts: 1000 })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.reason, "milkAmount_required")
})

test("poop without color fails", function () {
  var res = v.validateEvent({
    type: "poop", dateKey: "2026-11-16", ts: 1000,
    poopType: "正常", poopColor: ""
  })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.reason, "poop_required")
})

test("unknown type fails", function () {
  var res = v.validateEvent({ type: "dance", dateKey: "2026-11-16", ts: 1000 })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.reason, "type_not_supported")
})

test("bad date or ts fails", function () {
  assert.strictEqual(v.validateEvent({ type: "milk", dateKey: "", ts: 1000, milkAmount: 100 }).reason, "dateKey_required")
  assert.strictEqual(v.validateEvent({ type: "milk", dateKey: "2026-11-16", milkAmount: 100 }).reason, "ts_required")
})

test("weight above 50kg fails", function () {
  var res = v.validateEvent({ type: "weight", dateKey: "2026-11-16", ts: 1000, weightKg: 60 })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.reason, "weight_required")
})

test("med gets a label", function () {
  var res = v.validateEvent({ type: "med", dateKey: "2026-11-16", ts: 1000, medName: "CALCIUM" })
  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.data.medNameLabel, "液体钙")
})

test("vaccine defaults subType when missing", function () {
  var res = v.validateEvent({ type: "vaccine", dateKey: "2026-11-16", ts: 1000 })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.reason, "vaccine_required")

  var okRes = v.validateEvent({ type: "vaccine", dateKey: "2026-11-16", ts: 1000, subType: "百白破" })
  assert.strictEqual(okRes.ok, true)
  assert.strictEqual(okRes.data.subType, "百白破")
})

var failed = 0
for (var i = 0; i < cases.length; i++) {
  try {
    cases[i].fn()
    console.log("PASS " + cases[i].name)
  } catch (e) {
    failed++
    console.error("FAIL " + cases[i].name)
    console.error(e && e.stack ? e.stack : e)
  }
}
if (failed > 0) {
  console.error(failed + " test(s) failed")
  process.exit(1)
}
console.log("ALL PASS (" + cases.length + ")")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/photo-import-event-batch.test.js`
Expected: FAIL with `Cannot find module '../cloudfunctions/event_add_batch/validate'`

- [ ] **Step 3: Write `validate.js`**

Create `cloudfunctions/event_add_batch/validate.js`:

```js
var MED_LABELS = { AD: "AD", D3: "D3", DHA: "DHA", CALCIUM: "液体钙" }
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function trimStr(v) {
  return String(v === null || v === undefined ? "" : v).trim()
}

function validateEvent(event) {
  if (!event || typeof event !== "object") {
    return { ok: false, reason: "bad_event" }
  }

  var type = trimStr(event.type)
  var dateKey = trimStr(event.dateKey)
  var ts = typeof event.ts === "number" ? event.ts : NaN

  if (!type) return { ok: false, reason: "type_required" }
  if (!DATE_RE.test(dateKey)) return { ok: false, reason: "dateKey_required" }
  if (!isFinite(ts)) return { ok: false, reason: "ts_required" }

  var data = {
    type: type,
    dateKey: dateKey,
    ts: ts,
    note: trimStr(event.note)
  }

  if (type === "milk") {
    var amount = parseInt(event.milkAmount, 10)
    if (!isFinite(amount) || amount <= 0) return { ok: false, reason: "milkAmount_required" }
    data.milkAmount = amount
    data.feedMethod = trimStr(event.feedMethod)
  } else if (type === "solid") {
    var solidItem = trimStr(event.solidItem)
    if (!solidItem) return { ok: false, reason: "solidItem_required" }
    data.solidItem = solidItem
    data.solidPortion = trimStr(event.solidPortion)
  } else if (type === "med") {
    var medName = trimStr(event.medName)
    if (!medName) return { ok: false, reason: "medName_required" }
    data.medName = medName
    data.medNameLabel = MED_LABELS[medName] || medName
  } else if (type === "poop") {
    var poopType = trimStr(event.poopType)
    var poopColor = trimStr(event.poopColor)
    if (!poopType || !poopColor) return { ok: false, reason: "poop_required" }
    data.poopType = poopType
    data.poopColor = poopColor
    data.poopAmount = trimStr(event.poopAmount)
  } else if (type === "sleep") {
    var sleepEvent = trimStr(event.sleepEvent)
    if (!sleepEvent) return { ok: false, reason: "sleepEvent_required" }
    data.sleepEvent = sleepEvent
  } else if (type === "vaccine") {
    var subType = trimStr(event.subType)
    var imageUrl = trimStr(event.imageUrl)
    if (!subType && !imageUrl) return { ok: false, reason: "vaccine_required" }
    data.subType = subType
    data.imageUrl = imageUrl
  } else if (type === "illness") {
    var illnessType = trimStr(event.subType)
    if (!illnessType) return { ok: false, reason: "illness_required" }
    data.subType = illnessType
  } else if (type === "weight") {
    var kg = parseFloat(event.weightKg)
    if (!isFinite(kg) || kg <= 0 || kg >= 50) return { ok: false, reason: "weight_required" }
    data.weightKg = kg
  } else {
    return { ok: false, reason: "type_not_supported" }
  }

  return { ok: true, data: data }
}

module.exports = {
  validateEvent: validateEvent,
  MED_LABELS: MED_LABELS
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/photo-import-event-batch.test.js`
Expected: `ALL PASS (8)`.

- [ ] **Step 5: Write `index.js` and `package.json`**

Create `cloudfunctions/event_add_batch/package.json`:

```json
{
  "name": "event_add_batch",
  "version": "1.0.0",
  "description": "Batch insert events from photo import",
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

Create `cloudfunctions/event_add_batch/index.js`:

```js
const cloud = require("wx-server-sdk")
const validate = require("./validate")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function requireFamilyId() {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error("login_required")
  const member = await db.collection("family_members").where({ openid: OPENID }).limit(1).get()
  if ((member.data || []).length === 0) throw new Error("family_required")
  return member.data[0].familyId
}

exports.main = async (event) => {
  const events = event.events
  if (!Array.isArray(events) || events.length === 0) throw new Error("bad_request")
  if (events.length > 30) throw new Error("too_many_events")

  const familyId = await requireFamilyId()
  const ids = []
  const failed = []

  for (let i = 0; i < events.length; i++) {
    const result = validate.validateEvent(events[i])
    if (!result.ok) {
      failed.push({ index: i, reason: result.reason })
      continue
    }
    const data = Object.assign({}, result.data, {
      familyId: familyId,
      source: "photo",
      createdAt: db.serverDate()
    })
    try {
      const res = await db.collection("events").add({ data: data })
      ids.push(res._id)
    } catch (e) {
      failed.push({ index: i, reason: "db_error" })
    }
  }

  return { saved: ids.length, ids: ids, failed: failed }
}
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
node --check cloudfunctions/event_add_batch/index.js
node --check cloudfunctions/event_add_batch/validate.js
node tests/photo-import-event-batch.test.js
```

Expected: no syntax errors; `ALL PASS (8)`.

```bash
git add cloudfunctions/event_add_batch/validate.js cloudfunctions/event_add_batch/index.js cloudfunctions/event_add_batch/package.json tests/photo-import-event-batch.test.js
git commit -m "feat: add batch event insert cloud function"
```

---

### Task 4: 拍照页纯逻辑 `helpers.js`

**Files:**
- Create: `miniprogram/pages/photo-import/helpers.js`
- Test: `tests/photo-import-helpers.test.js`

**Interfaces:**
- Consumes: `miniprogram/utils/date.js` (`monthDayCN`, `dateKeyToTs`)
- Produces:
  - `buildDisplayItems(items, defaultDateKey) -> DisplayItem[]`
  - `buildPayload(displayItem) -> event payload`
  - `checkClass(checked) -> string`
  - `applyDefaultDate(displayItem, dateKey) -> DisplayItem`
  - `countChecked(items) -> number`
  - `dateLabel(dateKey, todayKey) -> string`
  - `photoErrorMessage(text) -> string`
  - `DisplayItem = { index, type, icon, desc, dateKey, hasOwnDate, time, timePickerValue, timeLabel, timeMissing, timeClass, dateLabel, showDate, checked, checkClass, checkMark, cardClass, raw }`

- [ ] **Step 1: Write the failing test**

Create `tests/photo-import-helpers.test.js`:

```js
var assert = require("assert")
var h = require("../miniprogram/pages/photo-import/helpers")
var dateUtils = require("../miniprogram/utils/date")

var cases = []
function test(name, fn) { cases.push({ name: name, fn: fn }) }

test("milk description uses amount", function () {
  var items = h.buildDisplayItems([
    { type: "milk", milkAmount: 145, feedMethod: "奶粉", dateKey: "2026-11-16", hasOwnDate: false, time: "09:10", timeMissing: false }
  ], "2026-11-16")
  assert.strictEqual(items[0].desc, "奶粉 145ml")
  assert.strictEqual(items[0].timeLabel, "09:10")
  assert.strictEqual(items[0].showDate, false)
  assert.strictEqual(items[0].checked, true)
  assert.strictEqual(items[0].checkMark, "✓")
})

test("missing time shows warning label and class", function () {
  var items = h.buildDisplayItems([
    { type: "milk", milkAmount: 130, dateKey: "2026-11-16", hasOwnDate: false, time: "", timeMissing: true }
  ], "2026-11-16")
  assert.strictEqual(items[0].time, "12:00")
  assert.strictEqual(items[0].timeLabel, "12:00（未识别，点此修改）")
  assert.strictEqual(items[0].timeClass, "pi-time pi-time-warn")
})

test("own date different from default is shown", function () {
  var items = h.buildDisplayItems([
    { type: "poop", poopType: "正常", poopColor: "黄", poopAmount: "", dateKey: "2026-11-15", hasOwnDate: true, time: "10:30", timeMissing: false }
  ], "2026-11-16")
  assert.strictEqual(items[0].showDate, true)
  assert.strictEqual(items[0].dateLabel, "11月15日")
})

test("poop description includes type color amount", function () {
  var items = h.buildDisplayItems([
    { type: "poop", poopType: "正常", poopColor: "黄", poopAmount: "多", dateKey: "2026-11-16", hasOwnDate: false, time: "10:30", timeMissing: false }
  ], "2026-11-16")
  assert.strictEqual(items[0].desc, "便便 正常 · 黄 · 多")
})

test("build payload appends missing-time note and computes ts", function () {
  var items = h.buildDisplayItems([
    { type: "milk", milkAmount: 130, feedMethod: "", note: "9:10 奶130", dateKey: "2026-11-16", hasOwnDate: false, time: "", timeMissing: true }
  ], "2026-11-16")
  var payload = h.buildPayload(items[0])
  assert.strictEqual(payload.type, "milk")
  assert.strictEqual(payload.milkAmount, 130)
  assert.strictEqual(payload.ts, dateUtils.dateKeyToTs("2026-11-16", "12:00"))
  assert.strictEqual(payload.note, "9:10 奶130；时间未识别，按12:00记录")
})

test("applyDefaultDate only touches items without own date", function () {
  var own = { hasOwnDate: true, dateKey: "2026-11-15", dateLabel: "11月15日", showDate: true }
  var free = { hasOwnDate: false, dateKey: "2026-11-16", dateLabel: "11月16日", showDate: false }
  var ownAfter = h.applyDefaultDate(own, "2026-11-10")
  var freeAfter = h.applyDefaultDate(free, "2026-11-10")
  assert.strictEqual(ownAfter.dateKey, "2026-11-15")
  assert.strictEqual(ownAfter.showDate, true)
  assert.strictEqual(freeAfter.dateKey, "2026-11-10")
  assert.strictEqual(freeAfter.dateLabel, "11月10日")
})

test("count checked and check class", function () {
  assert.strictEqual(h.countChecked([{ checked: true }, { checked: false }]), 1)
  assert.strictEqual(h.checkClass(true), "pi-check pi-check-on")
  assert.strictEqual(h.checkClass(false), "pi-check")
})

test("error text maps to actionable Chinese copy", function () {
  assert.ok(h.photoErrorMessage("ocr_empty").indexOf("没识别到文字") !== -1)
  assert.ok(h.photoErrorMessage("ocr_service_unavailable").indexOf("开通 OCR") !== -1)
  assert.ok(h.photoErrorMessage("ocr_credentials_missing").indexOf("腾讯云密钥") !== -1)
  assert.ok(h.photoErrorMessage("llm_failed").indexOf("整理失败") !== -1)
  assert.ok(h.photoErrorMessage("too_many_events").indexOf("30 条") !== -1)
  assert.ok(h.photoErrorMessage("family_required").indexOf("家庭") !== -1)
  assert.strictEqual(h.photoErrorMessage("something_else"), "操作失败，请重试")
})

test("date label uses 今天 for today", function () {
  assert.strictEqual(h.dateLabel("2026-11-16", "2026-11-16"), "今天")
  assert.strictEqual(h.dateLabel("2026-11-15", "2026-11-16"), "11月15日")
})

var failed = 0
for (var i = 0; i < cases.length; i++) {
  try {
    cases[i].fn()
    console.log("PASS " + cases[i].name)
  } catch (e) {
    failed++
    console.error("FAIL " + cases[i].name)
    console.error(e && e.stack ? e.stack : e)
  }
}
if (failed > 0) {
  console.error(failed + " test(s) failed")
  process.exit(1)
}
console.log("ALL PASS (" + cases.length + ")")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/photo-import-helpers.test.js`
Expected: FAIL with `Cannot find module '../miniprogram/pages/photo-import/helpers'`

- [ ] **Step 3: Write `helpers.js`**

Create `miniprogram/pages/photo-import/helpers.js`:

```js
var dateUtils = require("../../utils/date")
var monthDayCN = dateUtils.monthDayCN
var dateKeyToTs = dateUtils.dateKeyToTs

function iconFor(type) {
  if (type === "milk") return "🍼"
  if (type === "solid") return "🥣"
  if (type === "med") return "💊"
  if (type === "poop") return "💩"
  if (type === "sleep") return "😴"
  if (type === "vaccine") return "💉"
  if (type === "illness") return "🤒"
  if (type === "weight") return "⚖️"
  return "📝"
}

function describeItem(item) {
  if (item.type === "milk") {
    var fm = item.feedMethod || "奶粉"
    return fm + " " + item.milkAmount + "ml"
  }
  if (item.type === "solid") {
    var p = item.solidPortion ? "（" + item.solidPortion + "）" : ""
    return "辅食 " + item.solidItem + p
  }
  if (item.type === "med") {
    return "用药 " + (item.medNameLabel || item.medName || "")
  }
  if (item.type === "poop") {
    var amt = item.poopAmount ? " · " + item.poopAmount : ""
    return "便便 " + item.poopType + " · " + item.poopColor + amt
  }
  if (item.type === "sleep") return "睡眠 " + item.sleepEvent
  if (item.type === "vaccine") return "疫苗 " + (item.subType || "疫苗")
  if (item.type === "illness") return "生病 " + (item.subType || "不适")
  if (item.type === "weight") return "体重 " + (item.weightKg || 0) + "kg"
  return "记录"
}

function checkClass(checked) {
  return checked ? "pi-check pi-check-on" : "pi-check"
}

function dateLabel(dateKey, todayKey) {
  return dateKey === todayKey ? "今天" : monthDayCN(dateKey)
}

function buildDisplayItems(items, defaultDateKey) {
  var out = []
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    var time = item.time || "12:00"
    var timeMissing = !!item.timeMissing
    out.push({
      index: i,
      type: item.type,
      icon: iconFor(item.type),
      desc: describeItem(item),
      dateKey: item.dateKey,
      hasOwnDate: !!item.hasOwnDate,
      time: time,
      timePickerValue: time,
      timeLabel: timeMissing ? "12:00（未识别，点此修改）" : time,
      timeMissing: timeMissing,
      timeClass: timeMissing ? "pi-time pi-time-warn" : "pi-time",
      dateLabel: monthDayCN(item.dateKey),
      showDate: !!item.hasOwnDate && item.dateKey !== defaultDateKey,
      checked: true,
      checkClass: "pi-check pi-check-on",
      checkMark: "✓",
      cardClass: "pi-item",
      raw: item
    })
  }
  return out
}

function applyDefaultDate(item, dateKey) {
  if (!item.hasOwnDate) {
    item.dateKey = dateKey
    item.dateLabel = monthDayCN(dateKey)
  }
  item.showDate = !!item.hasOwnDate && item.dateKey !== dateKey
  return item
}

function countChecked(items) {
  var n = 0
  for (var i = 0; i < items.length; i++) {
    if (items[i].checked) n++
  }
  return n
}

function buildPayload(item) {
  var raw = item.raw || {}
  var note = String(raw.note || "").trim()
  if (item.timeMissing) {
    note = note ? note + "；时间未识别，按12:00记录" : "时间未识别，按12:00记录"
  }

  var payload = {
    type: raw.type,
    dateKey: item.dateKey,
    ts: dateKeyToTs(item.dateKey, item.time),
    note: note
  }

  if (raw.type === "milk") {
    payload.milkAmount = raw.milkAmount
    payload.feedMethod = raw.feedMethod || ""
  } else if (raw.type === "solid") {
    payload.solidItem = raw.solidItem
    payload.solidPortion = raw.solidPortion || ""
  } else if (raw.type === "med") {
    payload.medName = raw.medName
  } else if (raw.type === "poop") {
    payload.poopType = raw.poopType
    payload.poopColor = raw.poopColor
    payload.poopAmount = raw.poopAmount || ""
  } else if (raw.type === "sleep") {
    payload.sleepEvent = raw.sleepEvent
  } else if (raw.type === "vaccine") {
    payload.subType = raw.subType || "疫苗"
  } else if (raw.type === "illness") {
    payload.subType = raw.subType
  } else if (raw.type === "weight") {
    payload.weightKg = raw.weightKg
  }

  return payload
}

function photoErrorMessage(text) {
  text = String(text || "")
  if (text.indexOf("ocr_credentials_missing") !== -1) {
    return "文字识别服务未配置，请联系管理员检查腾讯云密钥"
  }
  if (text.indexOf("ocr_service_unavailable") !== -1) {
    return "文字识别服务未开通，请在腾讯云控制台开通 OCR"
  }
  if (text.indexOf("ocr_empty") !== -1) {
    return "没识别到文字，请把本子拍清楚、避开反光和阴影"
  }
  if (text.indexOf("no_items") !== -1) {
    return "识别到文字，但没拆出可保存的记录。可查看原文后重新拍照"
  }
  if (text.indexOf("too_many_events") !== -1) {
    return "一次最多保存 30 条记录"
  }
  if (text.indexOf("ocr_failed") !== -1) {
    return "识别失败，请重试或换一张照片"
  }
  if (text.indexOf("llm_failed") !== -1) {
    return "记录整理失败，请重试"
  }
  if (text.indexOf("family_required") !== -1) {
    return "请先在「我的」页面创建或加入家庭"
  }
  if (text.indexOf("login_required") !== -1) {
    return "登录态失效，请退出后重新登录再试"
  }
  return "操作失败，请重试"
}

module.exports = {
  iconFor: iconFor,
  describeItem: describeItem,
  checkClass: checkClass,
  dateLabel: dateLabel,
  buildDisplayItems: buildDisplayItems,
  applyDefaultDate: applyDefaultDate,
  countChecked: countChecked,
  buildPayload: buildPayload,
  photoErrorMessage: photoErrorMessage
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/photo-import-helpers.test.js`
Expected: `ALL PASS (9)`.

- [ ] **Step 5: Commit**

```bash
node --check miniprogram/pages/photo-import/helpers.js
git add miniprogram/pages/photo-import/helpers.js tests/photo-import-helpers.test.js
git commit -m "feat: add photo import display helpers"
```

---

### Task 5: API 封装、页面注册与拍照导入页

**Files:**
- Modify: `miniprogram/services/api.js`
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/photo-import/index.json`
- Create: `miniprogram/pages/photo-import/index.js`
- Create: `miniprogram/pages/photo-import/index.wxml`
- Create: `miniprogram/pages/photo-import/index.wxss`

**Interfaces:**
- Consumes: `helpers.buildDisplayItems`, `helpers.applyDefaultDate`, `helpers.buildPayload`, `helpers.countChecked`, `helpers.checkClass`, `helpers.dateLabel`, `helpers.photoErrorMessage`
- Produces: `api.photoParse(fileID, todayKey)`, `api.addEventsBatch(events)`, page `pages/photo-import/index`

- [ ] **Step 1: Add API methods**

In `miniprogram/services/api.js`, add these two methods to `module.exports` (after `nlpParse`):

```js
  nlpParse: function (text) { return call("nlp_parse", { text: text }) },
  photoParse: function (fileID, todayKey) {
    return call("photo_parse", { fileID: fileID, todayKey: todayKey })
  },
  addEventsBatch: function (events) {
    return ensureFamily().then(function () {
      return call("event_add_batch", { events: events })
    })
  }
}
```

- [ ] **Step 2: Register page**

In `miniprogram/app.json`, add `"pages/photo-import/index"` to the `pages` array after `"pages/voice/index"`:

```json
  "pages": [
    "pages/today/index",
    "pages/stats/index",
    "pages/records/index",
    "pages/me/index",
    "pages/entry-milk/index",
    "pages/entry-solid/index",
    "pages/entry-med/index",
    "pages/entry-poop/index",
    "pages/entry-vaccine/index",
    "pages/entry-illness/index",
    "pages/entry-sleep/index",
    "pages/voice/index",
    "pages/photo-import/index"
  ],
```

- [ ] **Step 3: Create page config**

Create `miniprogram/pages/photo-import/index.json`:

```json
{"usingComponents":{},"navigationBarTitleText":"拍照导入"}
```

- [ ] **Step 4: Create page JS**

Create `miniprogram/pages/photo-import/index.js`:

```js
var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var helpers = require("./helpers")

var todayKey = dateUtils.todayKey

function copyItem(item) {
  var out = {}
  for (var k in item) out[k] = item[k]
  return out
}

function photoErrorMessage(err) {
  return helpers.photoErrorMessage(api.errorText(err))
}

Page({
  data: {
    imagePath: "",
    fileID: "",
    stage: "idle",
    stageText: "",
    items: [],
    checkedCount: 0,
    saveButtonText: "保存记录",
    saveDisabled: true,
    detectedDate: "",
    defaultDateKey: todayKey(),
    defaultDateLabel: "今天",
    todayKey: todayKey(),
    rawText: "",
    showRaw: false,
    rawToggleText: "查看识别原文",
    saving: false,
    errorText: "",
    showCapture: true,
    showPreview: false,
    showResult: false,
    showError: false,
    showRetry: false
  },

  onLoad: function () {
    this._fileDeleted = false
    this._saving = false
  },

  onUnload: function () {
    this.cleanupPhoto()
  },

  choosePhoto: function () {
    var that = this
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success: function (res) {
        var path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        that.cleanupPhoto()
        that._fileDeleted = false
        that.setData({
          imagePath: path,
          fileID: "",
          stage: "uploading",
          stageText: "正在上传照片…",
          items: [],
          checkedCount: 0,
          saveButtonText: "保存记录",
          saveDisabled: true,
          detectedDate: "",
          defaultDateKey: that.data.todayKey,
          defaultDateLabel: "今天",
          rawText: "",
          showRaw: false,
          rawToggleText: "查看识别原文",
          errorText: "",
          showCapture: false,
          showPreview: true,
          showResult: false,
          showError: false,
          showRetry: false
        })
        that.uploadPhoto(path)
      },
      fail: function () {}
    })
  },

  uploadPhoto: function (path) {
    var that = this
    var cloudPath = "photo-import/" + Date.now() + ".jpg"
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: path,
      success: function (res) {
        that._fileDeleted = false
        that.setData({ fileID: res.fileID })
        that.parsePhoto(res.fileID)
      },
      fail: function () {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "照片上传失败，请重试",
          showError: true,
          showRetry: false
        })
      }
    })
  },

  parsePhoto: function (fileID) {
    var that = this
    this.setData({
      stage: "parsing",
      stageText: "正在识别手写内容…",
      errorText: "",
      showError: false,
      showResult: false,
      showRetry: false
    })
    wx.showLoading({ title: "识别中", mask: true })

    api.photoParse(fileID, this.data.todayKey).then(function (res) {
      wx.hideLoading()
      if (!res) throw new Error("empty_response")
      if (res.error === "ocr_empty") {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "没识别到文字，请把本子拍清楚、避开反光和阴影",
          rawText: res.rawText || "",
          showError: true,
          showRetry: true
        })
        return
      }
      if (res.error === "no_items") {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "识别到文字，但没拆出可保存的记录。可查看原文后重新拍照",
          rawText: res.rawText || "",
          showRaw: true,
          rawToggleText: "收起识别原文",
          showError: true,
          showRetry: true
        })
        return
      }
      that.applyParsed(res)
    }).catch(function (err) {
      wx.hideLoading()
      that.setData({
        stage: "error",
        stageText: "",
        errorText: photoErrorMessage(err),
        showError: true,
        showRetry: !!fileID
      })
    })
  },

  retryParse: function () {
    if (!this.data.fileID) {
      this.choosePhoto()
      return
    }
    this.parsePhoto(this.data.fileID)
  },

  applyParsed: function (res) {
    var defaultDateKey = this.data.todayKey
    if (res.detectedDate) defaultDateKey = res.detectedDate

    var items = helpers.buildDisplayItems(res.items || [], defaultDateKey)
    var count = helpers.countChecked(items)
    var saveText = count > 0 ? "保存 " + count + " 条记录" : "保存记录"

    this.setData({
      stage: "done",
      stageText: "",
      items: items,
      checkedCount: count,
      saveButtonText: saveText,
      saveDisabled: count === 0,
      detectedDate: res.detectedDate || "",
      defaultDateKey: defaultDateKey,
      defaultDateLabel: helpers.dateLabel(defaultDateKey, this.data.todayKey),
      rawText: res.rawText || "",
      showRaw: false,
      rawToggleText: "查看识别原文",
      errorText: "",
      showCapture: false,
      showPreview: true,
      showResult: true,
      showError: false,
      showRetry: false
    })
  },

  onTimeChange: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var time = e.detail.value
    var items = this.data.items.slice()
    if (isNaN(index) || !items[index]) return
    var item = copyItem(items[index])
    item.time = time
    item.timePickerValue = time
    item.timeLabel = time
    item.timeMissing = false
    item.timeClass = "pi-time"
    items[index] = item
    this.setData({ items: items })
  },

  onDefaultDateChange: function (e) {
    var dateKey = e.detail.value
    var items = this.data.items.slice()
    for (var i = 0; i < items.length; i++) {
      items[i] = helpers.applyDefaultDate(copyItem(items[i]), dateKey)
    }
    this.setData({
      defaultDateKey: dateKey,
      defaultDateLabel: helpers.dateLabel(dateKey, this.data.todayKey),
      items: items
    })
  },

  toggleItem: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var items = this.data.items.slice()
    if (isNaN(index) || !items[index]) return
    var item = copyItem(items[index])
    item.checked = !item.checked
    item.checkClass = helpers.checkClass(item.checked)
    item.checkMark = item.checked ? "✓" : ""
    item.cardClass = item.checked ? "pi-item" : "pi-item pi-item-off"
    items[index] = item

    var count = helpers.countChecked(items)
    this.setData({
      items: items,
      checkedCount: count,
      saveButtonText: count > 0 ? "保存 " + count + " 条记录" : "保存记录",
      saveDisabled: count === 0
    })
  },

  toggleRaw: function () {
    var show = !this.data.showRaw
    this.setData({
      showRaw: show,
      rawToggleText: show ? "收起识别原文" : "查看识别原文"
    })
  },

  retake: function () {
    this.cleanupPhoto()
    this.setData({
      imagePath: "",
      fileID: "",
      stage: "idle",
      stageText: "",
      items: [],
      checkedCount: 0,
      saveButtonText: "保存记录",
      saveDisabled: true,
      detectedDate: "",
      defaultDateKey: this.data.todayKey,
      defaultDateLabel: "今天",
      rawText: "",
      showRaw: false,
      rawToggleText: "查看识别原文",
      saving: false,
      errorText: "",
      showCapture: true,
      showPreview: false,
      showResult: false,
      showError: false,
      showRetry: false
    })
    this.choosePhoto()
  },

  save: function () {
    if (this.data.saving) return

    var selected = []
    for (var i = 0; i < this.data.items.length; i++) {
      if (this.data.items[i].checked) selected.push(this.data.items[i])
    }
    if (!selected.length) {
      wx.showToast({ title: "请至少选择一条", icon: "none" })
      return
    }

    var payloads = []
    for (var j = 0; j < selected.length; j++) {
      payloads.push(helpers.buildPayload(selected[j]))
    }

    var that = this
    this.setData({ saving: true, saveButtonText: "保存中…" })

    api.addEventsBatch(payloads).then(function (res) {
      var saved = (res && res.saved) || 0
      var failed = res && res.failed ? res.failed.length : 0
      if (saved === 0) {
        that.setData({
          saving: false,
          saveButtonText: "保存 " + selected.length + " 条记录"
        })
        wx.showToast({ title: "保存失败，请重试", icon: "none" })
        return
      }
      if (failed > 0) {
        wx.showToast({ title: "已保存 " + saved + " 条，" + failed + " 条未保存", icon: "none" })
      } else {
        wx.showToast({ title: "已保存 " + saved + " 条", icon: "success" })
      }
      that.cleanupPhoto()
      setTimeout(function () {
        wx.navigateBack()
      }, 600)
    }).catch(function (err) {
      that.setData({
        saving: false,
        saveButtonText: "保存 " + selected.length + " 条记录"
      })
      wx.showToast({ title: photoErrorMessage(err), icon: "none" })
    })
  },

  cleanupPhoto: function () {
    var fileID = this.data.fileID
    if (!fileID || this._fileDeleted) return
    this._fileDeleted = true
    wx.cloud.deleteFile({
      fileList: [fileID],
      fail: function () {}
    })
  }
})
```

- [ ] **Step 5: Create page WXML**

Create `miniprogram/pages/photo-import/index.wxml`:

```html
<view class="container">

  <!-- Capture / preview card -->
  <view class="card pi-photo-card">
    <view wx:if="{{showCapture}}" class="pi-capture" bindtap="choosePhoto">
      <view class="pi-capture-icon">📷</view>
      <view class="pi-capture-title">拍照识别记录本</view>
      <view class="pi-capture-hint">把本子平铺，光线均匀，尽量拍全一页</view>
      <button class="btn btn-primary pi-capture-btn" catchtap="choosePhoto">拍照 / 从相册选择</button>
    </view>

    <block wx:if="{{showPreview}}">
      <image class="pi-preview" src="{{imagePath}}" mode="widthFix"></image>
      <view wx:if="{{stageText}}" class="pi-stage">{{stageText}}</view>
      <view class="pi-photo-actions">
        <button class="btn pi-btn-secondary" bindtap="retake">重新拍照</button>
        <button wx:if="{{showRetry}}" class="btn pi-btn-secondary" bindtap="retryParse">重试识别</button>
      </view>
    </block>
  </view>

  <!-- Error -->
  <view wx:if="{{showError}}" class="card pi-error-card">
    <view class="pi-error-icon">😕</view>
    <view class="pi-error-text">{{errorText}}</view>
  </view>

  <!-- Result -->
  <view wx:if="{{showResult}}">
    <view class="pi-result-head">
      <view class="pi-result-title">识别到 {{items.length}} 条记录</view>
      <view class="pi-result-hint">核对一下，取消勾选的不会保存</view>
    </view>

    <view class="card pi-date-card">
      <view class="pi-date-label">记录日期</view>
      <picker mode="date" value="{{defaultDateKey}}" end="{{todayKey}}" bindchange="onDefaultDateChange">
        <view class="pi-date-value">{{defaultDateLabel}} ›</view>
      </picker>
      <view class="pi-date-hint">本子上写了日期的记录会优先使用自己的日期</view>
    </view>

    <view class="pi-list">
      <view wx:for="{{items}}" wx:key="index" class="{{item.cardClass}}">
        <view class="pi-check-hit" data-index="{{index}}" bindtap="toggleItem">
          <view class="{{item.checkClass}}">{{item.checkMark}}</view>
        </view>
        <view class="pi-item-body">
          <view class="pi-item-desc">{{item.icon}} {{item.desc}}</view>
          <view class="pi-item-meta">
            <text wx:if="{{item.showDate}}" class="pi-item-date">{{item.dateLabel}}</text>
            <picker mode="time" value="{{item.timePickerValue}}" data-index="{{index}}" bindchange="onTimeChange">
              <text class="{{item.timeClass}}">{{item.timeLabel}}</text>
            </picker>
          </view>
        </view>
      </view>
    </view>

    <view wx:if="{{rawText}}" class="pi-raw">
      <view class="pi-raw-toggle" bindtap="toggleRaw">{{rawToggleText}}</view>
      <view wx:if="{{showRaw}}" class="pi-raw-text">{{rawText}}</view>
    </view>

    <button class="btn btn-primary pi-save-btn" bindtap="save" disabled="{{saveDisabled}}">{{saveButtonText}}</button>
    <view class="pi-bottom-space"></view>
  </view>

</view>
```

- [ ] **Step 6: Create page WXSS**

Create `miniprogram/pages/photo-import/index.wxss`:

```css
.container {
  padding: 16rpx 24rpx 32rpx;
}

.pi-photo-card {
  margin-bottom: 24rpx;
}

.pi-capture {
  text-align: center;
  padding: 36rpx 16rpx;
  border: 3rpx dashed #D3E6CB;
  border-radius: 28rpx;
  background: #F9FCF7;
}

.pi-capture-icon {
  font-size: 72rpx;
  line-height: 1;
  margin-bottom: 16rpx;
}

.pi-capture-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #33422E;
  margin-bottom: 10rpx;
}

.pi-capture-hint {
  font-size: 26rpx;
  color: #7E9078;
  margin-bottom: 28rpx;
}

.pi-capture-btn {
  width: 100%;
}

.pi-preview {
  width: 100%;
  border-radius: 28rpx;
  margin-bottom: 20rpx;
}

.pi-stage {
  font-size: 28rpx;
  color: #4F9668;
  text-align: center;
  padding: 8rpx 0 20rpx;
  font-weight: 700;
}

.pi-photo-actions {
  display: flex;
  gap: 16rpx;
}

.pi-btn-secondary {
  flex: 1;
  background: #ffffff;
  border: 2rpx solid #4F9668;
  color: #2C6B40;
  padding: 20rpx 16rpx;
  font-size: 30rpx;
}

.pi-result-head {
  padding: 8rpx 8rpx 16rpx;
}

.pi-result-title {
  font-size: 36rpx;
  font-weight: 800;
  color: #33422E;
}

.pi-result-hint {
  font-size: 26rpx;
  color: #7E9078;
  margin-top: 6rpx;
}

.pi-date-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 20rpx;
  padding: 24rpx 28rpx;
}

.pi-date-label {
  font-size: 30rpx;
  font-weight: 700;
  color: #33422E;
}

.pi-date-value {
  font-size: 30rpx;
  color: #4F9668;
  font-weight: 800;
  padding: 8rpx 12rpx;
  border-radius: 12rpx;
  background: #DCEFDA;
}

.pi-date-hint {
  width: 100%;
  font-size: 24rpx;
  color: #7E9078;
  margin-top: 10rpx;
}

.pi-list {
  margin-bottom: 8rpx;
}

.pi-item {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  background: #ffffff;
  border-radius: 28rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 6rpx 18rpx rgba(51, 66, 46, 0.08);
}

.pi-item-off {
  opacity: 0.55;
}

.pi-check-hit {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: -16rpx 0 -16rpx -8rpx;
}

.pi-check {
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  border: 3rpx solid #D3E6CB;
  background: #ffffff;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.pi-check-on {
  background: #4F9668;
  border-color: #4F9668;
}

.pi-item-body {
  flex: 1;
  min-width: 0;
}

.pi-item-desc {
  font-size: 32rpx;
  font-weight: 800;
  color: #33422E;
  line-height: 1.4;
}

.pi-item-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 8rpx;
  flex-wrap: wrap;
}

.pi-item-date {
  font-size: 26rpx;
  color: #7E9078;
}

.pi-time {
  font-size: 28rpx;
  font-weight: 700;
  color: #4F9668;
  padding: 6rpx 14rpx;
  background: #DCEFDA;
  border-radius: 10rpx;
}

.pi-time-warn {
  color: #8A5A16;
  background: #FBEBD2;
}

.pi-raw {
  background: #ffffff;
  border-radius: 28rpx;
  padding: 20rpx 24rpx;
  margin: 12rpx 0 24rpx;
}

.pi-raw-toggle {
  font-size: 28rpx;
  color: #7E9078;
  font-weight: 700;
  text-align: center;
}

.pi-raw-text {
  margin-top: 16rpx;
  font-size: 26rpx;
  color: #33422E;
  white-space: pre-wrap;
  word-break: break-all;
  background: #F5FAF3;
  border-radius: 16rpx;
  padding: 16rpx;
  max-height: 480rpx;
  overflow-y: auto;
}

.pi-save-btn {
  width: 100%;
  margin-top: 12rpx;
}

.pi-error-card {
  text-align: center;
  padding: 36rpx 28rpx;
}

.pi-error-icon {
  font-size: 56rpx;
  margin-bottom: 12rpx;
}

.pi-error-text {
  font-size: 30rpx;
  color: #7E9078;
  line-height: 1.6;
}

.pi-bottom-space {
  height: 40rpx;
}
```

- [ ] **Step 7: Verify page code**

Run:

```bash
node --check miniprogram/pages/photo-import/index.js
node --check miniprogram/pages/photo-import/helpers.js
node --check miniprogram/services/api.js
node tests/photo-import-helpers.test.js
```

Expected: no syntax errors; `ALL PASS (9)`.

Also run the banned-pattern scan:

```bash
grep -nE '\{\{[^}]*(\===|\?)' miniprogram/pages/photo-import/index.wxml || true
grep -nE 'inset[[:space:]]*:' miniprogram/pages/photo-import/index.wxss || true
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add miniprogram/services/api.js miniprogram/app.json miniprogram/pages/photo-import
git commit -m "feat: add photo import page and batch save flow"
```

---

### Task 6: 首页拍照入口

**Files:**
- Modify: `miniprogram/pages/today/index.wxml`
- Modify: `miniprogram/pages/today/index.js`
- Modify: `miniprogram/pages/today/index.wxss`

**Interfaces:**
- Produces: home button navigating to `/pages/photo-import/index`

- [ ] **Step 1: Add button to home WXML**

In `miniprogram/pages/today/index.wxml`, insert this after the closing `</view>` of `.quick-grid` and before the `<view class="card" style="margin-bottom: 32rpx;">` 今日汇总 card:

```html
  <button class="photo-import-btn" bindtap="goPhotoImport">
    <text class="photo-import-icon">📷</text>
    <text>拍照识别记录本</text>
  </button>
```

- [ ] **Step 2: Add navigation handler**

In `miniprogram/pages/today/index.js`, add after `goVoice`:

```js
  goVoice: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/voice/index" }) },
  goPhotoImport: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/photo-import/index" }) },
```

- [ ] **Step 3: Add styles**

Append to `miniprogram/pages/today/index.wxss` (after the quick-grid rules, before the timeline rules is fine):

```css
.photo-import-btn {
  width: 100%;
  margin-bottom: 32rpx;
  background: #ffffff;
  border: 2rpx solid #4F9668;
  border-radius: 28rpx;
  color: #2C6B40;
  font-size: 32rpx;
  font-weight: 800;
  padding: 26rpx 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  line-height: 1.2;
}

.photo-import-btn:active {
  opacity: 0.9;
  transform: scale(0.98);
}

.photo-import-icon {
  font-size: 36rpx;
}
```

- [ ] **Step 4: Verify and commit**

```bash
node --check miniprogram/pages/today/index.js
grep -n "goPhotoImport" miniprogram/pages/today/index.js miniprogram/pages/today/index.wxml
```

Expected: syntax OK; two matches (JS handler + WXML binding).

```bash
git add miniprogram/pages/today/index.js miniprogram/pages/today/index.wxml miniprogram/pages/today/index.wxss
git commit -m "feat: add photo import entry on home page"
```

---

### Task 7: 文档更新、全量验证与提交

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- No code interfaces; keeps architecture docs accurate.

- [ ] **Step 1: Update `CLAUDE.md` frontend table**

Add a row after `pages/voice/`:

```markdown
| `pages/photo-import/` | Photo import: capture notebook page → Tencent handwriting OCR → multi-record confirmation (check/time/date) → batch save; deletes temp photo |
```

- [ ] **Step 2: Update `CLAUDE.md` cloud function table**

Add two rows after `nlp_parse`:

```markdown
| `photo_parse` | Tencent Cloud `GeneralHandwritingOCR` → DeepSeek multi-record extraction → server-side normalization (max 30, dedupe, date/time validation) |
| `event_add_batch` | Batch insert up to 30 events with per-item validation; sets `source: "photo"`; returns saved ids and failed indexes |
```

- [ ] **Step 3: Run the full test suite**

```bash
node tests/photo-import-normalize.test.js
node tests/photo-import-event-batch.test.js
node tests/photo-import-helpers.test.js
```

Expected: all three print `ALL PASS` with exit code 0.

- [ ] **Step 4: Syntax-check every touched JS file**

```bash
node --check cloudfunctions/photo_parse/index.js
node --check cloudfunctions/photo_parse/normalize.js
node --check cloudfunctions/event_add_batch/index.js
node --check cloudfunctions/event_add_batch/validate.js
node --check miniprogram/services/api.js
node --check miniprogram/pages/photo-import/index.js
node --check miniprogram/pages/photo-import/helpers.js
node --check miniprogram/pages/today/index.js
```

Expected: no output from any command.

- [ ] **Step 5: Scan for banned WXML/WXSS patterns**

```bash
grep -nE '\{\{[^}]*(\===|\?)' miniprogram/pages/photo-import/index.wxml miniprogram/pages/today/index.wxml || true
grep -nE 'inset[[:space:]]*:' miniprogram/pages/photo-import/index.wxss miniprogram/pages/today/index.wxss || true
grep -nE '^\s*(const|let)\s|=>|`' miniprogram/pages/photo-import/index.js miniprogram/pages/photo-import/helpers.js || true
```

Expected: no output (the existing `today` files may have pre-existing matches; only new photo-import files must be clean).

- [ ] **Step 6: Check git diff and commit docs**

```bash
git status --short
git add CLAUDE.md
git commit -m "docs: document photo import page and cloud functions"
```

- [ ] **Step 7: Final branch summary**

Run:

```bash
git log --oneline master..HEAD
git status --short
```

Expected: 5 feature commits plus the spec commit; working tree clean.

## Manual Verification (user-run, after deployment)

1. 部署 `photo_parse` 和 `event_add_batch` 云函数。
2. 腾讯云控制台开通「文字识别 OCR」，确认账号有 OCR 权限；环境变量沿用现有 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `DEEPSEEK_API_KEY`。
3. 云开发控制台把 `photo_parse` 超时时间调到 20 秒。
4. 开发者工具/真机拍一张手写喂养记录本：
   - 应看到上传 → 识别 → 整理 → 确认列表。
   - 取消勾选一条后保存，首页时间线不应出现该条。
   - 修改某条时间后保存，「记录」页显示修改后的时间。
   - 未写时间的条目显示「12:00（未识别，点此修改）」，保存后备注含「时间未识别」。
   - 页眉写了日期的照片，记录应落到该日期。
   - 保存后云存储 `photo-import/` 下的临时照片应被删除。
   - 断网/OCR 未开通时显示对应中文提示，页面不白屏。
