var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var todayKey = dateUtils.todayKey
var formatDateKey = dateUtils.formatDateKey
var MILK_QUICK = require("../../utils/constants").MILK_QUICK

function buildQuick(amount) {
  return MILK_QUICK.map(function (v) {
    return {
      value: v,
      chipClass: v === amount ? "chip chip-active" : "chip"
    }
  })
}

function buildDateOffsets(selected) {
  var offsets = [
    { value: 0, label: "今天" },
    { value: -1, label: "昨天" },
    { value: -2, label: "前天" }
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
    amount: 130,
    note: "",
    quick: buildQuick(130),
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0),
    customTime: defaultTime()
  },

  step: function (e) {
    var delta = parseInt(e.currentTarget.dataset.delta, 10)
    var amount = Math.max(0, (parseInt(this.data.amount, 10) || 0) + delta)
    this.setData({ amount: amount, quick: buildQuick(amount) })
  },

  pick: function (e) {
    var amount = parseInt(e.currentTarget.dataset.val, 10)
    this.setData({ amount: amount, quick: buildQuick(amount) })
  },

  onAmount: function (e) {
    var amount = parseInt(e.detail.value, 10) || 0
    this.setData({ amount: amount, quick: buildQuick(amount) })
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
    var amount = parseInt(this.data.amount, 10)
    if (!amount) {
      wx.showToast({ title: "请选择奶量", icon: "none" })
      return
    }
    var dt = buildDateTime(this.data.dateOffset, this.data.customTime)
    var that = this
    api.addEvent({
      type: "milk",
      dateKey: dt.dateKey,
      ts: dt.ts,
      milkAmount: amount,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
