var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN
var MED_PRESETS = require("../../utils/constants").MED_PRESETS

function buildPresets(selected) {
  return MED_PRESETS.map(function (m) {
    return {
      key: m.key,
      label: m.label,
      chipClass: m.key === selected ? "chip chip-active" : "chip"
    }
  })
}

function buildDateOffsets(selected, customMode) {
  var offsets = [
    { value: 0, label: "今天" },
    { value: -1, label: "昨天" },
    { value: -2, label: "前天" },
    { value: -3, label: "3天前" }
  ]
  return offsets.map(function (o) {
    o.chipClass = (!customMode && o.value === selected) ? "chip chip-active" : "chip"
    return o
  })
}

function defaultTime() {
  var d = new Date()
  var h = d.getHours()
  var m = d.getMinutes()
  return (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
}

function buildDateTime(dateKey, timeStr) {
  return { dateKey: dateKey, ts: dateKeyToTs(dateKey, timeStr) }
}

Page({
  data: {
    presets: buildPresets(""),
    medName: "",
    note: "",
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0, false),
    customDateMode: false,
    customDateKey: todayKey(),
    customDateLabel: "自定义",
    customChipClass: "chip",
    todayKey: todayKey(),
    customTime: defaultTime()
  },

  pick: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ medName: key, presets: buildPresets(key) })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  pickDateOffset: function (e) {
    var offset = parseInt(e.currentTarget.dataset.offset, 10)
    this.setData({
      dateOffset: offset,
      dateOffsets: buildDateOffsets(offset, false),
      customDateMode: false,
      customChipClass: "chip",
      customDateLabel: "自定义",
      customDateKey: todayKey()
    })
  },

  onCustomDateChange: function (e) {
    var dateKey = e.detail.value
    this.setData({
      customDateMode: true,
      customDateKey: dateKey,
      customDateLabel: monthDayCN(dateKey),
      customChipClass: "chip chip-active",
      dateOffsets: buildDateOffsets(this.data.dateOffset, true)
    })
  },

  onTimeChange: function (e) {
    this.setData({ customTime: e.detail.value })
  },

  save: function () {
    var medName = this.data.medName
    if (!medName) {
      wx.showToast({ title: "请选择一种用药", icon: "none" })
      return
    }
    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
    var that = this
    api.addEvent({
      type: "med",
      dateKey: dt.dateKey,
      ts: dt.ts,
      medName: medName,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
