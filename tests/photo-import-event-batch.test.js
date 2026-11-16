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
