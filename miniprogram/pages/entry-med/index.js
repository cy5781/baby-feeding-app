var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var formatDateKey = dateUtils.formatDateKey
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

Page({
  data: {
    presets: buildPresets(""),
    medName: "",
    note: "",
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0),
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
    this.setData({ dateOffset: offset, dateOffsets: buildDateOffsets(offset) })
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
    var dt = buildDateTime(this.data.dateOffset, this.data.customTime)
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
