const api = require("../../services/api")
const { todayKey } = require("../../utils/date")
const { MED_PRESETS } = require("../../utils/constants")

function buildPresets(selected) {
  return MED_PRESETS.map(function (m) {
    return {
      key: m.key,
      label: m.label,
      chipClass: m.key === selected ? "chip chip-active" : "chip"
    }
  })
}

Page({
  data: {
    presets: buildPresets(""),
    medName: "",
    note: ""
  },

  pick: function (e) {
    var key = e.currentTarget.dataset.key
    this.setData({ medName: key, presets: buildPresets(key) })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  save: function () {
    var medName = this.data.medName
    if (!medName) {
      wx.showToast({ title: "请选择一种用药", icon: "none" })
      return
    }
    var that = this
    api.addEvent({
      type: "med",
      dateKey: todayKey(),
      ts: Date.now(),
      medName: medName,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
