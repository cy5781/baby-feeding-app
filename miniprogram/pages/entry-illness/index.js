var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN

var ILLNESS_TYPES = [
  { key: "fever", label: "发烧", icon: "🤒", bgClass: "ill-card-fever" },
  { key: "cough", label: "咳嗽/流涕", icon: "🤧", bgClass: "ill-card-cough" },
  { key: "vomit", label: "呕吐/腹泻", icon: "🤮", bgClass: "ill-card-vomit" },
  { key: "other", label: "其他症状", icon: "✏️", bgClass: "ill-card-other" }
]

function buildIllnessCards(selected) {
  return ILLNESS_TYPES.map(function (item) {
    var card = {
      key: item.key,
      label: item.label,
      icon: item.icon
    }
    card.cardClass = item.key === selected
      ? "illness-card " + item.bgClass + " illness-card-selected"
      : "illness-card " + item.bgClass
    return card
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

function getLabelByKey(key) {
  for (var i = 0; i < ILLNESS_TYPES.length; i++) {
    if (ILLNESS_TYPES[i].key === key) return ILLNESS_TYPES[i].label
  }
  return key
}

Page({
  data: {
    cards: buildIllnessCards(""),
    illnessType: "",
    illnessLabel: "",
    otherText: "",
    dateOffset: 0,
    dateOffsets: buildDateOffsets(0, false),
    customDateMode: false,
    customDateKey: todayKey(),
    customDateLabel: "自定义",
    customChipClass: "chip",
    todayKey: todayKey(),
    customTime: defaultTime(),
    note: ""
  },

  pickIllness: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({
      illnessType: key,
      illnessLabel: getLabelByKey(key),
      cards: buildIllnessCards(key)
    })
  },

  onOtherText: function (e) {
    this.setData({ otherText: e.detail.value })
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
    var illnessType = this.data.illnessType
    if (!illnessType) {
      wx.showToast({ title: "请选择一种症状", icon: "none" })
      return
    }

    // For "other", use the custom text as label
    var subType = illnessType
    if (illnessType === "other") {
      var otherText = String(this.data.otherText || "").trim()
      if (!otherText) {
        wx.showToast({ title: "请输入症状描述", icon: "none" })
        return
      }
      subType = otherText
    }

    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
    var that = this
    api.addEvent({
      type: "illness",
      dateKey: dt.dateKey,
      ts: dt.ts,
      subType: subType,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
