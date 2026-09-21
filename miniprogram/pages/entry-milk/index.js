var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToOffset = dateUtils.dateKeyToOffset
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN
var MILK_QUICK = require("../../utils/constants").MILK_QUICK

var FEED_METHODS = [
  { key: "母乳", label: "🤱 母乳" },
  { key: "混合", label: "🔄 混合" },
  { key: "奶粉", label: "🍼 奶粉" }
]

function buildQuick(amount) {
  return MILK_QUICK.map(function (v) {
    return {
      value: v,
      chipClass: v === amount ? "chip chip-active" : "chip"
    }
  })
}

function buildMethods(selected) {
  return FEED_METHODS.map(function (m) {
    return {
      key: m.key,
      label: m.label,
      chipClass: m.key === selected ? "chip chip-active" : "chip"
    }
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

function timeFromTs(ts) {
  var d = new Date(ts)
  var h = d.getHours()
  var m = d.getMinutes()
  return (h < 10 ? "0" + h : "" + h) + ":" + (m < 10 ? "0" + m : "" + m)
}

Page({
  data: {
    amount: 130,
    feedMethod: "",
    methods: buildMethods(""),
    note: "",
    quick: buildQuick(130),
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0, false),
    customDateMode: false,
    customDateKey: todayKey(),
    customDateLabel: "自定义",
    customChipClass: "chip",
    todayKey: todayKey(),
    customTime: defaultTime(),
    editId: ""
  },

  onLoad: function (options) {
    if (!options || !options.editId) return
    var editId = options.editId
    var amount = parseInt(options.milkAmount, 10) || 130
    var feedMethod = decodeURIComponent(options.feedMethod || "")
    var note = decodeURIComponent(options.note || "")
    var dateKey = options.dateKey || ""
    var ts = parseInt(options.ts, 10) || 0
    var offset = dateKey ? dateKeyToOffset(dateKey) : 0
    var timeStr = ts ? timeFromTs(ts) : defaultTime()

    var editData = {
      editId: editId,
      amount: amount,
      feedMethod: feedMethod,
      methods: buildMethods(feedMethod),
      quick: buildQuick(amount),
      note: note,
      customTime: timeStr
    }
    if (offset === 0 || offset === -1 || offset === -2 || offset === -3) {
      editData.dateOffset = offset
      editData.dateOffsets = buildDateOffsets(offset, false)
    } else {
      editData.dateOffset = offset
      editData.dateOffsets = buildDateOffsets(offset, true)
      editData.customDateMode = true
      editData.customDateKey = dateKey
      editData.customDateLabel = monthDayCN(dateKey)
      editData.customChipClass = "chip chip-active"
    }
    this.setData(editData)
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

  pickMethod: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ feedMethod: key, methods: buildMethods(key) })
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
    var amount = parseInt(this.data.amount, 10)
    if (!amount) {
      wx.showToast({ title: "请选择奶量", icon: "none" })
      return
    }
    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
    var payload = {
      type: "milk",
      dateKey: dt.dateKey,
      ts: dt.ts,
      milkAmount: amount,
      feedMethod: this.data.feedMethod || "",
      note: this.data.note || ""
    }
    var that = this

    if (this.data.editId) {
      api.updateEvent(this.data.editId, payload).then(function () {
        wx.showToast({ title: "已更新", icon: "success" })
        wx.navigateBack()
      }).catch(function (err) {
        wx.showToast({ title: api.friendlyMessage(err, "更新失败"), icon: "none" })
      })
    } else {
      api.addEvent(payload).then(function () {
        wx.showToast({ title: "已保存", icon: "success" })
        wx.navigateBack()
      }).catch(function (err) {
        wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
      })
    }
  }
})
