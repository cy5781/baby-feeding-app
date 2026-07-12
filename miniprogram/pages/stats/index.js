const api = require("../../services/api")
const { todayKey } = require("../../utils/date")

function buildDayClasses(days) {
  return {
    days7Class: days === 7 ? "btn chip-active" : "btn",
    days30Class: days === 30 ? "btn chip-active" : "btn"
  }
}

Page({
  data: {
    days: 7,
    days7Class: "btn chip-active",
    days30Class: "btn",
    today: {},
    rows: []
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
          rows: (stats && stats.rows) || []
        })
      }).catch(function (err) {
        if (api.isFamilyRequired(err)) {
          that.setData({ today: {}, rows: [] })
          return
        }
      })
  }
})
