var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var offsetToDateKey = dateUtils.offsetToDateKey
var dateKeyToTs = dateUtils.dateKeyToTs
var todayKey = dateUtils.todayKey
var monthDayCN = dateUtils.monthDayCN

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

Page({
  data: {
    vaccineName: "",
    imagePath: "",
    imageUrl: "",
    uploading: false,
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

  /* ---- Photo upload ---- */
  takePhoto: function () {
    var that = this
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success: function (res) {
        var tempPath = res.tempFilePaths[0]
        that.setData({ imagePath: tempPath, uploading: true })
        that.uploadImage(tempPath)
      },
      fail: function () {
        // User cancelled
      }
    })
  },

  uploadImage: function (tempPath) {
    var that = this
    var cloudPath = "vaccine/" + Date.now() + ".jpg"
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempPath,
      success: function (res) {
        that.setData({ imageUrl: res.fileID, uploading: false })
        wx.showToast({ title: "照片已上传", icon: "success" })
      },
      fail: function () {
        that.setData({ uploading: false })
        wx.showToast({ title: "上传失败，请重试", icon: "none" })
      }
    })
  },

  removePhoto: function () {
    this.setData({ imagePath: "", imageUrl: "" })
  },

  /* ---- Vaccine name input ---- */
  onVaccineName: function (e) {
    this.setData({ vaccineName: e.detail.value })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  /* ---- Date/time ---- */
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

  /* ---- Save ---- */
  save: function () {
    var vaccineName = String(this.data.vaccineName || "").trim()
    var imageUrl = String(this.data.imageUrl || "").trim()

    if (!vaccineName && !imageUrl) {
      wx.showToast({ title: "请拍照或输入疫苗名称", icon: "none" })
      return
    }

    var dateKey = this.data.customDateMode
      ? this.data.customDateKey
      : offsetToDateKey(this.data.dateOffset)
    var dt = buildDateTime(dateKey, this.data.customTime)
    var that = this
    api.addEvent({
      type: "vaccine",
      dateKey: dt.dateKey,
      ts: dt.ts,
      subType: vaccineName || "疫苗",
      imageUrl: imageUrl,
      note: this.data.note || ""
    }).then(function () {
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    }).catch(function (err) {
      wx.showToast({ title: api.friendlyMessage(err, "保存失败"), icon: "none" })
    })
  }
})
