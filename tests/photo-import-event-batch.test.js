var assert = require("assert")
var v = require("../cloudfunctions/event_add_batch/validate")
var rb = require("../cloudfunctions/event_add_batch/run_batch")

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

test("batch runs valid events and reports per-item failures", function () {
  var added = []
  var deps = {
    validate: function (evt) {
      if (evt.type === "bad") return { ok: false, reason: "type_not_supported" }
      return { ok: true, data: { type: evt.type, dateKey: evt.dateKey, ts: evt.ts, note: "" } }
    },
    familyId: "fam1",
    createdAt: function () { return "SERVER_DATE" },
    add: function (data) {
      added.push(data)
      if (data.type === "boom") return Promise.reject(new Error("db"))
      return Promise.resolve({ _id: "id-" + data.type })
    }
  }
  return rb.runBatch([
    { type: "milk", dateKey: "2026-11-16", ts: 1 },
    { type: "bad", dateKey: "2026-11-16", ts: 2 },
    { type: "boom", dateKey: "2026-11-16", ts: 3 },
    { type: "poop", dateKey: "2026-11-16", ts: 4 }
  ], deps).then(function (res) {
    assert.strictEqual(res.saved, 2)
    assert.deepStrictEqual(res.ids, ["id-milk", "id-poop"])
    assert.deepStrictEqual(res.failed, [
      { index: 1, reason: "type_not_supported" },
      { index: 2, reason: "db_error" }
    ])
    assert.strictEqual(added.length, 3)
    assert.strictEqual(added[0].familyId, "fam1")
    assert.strictEqual(added[0].source, "photo")
    assert.strictEqual(added[0].createdAt, "SERVER_DATE")
  })
})

var failed = 0
var pending = []
for (var i = 0; i < cases.length; i++) {
  (function (name, fn) {
    try {
      var r = fn()
      if (r && typeof r.then === "function") {
        pending.push(r.then(function () {
          console.log("PASS " + name)
        }).catch(function (e) {
          failed++
          console.error("FAIL " + name)
          console.error(e && e.stack ? e.stack : e)
        }))
      } else {
        console.log("PASS " + name)
      }
    } catch (e) {
      failed++
      console.error("FAIL " + name)
      console.error(e && e.stack ? e.stack : e)
    }
  })(cases[i].name, cases[i].fn)
}
Promise.all(pending).then(function () {
  if (failed > 0) {
    console.error(failed + " test(s) failed")
    process.exit(1)
  }
  console.log("ALL PASS (" + cases.length + ")")
})
