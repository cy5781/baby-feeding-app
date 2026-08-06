var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var formatDateKey = dateUtils.formatDateKey
var SOLID_PRESETS = require("../../utils/constants").SOLID_PRESETS
var SOLID_PORTIONS = require("../../utils/constants").SOLID_PORTIONS

function buildPresets(selectedItems) {
  return SOLID_PRESETS.map(function (v) {
    var isActive = selectedItems.indexOf(v) !== -1
    return { value: v, chipClass: isActive ? "chip chip-active" : "chip" }
  })
}

function buildPortions(selected) {
  return SOLID_PORTIONS.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
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
    presets: buildPresets([]),
    portions: buildPortions(""),
    solidItems: [],
    solidCustom: "",
    solidPortion: "",
    note: "",
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0),
    customTime: defaultTime()
  },

  // Toggle preset chip (multi-select)
  pick: function (e) {
    var val = e.currentTarget.dataset.val
    var items = this.data.solidItems.slice()
    var idx = items.indexOf(val)
    if (idx !== -1) {
      items.splice(idx, 1)
    } else {
      items.push(val)
    }
    this.setData({ solidItems: items, presets: buildPresets(items) })
  },

  pickPortion: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ solidPortion: val, portions: buildPortions(val) })
  },

  // Custom text input — append as a typed item (user presses enter/done)
  onSolidCustom: function (e) {
    this.setData({ solidCustom: e.detail.value })
  },

  // Save custom input as an extra item
  addCustom: function () {
    var val = String(this.data.solidCustom || "").trim()
    if (!val) return
    var items = this.data.solidItems.slice()
    if (items.indexOf(val) === -1) {
      items.push(val)
    }
    this.setData({ solidItems: items, solidCustom: "", presets: buildPresets(items) })
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
    // Merge custom input if user hasn't tapped "添加" yet
    var items = this.data.solidItems.slice()
    var custom = String(this.data.solidCustom || "").trim()
    if (custom && items.indexOf(custom) === -1) {
      items.push(custom)
    }
    var solidItem = items.join("、")
    if (!solidItem) {
      wx.showToast({ title: "请选择辅食内容", icon: "none" })
      return
    }
    var dt = buildDateTime(this.data.dateOffset, this.data.customTime)
    var that = this
    api.addEvent({
      type: "solid",
      dateKey: dt.dateKey,
      ts: dt.ts,
      solidItem: solidItem,
      solidPortion: this.data.solidPortion || "",
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
