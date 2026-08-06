var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var todayKey = dateUtils.todayKey
var formatDateKey = dateUtils.formatDateKey
var constants = require("../../utils/constants")
var SOLID_PORTIONS = constants.SOLID_PORTIONS
var MED_PRESETS = constants.MED_PRESETS
var POOP_TYPES = constants.POOP_TYPES
var POOP_COLORS = constants.POOP_COLORS
var POOP_AMOUNTS = constants.POOP_AMOUNTS

function norm(s) { return String(s || "").trim() }

/* ---- Local regex fallback parser ---- */
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
  var poopAmount = ""
  for (var a = 0; a < POOP_AMOUNTS.length; a++) {
    if (t.indexOf(POOP_AMOUNTS[a]) !== -1) poopAmount = POOP_AMOUNTS[a]
  }
  if (t.indexOf("便便") !== -1 || t.indexOf("拉") !== -1 || poopType || poopColor) {
    return { type: "poop", poopType: poopType, poopColor: poopColor, poopAmount: poopAmount }
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

  if (t.indexOf("疫苗") !== -1 || t.indexOf("打针") !== -1 || t.indexOf("接种") !== -1) {
    var vName = t.replace(/打|了|疫苗|接种|针/g, "").trim()
    return { type: "vaccine", subType: vName || "疫苗" }
  }

  if (t.indexOf("发烧") !== -1 || t.indexOf("发热") !== -1) {
    return { type: "illness", subType: "发烧" }
  }
  if (t.indexOf("咳嗽") !== -1 || t.indexOf("流涕") !== -1 || t.indexOf("感冒") !== -1) {
    return { type: "illness", subType: "咳嗽/流涕" }
  }
  if (t.indexOf("呕吐") !== -1 || t.indexOf("腹泻") !== -1 || t.indexOf("拉肚子") !== -1) {
    return { type: "illness", subType: "呕吐/腹泻" }
  }
  if (t.indexOf("生病") !== -1 || t.indexOf("不舒服") !== -1) {
    return { type: "illness", subType: "不适" }
  }

  // Weight: match patterns like "体重8.5kg", "8.5公斤", "称了8.5"
  var wtMatch = t.match(/体重\s*([0-9]+\.?[0-9]*)/)
  if (!wtMatch) wtMatch = t.match(/([0-9]+\.?[0-9]*)\s*(kg|公斤)/)
  if (wtMatch) {
    return { type: "weight", weightKg: parseFloat(wtMatch[1]) }
  }

  return {}
}

/* ---- Date/time helpers ---- */
function buildDateOffsets(selected) {
  var offsets = [
    { value: 0, label: "今天" },
    { value: -1, label: "昨天" },
    { value: -2, label: "前天" },
    { value: -3, label: "3天前" }
  ]
  return offsets.map(function (o) {
    o.chipClass = o.value === selected ? "chip chip-active" : "chip"
    return o
  })
}

function defaultTime() {
  var d = new Date()
  var h = d.getHours()
  var m = d.getMinutes()
  return (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
}

function buildDateTime(offset, timeStr) {
  var d = new Date()
  if (offset) d.setDate(d.getDate() + offset)
  if (timeStr) {
    var parts = timeStr.split(":")
    d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0)
  }
  return { dateKey: formatDateKey(d), ts: d.getTime() }
}

function describe(parsed) {
  if (parsed.type === "milk") return "🍼 奶粉 " + parsed.milkAmount + "ml"
  if (parsed.type === "solid") {
    var p = parsed.solidPortion ? "（" + parsed.solidPortion + "）" : ""
    return "🥣 辅食 " + parsed.solidItem + p
  }
  if (parsed.type === "med") {
    var label = parsed.medName
    for (var i = 0; i < MED_PRESETS.length; i++) {
      if (MED_PRESETS[i].key === parsed.medName) label = MED_PRESETS[i].label
    }
    return "💊 用药 " + label
  }
  if (parsed.type === "poop") {
    var amt = parsed.poopAmount ? " · " + parsed.poopAmount : ""
    return "💩 便便 " + parsed.poopType + " · " + parsed.poopColor + amt
  }
  if (parsed.type === "sleep") return "😴 睡眠 " + parsed.sleepEvent
  if (parsed.type === "vaccine") return "💉 疫苗 " + (parsed.subType || "疫苗")
  if (parsed.type === "illness") return "🤒 生病 " + (parsed.subType || "不适")
  if (parsed.type === "weight") return "⚖️ 体重 " + (parsed.weightKg || 0) + "kg"
  return ""
}

// Format recognized date+time for display
function formatRecognizedTime(parsed) {
  if (!parsed || typeof parsed !== "object") return ""

  var dateLabels = { "0": "今天", "-1": "昨天", "-2": "前天", "-3": "3天前" }
  var datePart = ""
  if (typeof parsed.dateOffsetDays === "number" && isFinite(parsed.dateOffsetDays)) {
    var key = String(parsed.dateOffsetDays)
    datePart = dateLabels[key] || ""
  }

  var timePart = ""
  if (typeof parsed.hour === "number" && isFinite(parsed.hour)) {
    var h = parsed.hour
    var m = (typeof parsed.minute === "number" && isFinite(parsed.minute)) ? parsed.minute : 0
    timePart = (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
  }

  if (datePart && timePart) return datePart + " " + timePart
  if (timePart) return "今天 " + timePart
  if (datePart) return datePart
  return ""
}

Page({
  data: {
    text: "",
    parsed: {},
    resultDesc: "",
    voiceHint: "",
    recognizedTimeText: "",
    parsing: false,
    parseBtnText: "🔍 解析",

    // Recording
    recording: false,
    uploading: false,
    recordBtnText: "🎤 按住说话",
    recordBtnClass: "voice-record-btn",
    waveBars: [15, 25, 18, 35, 22, 12],

    // Custom time
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0),
    customTime: defaultTime()
  },

  onLoad: function () {
    var that = this
    this.recorder = wx.getRecorderManager()

    this.recorder.onStart(function () {
      that.setData({ recording: true, recordBtnText: "松开结束", recordBtnClass: "voice-record-btn is-recording" })
      that.startWave()
    })

    this.recorder.onStop(function (res) {
      that.setData({ recording: false, recordBtnText: "🎤 按住说话", recordBtnClass: "voice-record-btn" })
      that.stopWave()
      if (res.tempFilePath) {
        that.uploadAndRecognize(res.tempFilePath)
      }
    })

    this.recorder.onError(function () {
      that.setData({ recording: false, recordBtnText: "🎤 按住说话", recordBtnClass: "voice-record-btn" })
      that.stopWave()
      wx.showToast({ title: "录音失败，请重试", icon: "none" })
    })
  },

  /* ---- Wave animation ---- */
  startWave: function () {
    var that = this
    this._waveTimer = setInterval(function () {
      var bars = []
      for (var i = 0; i < 6; i++) {
        bars.push(Math.floor(Math.random() * 50 + 10))
      }
      that.setData({ waveBars: bars })
    }, 120)
  },

  stopWave: function () {
    if (this._waveTimer) {
      clearInterval(this._waveTimer)
      this._waveTimer = null
    }
    this.setData({ waveBars: [15, 25, 18, 35, 22, 12] })
  },

  /* ---- Record button ---- */
  startRecord: function () {
    var that = this
    wx.authorize({ scope: "scope.record" }).then(function () {
      that.recorder.start({
        duration: 60000,
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        format: "mp3"
      })
    }).catch(function () {
      wx.showModal({
        title: "需要录音权限",
        content: "请在设置中允许麦克风权限",
        confirmText: "去设置",
        success: function (res) {
          if (res.confirm) wx.openSetting()
        }
      })
    })
  },

  stopRecord: function () {
    if (this.data.recording) {
      this.recorder.stop()
    }
  },

  /* ---- Upload audio → ASR → NLP ---- */
  uploadAndRecognize: function (tempPath) {
    var that = this
    this.setData({ uploading: true })

    var cloudPath = "voice/" + Date.now() + ".mp3"
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempPath,
      success: function (res) {
        // Call speech_recognize cloud function
        wx.cloud.callFunction({
          name: "speech_recognize",
          data: { fileID: res.fileID, voiceFormat: "mp3" }
        }).then(function (result) {
          var text = (result.result && result.result.text) || ""
          that.setData({ uploading: false, text: text })
          if (text) {
            // Auto-trigger NLP parse on the recognized text
            that.parseText(text)
          } else {
            wx.showToast({ title: "未识别到语音内容，请重试", icon: "none" })
          }
        }).catch(function (err) {
          that.setData({ uploading: false })
          // If ASR fails, fall back to showing text input
          console.error("ASR error:", err)
          wx.showToast({ title: "语音识别失败，可手动输入", icon: "none" })
        })
      },
      fail: function () {
        that.setData({ uploading: false })
        wx.showToast({ title: "上传失败，请重试", icon: "none" })
      }
    })
  },

  /* ---- Text input ---- */
  onText: function (e) { this.setData({ text: e.detail.value }) },

  /* ---- NLP parse (shared by voice and text input) ---- */
  parse: function () {
    this.parseText(this.data.text)
  },

  parseText: function (value) {
    value = String(value || "").trim()
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
          voiceHint: fallback.type ? "已完成解析，请确认后保存" : "未识别，请换个说法",
          recognizedTimeText: formatRecognizedTime(fallback)
        })
        if (!fallback.type) wx.showToast({ title: "未识别，请换个说法", icon: "none" })
      } else {
        that.setData({
          parsed: parsed,
          resultDesc: describe(parsed),
          voiceHint: "已完成解析，请确认后保存",
          recognizedTimeText: formatRecognizedTime(parsed)
        })
      }
    }).catch(function () {
      var parsed = parseText(value)
      that.setData({
        parsed: parsed,
        resultDesc: describe(parsed),
        voiceHint: parsed.type ? "已完成解析（离线），请确认" : "未识别，请换个说法",
        recognizedTimeText: formatRecognizedTime(parsed)
      })
      if (!parsed.type) wx.showToast({ title: "未识别，请换个说法", icon: "none" })
    }).finally(function () {
      that.setData({ parsing: false, parseBtnText: "🔍 解析" })
      wx.hideLoading()
    })
  },

  clearResult: function () {
    this.setData({ parsed: {}, resultDesc: "", voiceHint: "", recognizedTimeText: "", text: "" })
  },

  /* ---- Custom time ---- */
  pickDateOffset: function (e) {
    var offset = parseInt(e.currentTarget.dataset.offset, 10)
    this.setData({ dateOffset: offset, dateOffsets: buildDateOffsets(offset) })
  },

  onTimeChange: function (e) {
    this.setData({ customTime: e.detail.value })
  },

  /* ---- Save ---- */
  save: function () {
    var parsed = this.data.parsed
    if (!parsed.type) {
      wx.showToast({ title: "请先解析", icon: "none" })
      return
    }

    // NLP-extracted time takes priority, else use manual picker
    var offset = (typeof parsed.dateOffsetDays === "number" && isFinite(parsed.dateOffsetDays))
      ? parsed.dateOffsetDays : this.data.dateOffset
    var timeStr = this.data.customTime
    if (typeof parsed.hour === "number" && isFinite(parsed.hour)) {
      var h = parsed.hour
      var m = (typeof parsed.minute === "number" && isFinite(parsed.minute)) ? parsed.minute : 0
      timeStr = (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
    }
    var dt = buildDateTime(offset, timeStr)

    var base = { dateKey: dt.dateKey, ts: dt.ts, note: parsed.note || "", source: "voice" }
    var payload = null

    if (parsed.type === "milk") {
      if (!parsed.milkAmount) { wx.showToast({ title: "缺少奶量", icon: "none" }); return }
      payload = {}
      for (var k in base) payload[k] = base[k]
      payload.type = "milk"
      payload.milkAmount = parsed.milkAmount
    } else if (parsed.type === "solid") {
      if (!parsed.solidItem) { wx.showToast({ title: "缺少辅食内容", icon: "none" }); return }
      payload = {}
      for (var k2 in base) payload[k2] = base[k2]
      payload.type = "solid"
      payload.solidItem = parsed.solidItem
      payload.solidPortion = parsed.solidPortion || ""
    } else if (parsed.type === "med") {
      if (!parsed.medName) { wx.showToast({ title: "缺少用药名称", icon: "none" }); return }
      payload = {}
      for (var k3 in base) payload[k3] = base[k3]
      payload.type = "med"
      payload.medName = parsed.medName
    } else if (parsed.type === "poop") {
      if (!parsed.poopType || !parsed.poopColor) { wx.showToast({ title: "缺少类型/颜色", icon: "none" }); return }
      payload = {}
      for (var k4 in base) payload[k4] = base[k4]
      payload.type = "poop"
      payload.poopType = parsed.poopType
      payload.poopColor = parsed.poopColor
      payload.poopAmount = parsed.poopAmount || ""
    } else if (parsed.type === "sleep") {
      if (!parsed.sleepEvent) { wx.showToast({ title: "缺少睡眠事件", icon: "none" }); return }
      payload = {}
      for (var k5 in base) payload[k5] = base[k5]
      payload.type = "sleep"
      payload.sleepEvent = parsed.sleepEvent
    } else if (parsed.type === "vaccine") {
      payload = {}
      for (var k6 in base) payload[k6] = base[k6]
      payload.type = "vaccine"
      payload.subType = parsed.subType || "疫苗"
    } else if (parsed.type === "illness") {
      if (!parsed.subType) { wx.showToast({ title: "缺少症状描述", icon: "none" }); return }
      payload = {}
      for (var k7 in base) payload[k7] = base[k7]
      payload.type = "illness"
      payload.subType = parsed.subType
    } else if (parsed.type === "weight") {
      if (!parsed.weightKg) { wx.showToast({ title: "缺少体重数值", icon: "none" }); return }
      payload = {}
      for (var k8 in base) payload[k8] = base[k8]
      payload.type = "weight"
      payload.weightKg = parsed.weightKg
    }

    if (!payload) { wx.showToast({ title: "无法保存", icon: "none" }); return }

    var that = this
    api.addEvent(payload).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
