const api = require("../../services/api")
var dateUtils = require("../../utils/date")
var todayKey = dateUtils.todayKey
var formatTimeHM = dateUtils.formatTimeHM
var weekdayCN = dateUtils.weekdayCN
var monthDayCN = dateUtils.monthDayCN
var timeAgoCN = dateUtils.timeAgoCN
const { TIME_FILTERS } = require("../../utils/constants")

function mapEvent(e) {
  var time = formatTimeHM(new Date(e.ts))
  if (e.type === "milk") {
    var fm = e.feedMethod || "奶粉"
    return { _id: e._id, type: "milk", time: time, ts: e.ts,
      desc: fm + " " + e.milkAmount + "ml", meta: e.note || "" }
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
    yesterdayText: "",
    lastMilkReminder: "",
    lastMilkCardClass: "last-feed-card",
    rawEvents: [],
    showEditSheet: false,
    editSheetClass: "med-sheet-overlay",
    editingItem: null,
    filters: buildFilters("all"),
    filterActive: "all",
    allItems: [],
    filteredItems: [],
    showMedSheet: false,
    medSheetOverlayClass: "med-sheet-overlay",
    showOnboarding: false,
    onboardingClass: "onboarding-overlay"
  },

  onShow: function () {
    try {
      var dateKey = todayKey()
      this.setData({
        monthDay: monthDayCN(dateKey),
        weekday: weekdayCN(dateKey)
      })
      this.loadData()
      // Onboarding check
      var done = wx.getStorageSync("onboarding_done_v2")
      if (!done) {
        this.setData({ showOnboarding: true, onboardingClass: "onboarding-overlay active" })
      }
    } catch (e) {
      console.error("onShow error:", e)
    }
  },

  closeOnboarding: function () {
    wx.setStorageSync("onboarding_done_v2", true)
    this.setData({ showOnboarding: false, onboardingClass: "onboarding-overlay" })
  },

  loadData: function () {
    var dateKey = todayKey()
    var yesterdayKey = dateUtils.addDays(dateKey, -1)
    var that = this
    Promise.all([
      api.dailySummary(dateKey),
      api.listByDate(dateKey),
      api.dailySummary(yesterdayKey)
    ]).then(function (results) {
      var summary = results[0]
      var list = results[1]
      var yesterdaySummary = results[2]
      var meds = (summary && summary.meds) || {}
      var rawEvents = (list && list.items) || []

      var lastMilk = null
      var reminder = ""
      var cardClass = "last-feed-card"
      if (summary && summary.lastMilk) {
        var elapsed = Date.now() - summary.lastMilk.ts
        var progress = Math.min(100, Math.round(elapsed / (3 * 3600000) * 100))
        lastMilk = {
          ts: summary.lastMilk.ts,
          time: formatTimeHM(new Date(summary.lastMilk.ts)),
          ago: timeAgoCN(summary.lastMilk.ts),
          amount: summary.lastMilk.milkAmount,
          progress: progress
        }
        // Feeding reminder: >3h → warn
        if (elapsed > 3 * 3600000) {
          reminder = "⚠️ 宝宝可能该喝奶了"
          cardClass = "last-feed-card last-feed-card-warn"
        } else if (elapsed > 2.5 * 3600000) {
          reminder = "⏰ 快该喝奶了"
          cardClass = "last-feed-card last-feed-card-hint"
        }
      }

      var allItems = rawEvents.map(mapEvent).reverse()
      var medNames = []
      if (meds.AD) medNames.push("AD")
      if (meds.D3) medNames.push("D3")
      if (meds.DHA) medNames.push("DHA")
      if (meds.CALCIUM) medNames.push("钙")
      var medCount = medNames.length
      var medSummary = medCount > 0 ? medNames.join("·") : ""

      // Yesterday summary text
      var yesterdayText = ""
      if (yesterdaySummary) {
        var parts = []
        if (yesterdaySummary.milkCount > 0) parts.push("🍼" + yesterdaySummary.milkCount + "次·" + (yesterdaySummary.milkTotal || 0) + "ml")
        if (yesterdaySummary.solidCount > 0) parts.push("🥣" + yesterdaySummary.solidCount + "次")
        if (yesterdaySummary.poopCount > 0) parts.push("💩" + yesterdaySummary.poopCount + "次")
        if (parts.length > 0) yesterdayText = "昨天 " + parts.join("  ")
      }

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
        lastMilkReminder: reminder,
        lastMilkCardClass: cardClass,
        yesterdayText: yesterdayText,
        allItems: allItems,
        rawEvents: rawEvents
      })
      that.applyFilter()
    }).catch(function (err) {
      if (api.isFamilyRequired(err)) {
        that.setData({
          summaryMilkCount: 0, summaryMilkTotal: 0,
          summarySolidCount: 0, summaryPoopCount: 0,
          medCount: 0, medSummary: "",
          vaccineCount: 0, illnessCount: 0,
          yesterdayText: "", lastMilkReminder: "",
          lastMilk: null, allItems: [], filteredItems: [], rawEvents: []
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

  goMilk: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/entry-milk/index" }) },
  goSolid: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/entry-solid/index" }) },
  goPoop: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/entry-poop/index" }) },
  goSleep: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/entry-sleep/index" }) },
  goWeight: function () { wx.vibrateShort({ type: "light" }); wx.switchTab({ url: "/pages/stats/index" }) },
  goVoice: function () { wx.vibrateShort({ type: "light" }); wx.navigateTo({ url: "/pages/voice/index" }) },

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

  onItemAction: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    // Find raw event data
    var rawEvents = this.data.rawEvents
    var event = null
    for (var i = 0; i < rawEvents.length; i++) {
      if (rawEvents[i]._id === id) { event = rawEvents[i]; break }
    }
    this.setData({ editingItem: event, showEditSheet: true, editSheetClass: "med-sheet-overlay active" })
  },

  closeEditSheet: function () {
    this.setData({ showEditSheet: false, editSheetClass: "med-sheet-overlay", editingItem: null })
  },

  doEdit: function () {
    var event = this.data.editingItem
    if (!event) return
    this.setData({ showEditSheet: false, editSheetClass: "med-sheet-overlay" })

    // Navigate to the appropriate entry page with edit params
    var baseParams = "?editId=" + (event._id || "") + "&dateKey=" + (event.dateKey || "") + "&note=" + encodeURIComponent(event.note || "")
    var url = ""
    if (event.type === "milk") {
      url = "/pages/entry-milk/index" + baseParams + "&milkAmount=" + (event.milkAmount || 130) + "&feedMethod=" + encodeURIComponent(event.feedMethod || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "solid") {
      url = "/pages/entry-solid/index" + baseParams + "&solidItem=" + encodeURIComponent(event.solidItem || "") + "&solidPortion=" + encodeURIComponent(event.solidPortion || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "med") {
      url = "/pages/entry-med/index" + baseParams + "&medName=" + encodeURIComponent(event.medName || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "poop") {
      url = "/pages/entry-poop/index" + baseParams + "&poopType=" + encodeURIComponent(event.poopType || "") + "&poopColor=" + encodeURIComponent(event.poopColor || "") + "&poopAmount=" + encodeURIComponent(event.poopAmount || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "sleep") {
      url = "/pages/entry-sleep/index" + baseParams + "&sleepEvent=" + encodeURIComponent(event.sleepEvent || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "vaccine") {
      url = "/pages/entry-vaccine/index" + baseParams + "&subType=" + encodeURIComponent(event.subType || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "illness") {
      url = "/pages/entry-illness/index" + baseParams + "&subType=" + encodeURIComponent(event.subType || "") + "&ts=" + (event.ts || "")
    } else if (event.type === "weight") {
      url = "/pages/stats/index"
    }
    if (url) wx.navigateTo({ url: url })
  },

  doDelete: function () {
    var event = this.data.editingItem
    if (!event) return
    var id = event._id
    var that = this
    this.setData({ showEditSheet: false, editSheetClass: "med-sheet-overlay", editingItem: null })
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
