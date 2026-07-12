const api = require("../../services/api")
const { todayKey } = require("../../utils/date")
const { SOLID_PRESETS, SOLID_PORTIONS } = require("../../utils/constants")

function buildPresets(selected) {
  return SOLID_PRESETS.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

function buildPortions(selected) {
  return SOLID_PORTIONS.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

Page({
  data: {
    presets: buildPresets(""),
    portions: buildPortions(""),
    solidItem: "",
    solidPortion: "",
    note: ""
  },

  pick: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ solidItem: val, presets: buildPresets(val) })
  },

  pickPortion: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ solidPortion: val, portions: buildPortions(val) })
  },

  onSolidItem: function (e) {
    var val = e.detail.value
    this.setData({ solidItem: val, presets: buildPresets(val) })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  save: function () {
    var solidItem = String(this.data.solidItem || "").trim()
    if (!solidItem) {
      wx.showToast({ title: "请选择辅食内容", icon: "none" })
      return
    }
    var that = this
    api.addEvent({
      type: "solid",
      dateKey: todayKey(),
      ts: Date.now(),
      solidItem: solidItem,
      solidPortion: this.data.solidPortion || "",
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
