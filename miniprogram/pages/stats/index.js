var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var todayKey = dateUtils.todayKey
var formatDateKey = dateUtils.formatDateKey

function buildDayClasses(days) {
  return {
    days7Class: days === 7 ? "btn chip-active" : "btn",
    days30Class: days === 30 ? "btn chip-active" : "btn"
  }
}

function defaultTime() {
  var d = new Date()
  var h = d.getHours()
  var m = d.getMinutes()
  return (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
}

Page({
  data: {
    days: 7,
    days7Class: "btn chip-active",
    days30Class: "btn",
    today: {},
    rows: [],
    latestWeight: null,
    showWeightInput: false,
    weightOverlayClass: "weight-overlay",
    weightKg: "",
    weightTime: defaultTime()
  },

  onShow: function () { this.load() },

  setDays: function (e) {
    var days = parseInt(e.currentTarget.dataset.days, 10)
    var cls = buildDayClasses(days)
    this.setData({ days: days, days7Class: cls.days7Class, days30Class: cls.days30Class })
    this.load()
  },

  load: function () {
    var dateKey = todayKey()
    var that = this
    Promise.all([api.dailySummary(dateKey), api.statsRange(this.data.days)])
      .then(function (results) {
        var today = results[0]
        var stats = results[1]
        that.setData({
          today: today || {},
          rows: (stats && stats.rows) || [],
          latestWeight: (stats && stats.latestWeight) || null
        })
      }).catch(function (err) {
        if (api.isFamilyRequired(err)) {
          that.setData({ today: {}, rows: [], latestWeight: null })
          return
        }
      })
  },

  /* ---- Weight entry ---- */
  showWeight: function () {
    this.setData({ showWeightInput: true, weightOverlayClass: "weight-overlay active", weightKg: "", weightTime: defaultTime() })
  },

  hideWeight: function () {
    this.setData({ showWeightInput: false, weightOverlayClass: "weight-overlay" })
  },

  onWeightInput: function (e) {
    this.setData({ weightKg: e.detail.value })
  },

  onWeightTimeChange: function (e) {
    this.setData({ weightTime: e.detail.value })
  },

  saveWeight: function () {
    var kg = parseFloat(this.data.weightKg)
    if (!kg || kg <= 0 || kg > 100) {
      wx.showToast({ title: "请输入合理的体重（kg）", icon: "none" })
      return
    }

    var d = new Date()
    var timeStr = this.data.weightTime
    if (timeStr) {
      var parts = timeStr.split(":")
      d.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0)
    }
    var dateKey = formatDateKey(d)
    var ts = d.getTime()

    var that = this
    api.addEvent({
      type: "weight",
      dateKey: dateKey,
      ts: ts,
      weightKg: kg
    }).then(function () {
      that.setData({ showWeightInput: false })
      wx.showToast({ title: "体重已保存", icon: "success" })
      that.load()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
