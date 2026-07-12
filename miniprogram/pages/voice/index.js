const api = require("../../services/api")
const { todayKey, formatDateKey } = require("../../utils/date")
const { SOLID_PORTIONS, MED_PRESETS, POOP_TYPES, POOP_COLORS } = require("../../utils/constants")

function norm(s) { return String(s || "").trim() }

function parseText(text) {
  var t = norm(text)
  if (!t) return {}

  var milkMatch = t.match(/(?:喝奶|奶)\s*([0-9]{1,3})/)
  if (milkMatch) {
    return { type: "milk", milkAmount: parseInt(milkMatch[1], 10) }
  }

  var poopType = ""
  var poopColor = ""
  for (var i = 0; i < POOP_TYPES.length; i++) {
    if (t.indexOf(POOP_TYPES[i]) !== -1) poopType = POOP_TYPES[i]
  }
  for (var j = 0; j < POOP_COLORS.length; j++) {
    if (t.indexOf(POOP_COLORS[j]) !== -1) poopColor = POOP_COLORS[j]
  }
  if (t.indexOf("便便") !== -1 || t.indexOf("拉") !== -1 || poopType || poopColor) {
    return { type: "poop", poopType: poopType, poopColor: poopColor }
  }

  for (var k = 0; k < MED_PRESETS.length; k++) {
    var m = MED_PRESETS[k]
    if (t.toUpperCase().indexOf(m.key) !== -1 || t.indexOf(m.label) !== -1) {
      return { type: "med", medName: m.key }
    }
  }

  if (t.indexOf("辅食") !== -1 || t.indexOf("吃") !== -1) {
    var solidPortion = ""
    for (var p = 0; p < SOLID_PORTIONS.length; p++) {
      if (t.indexOf(SOLID_PORTIONS[p]) !== -1) solidPortion = SOLID_PORTIONS[p]
    }
    var solidItem = t.replace("辅食", "").replace("吃", "").replace(solidPortion, "").trim()
    return { type: "solid", solidItem: solidItem, solidPortion: solidPortion }
  }

  return {}
}

function buildTsAndDateKey(parsed) {
  var d = new Date()
  var offset = typeof parsed.dateOffsetDays === "number" ? parsed.dateOffsetDays : 0
  if (offset) d.setDate(d.getDate() + offset)
  if (typeof parsed.hour === "number" && isFinite(parsed.hour)) {
    d.setHours(parsed.hour, typeof parsed.minute === "number" && isFinite(parsed.minute) ? parsed.minute : 0, 0, 0)
  } else if (offset) {
    d.setHours(12, 0, 0, 0)
  }
  return { ts: d.getTime(), dateKey: formatDateKey(d) }
}

function describe(parsed) {
  if (parsed.type === "milk") return "🍼 奶粉 " + parsed.milkAmount + "ml"
  if (parsed.type === "solid") {
    var p = parsed.solidPortion ? "（" + parsed.solidPortion + "）" : ""
    return "🥣 辅食 " + parsed.solidItem + p
  }
  if (parsed.type === "med") {
    var m = null
    for (var i = 0; i < MED_PRESETS.length; i++) {
      if (MED_PRESETS[i].key === parsed.medName) m = MED_PRESETS[i]
    }
    return "💊 用药 " + (m ? m.label : parsed.medName)
  }
  if (parsed.type === "poop") return "💩 便便 " + parsed.poopType + " · " + parsed.poopColor
  if (parsed.type === "sleep") return "😴 睡眠 " + parsed.sleepEvent
  return ""
}

Page({
  data: {
    text: "",
    parsed: {},
    resultDesc: "",
    voiceHint: "",
    parsing: false,
    parseBtnText: "🔍 解析"
  },

  onText: function (e) { this.setData({ text: e.detail.value }) },

  parse: function () {
    var value = String(this.data.text || "").trim()
    if (!value) {
      wx.showToast({ title: "请输入内容", icon: "none" })
      return
    }
    this.setData({ parsing: true, parseBtnText: "识别中…" })
    wx.showLoading({ title: "识别中" })

    var that = this
    api.nlpParse(value).then(function (res) {
      var parsed = (res && res.parsed) || {}
      if (!parsed.type || parsed.type === "unknown") {
        var fallback = parseText(value)
        that.setData({
          parsed: fallback,
          resultDesc: describe(fallback),
          voiceHint: fallback.type ? "已完成解析，请确认后保存" : "未识别，请换个说法"
        })
        if (!fallback.type) wx.showToast({ title: "未识别，请换个说法", icon: "none" })
      } else {
        that.setData({
          parsed: parsed,
          resultDesc: describe(parsed),
          voiceHint: "已完成解析，请确认后保存"
        })
      }
    }).catch(function () {
      var parsed = parseText(value)
      that.setData({
        parsed: parsed,
        resultDesc: describe(parsed),
        voiceHint: parsed.type ? "已完成解析（离线），请确认" : "未识别，请换个说法"
      })
      if (!parsed.type) wx.showToast({ title: "未识别，请换个说法", icon: "none" })
    }).finally(function () {
      that.setData({ parsing: false, parseBtnText: "🔍 解析" })
      wx.hideLoading()
    })
  },

  clearResult: function () {
    this.setData({ parsed: {}, resultDesc: "", voiceHint: "", text: "" })
  },

  save: function () {
    var parsed = this.data.parsed
    if (!parsed.type) {
      wx.showToast({ title: "请先解析", icon: "none" })
      return
    }
    var td = buildTsAndDateKey(parsed)
    var base = { dateKey: td.dateKey || todayKey(), ts: td.ts || Date.now(), note: parsed.note || "" }
    var payload = null

    if (parsed.type === "milk") {
      if (!parsed.milkAmount) { wx.showToast({ title: "缺少奶量", icon: "none" }); return }
      var milkPayload = {}
      for (var k in base) milkPayload[k] = base[k]
      milkPayload.type = "milk"
      milkPayload.milkAmount = parsed.milkAmount
      payload = milkPayload
    } else if (parsed.type === "solid") {
      if (!parsed.solidItem) { wx.showToast({ title: "缺少辅食内容", icon: "none" }); return }
      var sPayload = {}
      for (var k2 in base) sPayload[k2] = base[k2]
      sPayload.type = "solid"
      sPayload.solidItem = parsed.solidItem
      sPayload.solidPortion = parsed.solidPortion || ""
      payload = sPayload
    } else if (parsed.type === "med") {
      if (!parsed.medName) { wx.showToast({ title: "缺少用药名称", icon: "none" }); return }
      var mPayload = {}
      for (var k3 in base) mPayload[k3] = base[k3]
      mPayload.type = "med"
      mPayload.medName = parsed.medName
      payload = mPayload
    } else if (parsed.type === "poop") {
      if (!parsed.poopType || !parsed.poopColor) { wx.showToast({ title: "缺少类型/颜色", icon: "none" }); return }
      var pPayload = {}
      for (var k4 in base) pPayload[k4] = base[k4]
      pPayload.type = "poop"
      pPayload.poopType = parsed.poopType
      pPayload.poopColor = parsed.poopColor
      payload = pPayload
    } else if (parsed.type === "sleep") {
      if (!parsed.sleepEvent) { wx.showToast({ title: "缺少睡眠事件", icon: "none" }); return }
      var slPayload = {}
      for (var k5 in base) slPayload[k5] = base[k5]
      slPayload.type = "sleep"
      slPayload.sleepEvent = parsed.sleepEvent
      payload = slPayload
    }

    if (!payload) { wx.showToast({ title: "无法保存", icon: "none" }); return }

    var that = this
    api.addEvent(payload).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  },

  stubVoice: function () {
    wx.showToast({ title: "语音功能即将支持", icon: "none" })
  }
})
