var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN
var POOP_TYPES = require("../../utils/constants").POOP_TYPES
var POOP_COLORS = require("../../utils/constants").POOP_COLORS
var POOP_AMOUNTS = require("../../utils/constants").POOP_AMOUNTS

function buildTypes(selected) {
  return POOP_TYPES.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

function buildColors(selected) {
  return POOP_COLORS.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

function buildAmounts(selected) {
  return POOP_AMOUNTS.map(function (v) {
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
    types: buildTypes(""),
    colors: buildColors(""),
    amounts: buildAmounts(""),
    poopType: "",
    poopColor: "",
    poopAmount: "",
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

  pickType: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ poopType: val, types: buildTypes(val) })
  },

  pickColor: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ poopColor: val, colors: buildColors(val) })
  },

  pickAmount: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ poopAmount: val, amounts: buildAmounts(val) })
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
    if (!this.data.poopType) {
      wx.showToast({ title: "请选择类型", icon: "none" })
      return
    }
    if (!this.data.poopColor) {
      wx.showToast({ title: "请选择颜色", icon: "none" })
      return
    }
    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
    var that = this
    api.addEvent({
      type: "poop",
      dateKey: dt.dateKey,
      ts: dt.ts,
      poopType: this.data.poopType,
      poopColor: this.data.poopColor,
      poopAmount: this.data.poopAmount || "",
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
