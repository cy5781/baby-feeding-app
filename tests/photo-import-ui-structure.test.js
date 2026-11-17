var assert = require("assert")
var fs = require("fs")
var path = require("path")

var wxml = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/photo-import/index.wxml"), "utf8")
var wxss = fs.readFileSync(path.join(__dirname, "../miniprogram/pages/photo-import/index.wxss"), "utf8")

var cases = []
function test(name, fn) { cases.push({ name: name, fn: fn }) }

function cssBlock(selector) {
  var idx = wxss.indexOf(selector + " {")
  if (idx === -1) return ""
  var end = wxss.indexOf("}", idx)
  if (end === -1) return ""
  return wxss.slice(idx, end)
}

test("raw OCR fold renders outside the result container", function () {
  var raw = wxml.indexOf('class="pi-raw"')
  var result = wxml.indexOf('wx:if="{{showResult}}"')
  assert.ok(raw !== -1, "pi-raw block missing")
  assert.ok(result !== -1, "showResult container missing")
  assert.ok(raw < result, "pi-raw must render before the showResult container so no_items can show it")
  assert.ok(wxml.indexOf('wx:if="{{rawText}}" class="pi-raw"') !== -1, "pi-raw must be gated by rawText")
})

test("time and date pickers wrap a large hit area", function () {
  assert.ok(wxml.indexOf('class="pi-time-picker"') !== -1, "time picker wrapper missing")
  assert.ok(wxml.indexOf('class="pi-date-picker"') !== -1, "date picker wrapper missing")
})

test("key controls meet the 88rpx touch target", function () {
  var selectors = [".pi-time-picker", ".pi-date-picker", ".pi-raw-toggle", ".pi-btn-secondary"]
  for (var i = 0; i < selectors.length; i++) {
    var block = cssBlock(selectors[i])
    assert.ok(block, selectors[i] + " rule missing")
    assert.ok(block.indexOf("min-height: 88rpx") !== -1, selectors[i] + " must set min-height: 88rpx")
  }
})

test("actionable hint text stays at or above 28rpx", function () {
  var selectors = [".pi-capture-hint", ".pi-result-hint", ".pi-date-hint", ".pi-item-date", ".pi-raw-text"]
  for (var i = 0; i < selectors.length; i++) {
    var block = cssBlock(selectors[i])
    var m = /font-size:\s*(\d+)rpx/.exec(block)
    assert.ok(m, selectors[i] + " font-size missing")
    assert.ok(parseInt(m[1], 10) >= 28, selectors[i] + " font-size " + m[1] + "rpx is below 28rpx")
  }
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
