const api = require("../../services/api")

Page({
  data: {
    joinCode: "",
    createBtnText: "创建家庭码"
  },

  onShow: function () { this.refresh() },

  refresh: function () {
    var that = this
    api.familyGet().then(function (res) {
      var code = res.joinCode || ""
      that.setData({
        joinCode: code,
        createBtnText: code ? "重新创建家庭码" : "创建家庭码"
      })
    }).catch(function (err) {
      if (api.isLoginRequired(err)) {
        wx.showToast({ title: api.friendlyMessage(err, ""), icon: "none" })
      }
      that.setData({ joinCode: "", createBtnText: "创建家庭码" })
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
            createBtnText: "重新创建家庭码"
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
        }).catch(function (err) {
          wx.showToast({ title: api.friendlyMessage(err, "加入失败"), icon: "none" })
        })
      }
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
