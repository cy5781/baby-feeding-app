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
    return { _id: e._id, type: "poop", time: time, ts: e.ts,
      desc: "便便 " + e.poopType + " · " + e.poopColor, meta: e.note || "" }
  }
  if (e.type === "sleep") {
    return { _id: e._id, type: "sleep", time: time, ts: e.ts,
      desc: "睡眠 " + e.sleepEvent, meta: e.note || "" }
  }
  return { _id: e._id, type: "", time: time, ts: e.ts, desc: "记录", meta: "" }
}

/** Build filter chip data with computed activeClass */
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
    filters: buildFilters("all"),
    filterActive: "all",
    customClass: "filter-chip",
    customLabel: "自定义",
    rangeOverlayClass: "overlay",
    allItems: [],
    filteredItems: [],
    showRange: false,
    rangeStart: "00:00",
    rangeEnd: "23:59"
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
    var rangeStart = this.data.rangeStart
    var rangeEnd = this.data.rangeEnd
    var filtered = allItems

    if (filterActive !== "all" && filterActive !== "custom") {
      var parts = filterActive.split("-")
      var hStart = Number(parts[0])
      var hEnd = Number(parts[1])
      filtered = allItems.filter(function (item) {
        var d = new Date(item.ts)
        var h = d.getHours()
        return h >= hStart && h < hEnd
      })
    } else if (filterActive === "custom") {
      var sm = timeToMin(rangeStart)
      var em = timeToMin(rangeEnd)
      filtered = allItems.filter(function (item) {
        var d = new Date(item.ts)
        var m = d.getHours() * 60 + d.getMinutes()
        return em >= sm ? (m >= sm && m <= em) : (m >= sm || m <= em)
      })
    }
    this.setData({ filteredItems: filtered })
  },

  onFilter: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({
      filterActive: key,
      filters: buildFilters(key),
      customClass: "filter-chip",
      customLabel: "自定义"
    })
    this.applyFilter()
  },

  onCustomRange: function () {
    this.setData({ showRange: true, rangeOverlayClass: "overlay active" })
  },

  closeRange: function () {
    this.setData({ showRange: false, rangeOverlayClass: "overlay" })
  },

  onRangeStart: function (e) {
    this.setData({ rangeStart: e.detail.value })
  },

  onRangeEnd: function (e) {
    this.setData({ rangeEnd: e.detail.value })
  },

  applyCustomRange: function () {
    var rangeStart = this.data.rangeStart
    var rangeEnd = this.data.rangeEnd
    this.setData({
      filterActive: "custom",
      filters: buildFilters("custom"),
      customClass: "filter-chip active",
      customLabel: rangeStart + "–" + rangeEnd,
      showRange: false,
      rangeOverlayClass: "overlay"
    })
    this.applyFilter()
  },

  goMilk: function () { wx.navigateTo({ url: "/pages/entry-milk/index" }) },
  goSolid: function () { wx.navigateTo({ url: "/pages/entry-solid/index" }) },
  goMed: function () { wx.navigateTo({ url: "/pages/entry-med/index" }) },
  goPoop: function () { wx.navigateTo({ url: "/pages/entry-poop/index" }) },
  goVoice: function () { wx.navigateTo({ url: "/pages/voice/index" }) },

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

function timeToMin(t) {
  var parts = t.split(":")
  return Number(parts[0]) * 60 + Number(parts[1])
}
