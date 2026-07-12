const api = require("../../services/api")
const { todayKey } = require("../../utils/date")
const { MILK_QUICK } = require("../../utils/constants")

function buildQuick(amount) {
  return MILK_QUICK.map(function (v) {
    return {
      value: v,
      chipClass: v === amount ? "chip chip-active" : "chip"
    }
  })
}

Page({
  data: {
    amount: 130,
    note: "",
    quick: buildQuick(130)
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

  onAmount: function (e) {
    var amount = parseInt(e.detail.value, 10) || 0
    this.setData({ amount: amount, quick: buildQuick(amount) })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  save: function () {
    var amount = parseInt(this.data.amount, 10)
    if (!amount) {
      wx.showToast({ title: "请选择奶量", icon: "none" })
      return
    }
    var that = this
    api.addEvent({
      type: "milk",
      dateKey: todayKey(),
      ts: Date.now(),
      milkAmount: amount,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
