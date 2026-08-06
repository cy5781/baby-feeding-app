var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var todayKey = dateUtils.todayKey
var formatDateKey = dateUtils.formatDateKey

// China CDC recommended vaccine schedule (age in months: vaccine name)
var VACCINE_SCHEDULE = [
  { ageMonths: 0, name: "乙肝疫苗(1)", desc: "出生24小时内" },
  { ageMonths: 0, name: "卡介苗", desc: "出生后尽早" },
  { ageMonths: 1, name: "乙肝疫苗(2)", desc: "1月龄" },
  { ageMonths: 2, name: "脊灰疫苗(1)", desc: "2月龄" },
  { ageMonths: 2, name: "百白破(1)", desc: "2月龄" },
  { ageMonths: 3, name: "脊灰疫苗(2)", desc: "3月龄" },
  { ageMonths: 3, name: "百白破(2)", desc: "3月龄" },
  { ageMonths: 4, name: "脊灰疫苗(3)", desc: "4月龄" },
  { ageMonths: 4, name: "百白破(3)", desc: "4月龄" },
  { ageMonths: 5, name: "百白破(4)", desc: "5月龄" },
  { ageMonths: 6, name: "乙肝疫苗(3)", desc: "6月龄" },
  { ageMonths: 6, name: "A群流脑(1)", desc: "6月龄" },
  { ageMonths: 8, name: "麻腮风疫苗", desc: "8月龄" },
  { ageMonths: 8, name: "乙脑疫苗", desc: "8月龄" },
  { ageMonths: 9, name: "A群流脑(2)", desc: "9月龄" },
  { ageMonths: 12, name: "水痘疫苗", desc: "12月龄" },
  { ageMonths: 18, name: "百白破(加强)", desc: "18月龄" },
  { ageMonths: 18, name: "麻腮风(2)", desc: "18月龄" },
  { ageMonths: 24, name: "乙脑(加强)", desc: "24月龄" }
]

// WHO weight-for-age median values (kg) at key months (boys, simplified)
var WHO_WEIGHT_MEDIAN = {
  0: 3.3, 1: 4.5, 2: 5.6, 3: 6.4, 4: 7.0, 5: 7.5, 6: 7.9,
  7: 8.3, 8: 8.6, 9: 8.9, 10: 9.2, 11: 9.4, 12: 9.6,
  15: 10.3, 18: 10.9, 21: 11.5, 24: 12.2
}
var WHO_WEIGHT_P3 = {
  0: 2.5, 1: 3.4, 2: 4.3, 3: 5.0, 4: 5.6, 5: 6.0, 6: 6.4,
  7: 6.7, 8: 7.0, 9: 7.2, 10: 7.5, 11: 7.7, 12: 7.8,
  15: 8.5, 18: 9.0, 21: 9.5, 24: 10.0
}
var WHO_WEIGHT_P97 = {
  0: 4.2, 1: 5.8, 2: 7.1, 3: 8.0, 4: 8.7, 5: 9.3, 6: 9.8,
  7: 10.3, 8: 10.7, 9: 11.1, 10: 11.4, 11: 11.7, 12: 12.0,
  15: 12.8, 18: 13.7, 21: 14.5, 24: 15.3
}

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

// Compute vaccine status based on recorded vaccines
function computeVaccineStatus(recordedVaccines) {
  var doneMap = {}
  for (var i = 0; i < recordedVaccines.length; i++) {
    var v = recordedVaccines[i]
    var subType = (v.subType || "").trim()
    if (subType) doneMap[subType] = true
  }

  return VACCINE_SCHEDULE.map(function (v) {
    // Check if any recorded vaccine name matches
    var done = false
    var keys = Object.keys(doneMap)
    for (var k = 0; k < keys.length; k++) {
      if (v.name.indexOf(keys[k]) !== -1 || keys[k].indexOf(v.name.replace(/\(\d\)/g, "")) !== -1) {
        done = true; break
      }
    }
    return {
      name: v.name,
      desc: v.desc,
      ageMonths: v.ageMonths,
      status: done ? "done" : "pending",
      label: done ? "✅ " + v.name : v.name
    }
  })
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
    weightTime: defaultTime(),
    vaccines: [],
    weightData: []
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
    // Fetch all vaccine events to compute status
    var d = new Date(); d.setDate(d.getDate() - 365)
    var yearAgo = formatDateKey(d)

    Promise.all([
      api.dailySummary(dateKey),
      api.statsRange(this.data.days),
      api.listByDate(dateKey)  // for weight data
    ]).then(function (results) {
      var today = results[0]
      var stats = results[1]
      var list = results[2]
      var items = (list && list.items) || []

      // Extract weight data for chart
      var weightItems = []
      for (var i = 0; i < (stats.rows || []).length; i++) {
        if (stats.rows[i].weightKg > 0) {
          weightItems.push({ dateKey: stats.rows[i].dateKey, weightKg: stats.rows[i].weightKg })
        }
      }

      // Find all recorded vaccines from the stats range
      var recordedVaccines = []
      for (var j = 0; j < items.length; j++) {
        if (items[j].type === "vaccine") recordedVaccines.push(items[j])
      }

      that.setData({
        today: today || {},
        rows: (stats && stats.rows) || [],
        latestWeight: (stats && stats.latestWeight) || null,
        weightData: weightItems,
        vaccines: computeVaccineStatus(recordedVaccines)
      })
    }).catch(function (err) {
      if (api.isFamilyRequired(err)) {
        that.setData({ today: {}, rows: [], latestWeight: null, vaccines: [], weightData: [] })
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
      that.setData({ showWeightInput: false, weightOverlayClass: "weight-overlay" })
      wx.showToast({ title: "体重已保存", icon: "success" })
      that.load()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
