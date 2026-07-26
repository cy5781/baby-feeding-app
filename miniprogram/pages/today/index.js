const api = require("../../services/api")
const { todayKey, formatTimeHM, weekdayCN, monthDayCN, timeAgoCN } = require("../../utils/date")
const { TIME_FILTERS } = require("../../utils/constants")

function mapEvent(e) {
  var time = formatTimeHM(new Date(e.ts))
  if (e.type === "milk") {
    return { _id: e._id, type: "milk", time: time, ts: e.ts,
      desc: "奶粉 " + e.milkAmount + "ml", meta: e.note || "" }
  }
  if (e.type === "solid") {
    var p = e.solidPortion ? "（" + e.solidPortion + "）" : ""
    return { _id: e._id, type: "solid", time: time, ts: e.ts,
      desc: "辅食 " + e.solidItem + p, meta: e.note || "" }
  }
  if (e.type === "med") {
    var label = e.medNameLabel || e.medName || ""
    return { _id: e._id, type: "med", time: time, ts: e.ts,
      desc: "用药 " + label, meta: e.note || "" }
  }
  if (e.type === "poop") {
    var amt = e.poopAmount ? " · " + e.poopAmount : ""
    return { _id: e._id, type: "poop", time: time, ts: e.ts,
      desc: "便便 " + e.poopType + " · " + e.poopColor + amt, meta: e.note || "" }
  }
  if (e.type === "sleep") {
    return { _id: e._id, type: "sleep", time: time, ts: e.ts,
      desc: "睡眠 " + e.sleepEvent, meta: e.note || "" }
  }
  if (e.type === "vaccine") {
    var vName = e.subType || "疫苗"
    return { _id: e._id, type: "vaccine", time: time, ts: e.ts,
      desc: "💉 疫苗 " + vName, meta: e.note || "" }
  }
  if (e.type === "illness") {
    var iName = e.subType || "不适"
    return { _id: e._id, type: "illness", time: time, ts: e.ts,
      desc: "🤒 " + iName, meta: e.note || "" }
  }
  if (e.type === "weight") {
    var w = e.weightKg || 0
    return { _id: e._id, type: "weight", time: time, ts: e.ts,
      desc: "⚖️ 体重 " + w + "kg", meta: "" }
  }
  return { _id: e._id, type: "", time: time, ts: e.ts, desc: "记录", meta: "" }
}

function buildFilters(activeKey) {
  return TIME_FILTERS.map(function (f) {
    return {
      key: f.key,
      label: f.label,
      activeClass: f.key === activeKey ? "filter-chip active" : "filter-chip"
    }
  })
}

Page({
  data: {
    monthDay: "",
    weekday: "",
    weather: "☀️",
    lastMilk: null,
    summaryMilkCount: 0,
    summaryMilkTotal: 0,
    summarySolidCount: 0,
    summaryPoopCount: 0,
    medCount: 0,
    medSummary: "",
    vaccineCount: 0,
    illnessCount: 0,
    filters: buildFilters("all"),
    filterActive: "all",
    allItems: [],
    filteredItems: [],
    showMedSheet: false,
    medSheetOverlayClass: "med-sheet-overlay"
  },

  onShow: function () {
    try {
      var dateKey = todayKey()
      this.setData({
        monthDay: monthDayCN(dateKey),
        weekday: weekdayCN(dateKey)
      })
      this.loadData()
    } catch (e) {
      console.error("onShow error:", e)
    }
  },

  loadData: function () {
    var dateKey = todayKey()
    var that = this
    Promise.all([
      api.dailySummary(dateKey),
      api.listByDate(dateKey)
    ]).then(function (results) {
      var summary = results[0]
      var list = results[1]
      var meds = (summary && summary.meds) || {}

      var lastMilk = null
      if (summary && summary.lastMilk) {
        lastMilk = {
          ts: summary.lastMilk.ts,
          time: formatTimeHM(new Date(summary.lastMilk.ts)),
          ago: timeAgoCN(summary.lastMilk.ts),
          amount: summary.lastMilk.milkAmount,
          progress: Math.min(100, Math.round((Date.now() - summary.lastMilk.ts) / (3 * 3600000) * 100))
        }
      }

      var allItems = (list.items || []).map(mapEvent)
      var medNames = []
      if (meds.AD) medNames.push("AD")
      if (meds.D3) medNames.push("D3")
      if (meds.DHA) medNames.push("DHA")
      if (meds.CALCIUM) medNames.push("钙")
      var medCount = medNames.length
      var medSummary = medCount > 0 ? medNames.join("·") : ""

      that.setData({
        summaryMilkCount: summary ? (summary.milkCount || 0) : 0,
        summaryMilkTotal: summary ? (summary.milkTotal || 0) : 0,
        summarySolidCount: summary ? (summary.solidCount || 0) : 0,
        summaryPoopCount: summary ? (summary.poopCount || 0) : 0,
        medCount: medCount,
        medSummary: medSummary,
        vaccineCount: summary ? (summary.vaccineCount || 0) : 0,
        illnessCount: summary ? (summary.illnessCount || 0) : 0,
        lastMilk: lastMilk,
        allItems: allItems
      })
      that.applyFilter()
    }).catch(function (err) {
      if (api.isFamilyRequired(err)) {
        that.setData({
          summaryMilkCount: 0, summaryMilkTotal: 0,
          summarySolidCount: 0, summaryPoopCount: 0,
          medCount: 0, medSummary: "",
          vaccineCount: 0, illnessCount: 0,
          lastMilk: null, allItems: [], filteredItems: []
        })
        return
      }
      console.error("loadData error:", err)
    })
  },

  applyFilter: function () {
    var filterActive = this.data.filterActive
    var allItems = this.data.allItems
    var filtered = allItems

    if (filterActive !== "all") {
      var parts = filterActive.split("-")
      var hStart = Number(parts[0])
      var hEnd = Number(parts[1])
      // Check for cross-midnight: "18-6" means hStart=18, hEnd=6, hStart > hEnd
      if (hStart > hEnd) {
        // Cross-midnight range: record time >= hStart OR record time < hEnd
        filtered = allItems.filter(function (item) {
          var d = new Date(item.ts)
          var h = d.getHours()
          return h >= hStart || h < hEnd
        })
      } else {
        // Normal range: record time >= hStart AND record time < hEnd
        filtered = allItems.filter(function (item) {
          var d = new Date(item.ts)
          var h = d.getHours()
          return h >= hStart && h < hEnd
        })
      }
    }
    this.setData({ filteredItems: filtered })
  },

  onFilter: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({
      filterActive: key,
      filters: buildFilters(key)
    })
    this.applyFilter()
  },

  goMilk: function () { wx.navigateTo({ url: "/pages/entry-milk/index" }) },
  goSolid: function () { wx.navigateTo({ url: "/pages/entry-solid/index" }) },
  goPoop: function () { wx.navigateTo({ url: "/pages/entry-poop/index" }) },
  goVoice: function () { wx.navigateTo({ url: "/pages/voice/index" }) },

  // Med button now shows ActionSheet
  goMed: function () {
    this.setData({ showMedSheet: true, medSheetOverlayClass: "med-sheet-overlay active" })
  },
  closeMedSheet: function () {
    this.setData({ showMedSheet: false, medSheetOverlayClass: "med-sheet-overlay" })
  },
  goMedEntry: function () {
    this.setData({ showMedSheet: false, medSheetOverlayClass: "med-sheet-overlay" })
    wx.navigateTo({ url: "/pages/entry-med/index" })
  },
  goVaccine: function () {
    this.setData({ showMedSheet: false, medSheetOverlayClass: "med-sheet-overlay" })
    wx.navigateTo({ url: "/pages/entry-vaccine/index" })
  },
  goIllness: function () {
    this.setData({ showMedSheet: false, medSheetOverlayClass: "med-sheet-overlay" })
    wx.navigateTo({ url: "/pages/entry-illness/index" })
  },

  onDeleteItem: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: "删除记录",
      content: "确定删除这条记录？",
      success: function (res) {
        if (!res.confirm) return
        api.deleteEvent(id).then(function () {
          wx.showToast({ title: "已删除", icon: "none" })
          that.loadData()
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "删除失败"), icon: "none" })
        })
      }
    })
  },

  onPullDownRefresh: function () {
    this.loadData()
    wx.stopPullDownRefresh()
  }
})
