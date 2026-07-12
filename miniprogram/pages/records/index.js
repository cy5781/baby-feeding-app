const api = require("../../services/api")
const { todayKey, addDays, formatTimeHM, weekdayCN, monthDayCN } = require("../../utils/date")

function mapEvent(e) {
  var time = formatTimeHM(new Date(e.ts))
  if (e.type === "milk") {
    return { _id: e._id, time: time, desc: "奶粉", amount: e.milkAmount + "ml", tag: e.note || "" }
  }
  if (e.type === "solid") {
    var p = e.solidPortion ? "（" + e.solidPortion + "）" : ""
    return { _id: e._id, time: time, desc: "辅食 " + e.solidItem + p, amount: "", tag: e.note || "" }
  }
  if (e.type === "med") {
    var label = e.medNameLabel || e.medName || ""
    return { _id: e._id, time: time, desc: "用药", amount: label, tag: e.note || "" }
  }
  if (e.type === "poop") {
    return { _id: e._id, time: time, desc: "便便 " + e.poopType + " · " + e.poopColor, amount: "", tag: e.note || "" }
  }
  if (e.type === "sleep") {
    return { _id: e._id, time: time, desc: "睡眠 " + e.sleepEvent, amount: "", tag: e.note || "" }
  }
  return { _id: e._id, time: time, desc: "记录", amount: "", tag: "" }
}

Page({
  data: {
    dateKey: todayKey(),
    monthDay: "",
    weekday: "",
    summaryMilkCount: 0,
    summaryMilkTotal: 0,
    summarySolidCount: 0,
    summaryPoopCount: 0,
    items: []
  },

  onShow: function () { this.load() },

  load: function () {
    var dateKey = this.data.dateKey
    this.setData({
      monthDay: monthDayCN(dateKey),
      weekday: weekdayCN(dateKey)
    })
    var that = this
    Promise.all([api.dailySummary(dateKey), api.listByDate(dateKey)])
      .then(function (results) {
        var summary = results[0]
        var list = results[1]
        that.setData({
          summaryMilkCount: summary ? (summary.milkCount || 0) : 0,
          summaryMilkTotal: summary ? (summary.milkTotal || 0) : 0,
          summarySolidCount: summary ? (summary.solidCount || 0) : 0,
          summaryPoopCount: summary ? (summary.poopCount || 0) : 0,
          items: (list.items || []).map(mapEvent)
        })
      }).catch(function (err) {
        if (api.isFamilyRequired(err)) {
          that.setData({
            summaryMilkCount: 0, summaryMilkTotal: 0,
            summarySolidCount: 0, summaryPoopCount: 0, items: []
          })
          return
        }
        console.error("records load error:", err)
      })
  },

  prevDay: function () {
    this.setData({ dateKey: addDays(this.data.dateKey, -1) })
    this.load()
  },

  nextDay: function () {
    this.setData({ dateKey: addDays(this.data.dateKey, 1) })
    this.load()
  },

  onDatePickerChange: function (e) {
    this.setData({ dateKey: e.detail.value })
    this.load()
  },

  onDelete: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: "删除记录",
      content: "确定删除这条记录？",
      success: function (res) {
        if (!res.confirm) return
        api.deleteEvent(id).then(function () {
          wx.showToast({ title: "已删除", icon: "none" })
          that.load()
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "删除失败"), icon: "none" })
        })
      }
    })
  }
})
