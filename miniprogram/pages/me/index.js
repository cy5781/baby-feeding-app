var api = require("../../services/api")

Page({
  data: {
    joinCode: "",
    createBtnText: "创建家庭码",
    memberCount: 0
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var that = this
    api.familyGet().then(function (res) {
      var code = res.joinCode || ""
      var count = (res.memberCount) || 1
      that.setData({
        joinCode: code,
        createBtnText: code ? "重新创建家庭码" : "创建家庭码",
        memberCount: count
      })
    }).catch(function (err) {
      if (api.isLoginRequired(err)) {
        wx.showToast({ title: api.friendlyMessage(err, ""), icon: "none" })
      }
      that.setData({ joinCode: "", createBtnText: "创建家庭码", memberCount: 0 })
    })
  },

  copyCode: function () {
    var code = this.data.joinCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: "已复制家庭码", icon: "success" })
      }
    })
  },

  createFamily: function () {
    var that = this
    wx.showModal({
      title: "创建家庭码",
      content: "创建后可让家人加入，共享记录",
      success: function (res) {
        if (!res.confirm) return
        api.familyCreate().then(function (r) {
          wx.showToast({ title: "已创建", icon: "success" })
          that.setData({
            joinCode: r.joinCode,
            createBtnText: "重新创建家庭码",
            memberCount: 1
          })
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "创建失败"), icon: "none" })
        })
      }
    })
  },

  openJoin: function () {
    var that = this
    wx.showModal({
      title: "加入家庭码",
      editable: true,
      placeholderText: "请输入家庭码",
      success: function (res) {
        if (!res.confirm) return
        var code = String(res.content || "").trim().toUpperCase()
        if (!code) {
          wx.showToast({ title: "请输入家庭码", icon: "none" })
          return
        }
        api.familyJoin(code).then(function (r) {
          wx.showToast({ title: "已加入", icon: "success" })
          that.setData({
            joinCode: r.joinCode,
            createBtnText: "重新创建家庭码"
          })
          that.refresh()
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "加入失败"), icon: "none" })
        })
      }
    })
  },

  exportData: function () {
    wx.showLoading({ title: "生成中..." })
    var that = this

    // Collect last 7 days of data for export
    var dateUtils = require("../../utils/date")
    var todayKey = dateUtils.todayKey
    var addDays = dateUtils.addDays

    var keys = []
    var d = new Date()
    for (var i = 6; i >= 0; i--) {
      var d2 = new Date(d)
      d2.setDate(d2.getDate() - i)
      keys.push(dateUtils.formatDateKey(d2))
    }

    // Fetch summaries for all 7 days
    var promises = keys.map(function (k) {
      return api.dailySummary(k).catch(function () { return null })
    })

    Promise.all(promises).then(function (summaries) {
      wx.hideLoading()

      // Build a text-based summary for clipboard (export as text)
      var lines = ["📋 宝宝喂养记录导出", "=========================", ""]
      for (var j = 0; j < keys.length; j++) {
        var s = summaries[j]
        if (!s) continue
        var milkTotal = s.milkTotal || 0
        var milkCount = s.milkCount || 0
        var solidCount = s.solidCount || 0
        var poopCount = s.poopCount || 0
        if (milkCount === 0 && solidCount === 0 && poopCount === 0) continue
        lines.push(keys[j])
        if (milkCount > 0) lines.push("  🍼 喝奶 " + milkCount + "次 · " + milkTotal + "ml")
        if (solidCount > 0) lines.push("  🥣 辅食 " + solidCount + "次")
        if (poopCount > 0) lines.push("  💩 便便 " + poopCount + "次")
      }

      var text = lines.join("\n")

      wx.setClipboardData({
        data: text,
        success: function () {
          wx.showToast({ title: "已复制到剪贴板，可粘贴发给医生", icon: "none", duration: 2500 })
        }
      })
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: "导出失败", icon: "none" })
    })
  },

  clearData: function () {
    wx.showModal({
      title: "清空数据",
      content: "会删除家庭下全部记录，无法恢复",
      success: function (res) {
        if (!res.confirm) return
        api.clearAll().then(function () {
          wx.showToast({ title: "已清空", icon: "success" })
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "清空失败"), icon: "none" })
        })
      }
    })
  }
})
