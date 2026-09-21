var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN
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
    presets: buildPresets([]),
    portions: buildPortions(""),
    solidItems: [],
    solidCustom: "",
    solidPortion: "",
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
    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
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
