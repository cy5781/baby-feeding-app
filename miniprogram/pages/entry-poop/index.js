const api = require("../../services/api")
const { todayKey } = require("../../utils/date")
const { POOP_TYPES, POOP_COLORS } = require("../../utils/constants")

function buildTypes(selected) {
  return POOP_TYPES.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

function buildColors(selected) {
  return POOP_COLORS.map(function (v) {
    return { value: v, chipClass: v === selected ? "chip chip-active" : "chip" }
  })
}

Page({
  data: {
    types: buildTypes(""),
    colors: buildColors(""),
    poopType: "",
    poopColor: "",
    note: ""
  },

  pickType: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ poopType: val, types: buildTypes(val) })
  },

  pickColor: function (e) {
    var val = e.currentTarget.dataset.val
    this.setData({ poopColor: val, colors: buildColors(val) })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  save: function () {
    if (!this.data.poopType) {
      wx.showToast({ title: "请选择类型", icon: "none" })
      return
    }
    if (!this.data.poopColor) {
      wx.showToast({ title: "请选择颜色", icon: "none" })
      return
    }
    var that = this
    api.addEvent({
      type: "poop",
      dateKey: todayKey(),
      ts: Date.now(),
      poopType: this.data.poopType,
      poopColor: this.data.poopColor,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
