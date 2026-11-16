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
