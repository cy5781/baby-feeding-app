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

test("only photo-import upload paths are accepted", function () {
  assert.strictEqual(n.isPhotoUploadPath("cloud://env.abc/photo-import/123.jpg"), true)
  assert.strictEqual(n.isPhotoUploadPath("cloud://env.abc/vaccine/123.jpg"), false)
  assert.strictEqual(n.isPhotoUploadPath(""), false)
  assert.strictEqual(n.isPhotoUploadPath(null), false)
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
