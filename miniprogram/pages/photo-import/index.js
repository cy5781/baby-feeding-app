var api = require("../../services/api")
var dateUtils = require("../../utils/date")
var helpers = require("./helpers")

var todayKey = dateUtils.todayKey

function copyItem(item) {
  var out = {}
  for (var k in item) out[k] = item[k]
  return out
}

function photoErrorMessage(err) {
  return helpers.photoErrorMessage(api.errorText(err))
}

Page({
  data: {
    imagePath: "",
    fileID: "",
    stage: "idle",
    stageText: "",
    items: [],
    checkedCount: 0,
    saveButtonText: "保存记录",
    saveDisabled: true,
    detectedDate: "",
    defaultDateKey: todayKey(),
    defaultDateLabel: "今天",
    todayKey: todayKey(),
    rawText: "",
    showRaw: false,
    rawToggleText: "查看识别原文",
    saving: false,
    errorText: "",
    showCapture: true,
    showPreview: false,
    showResult: false,
    showError: false,
    showRetry: false
  },

  onLoad: function () {
    this._fileDeleted = false
    this._saving = false
  },

  onUnload: function () {
    this.stopStageTimer()
    this.cleanupPhoto()
  },

  stopStageTimer: function () {
    if (this._stageTimer) {
      clearTimeout(this._stageTimer)
      this._stageTimer = null
    }
  },

  choosePhoto: function () {
    var that = this
    wx.chooseImage({
      count: 1,
      sizeType: ["compressed"],
      sourceType: ["camera", "album"],
      success: function (res) {
        var path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        that.stopStageTimer()
        that.cleanupPhoto()
        that._fileDeleted = false
        that.setData({
          imagePath: path,
          fileID: "",
          stage: "uploading",
          stageText: "正在上传照片…",
          items: [],
          checkedCount: 0,
          saveButtonText: "保存记录",
          saveDisabled: true,
          detectedDate: "",
          defaultDateKey: that.data.todayKey,
          defaultDateLabel: "今天",
          rawText: "",
          showRaw: false,
          rawToggleText: "查看识别原文",
          errorText: "",
          showCapture: false,
          showPreview: true,
          showResult: false,
          showError: false,
          showRetry: false
        })
        that.uploadPhoto(path)
      },
      fail: function () {}
    })
  },

  uploadPhoto: function (path) {
    var that = this
    var cloudPath = "photo-import/" + Date.now() + ".jpg"
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: path,
      success: function (res) {
        that._fileDeleted = false
        that.setData({ fileID: res.fileID })
        that.parsePhoto(res.fileID)
      },
      fail: function () {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "照片上传失败，请重试",
          showError: true,
          showRetry: false
        })
      }
    })
  },

  parsePhoto: function (fileID) {
    var that = this
    this.stopStageTimer()
    this.setData({
      stage: "parsing",
      stageText: "正在识别手写内容…",
      errorText: "",
      showError: false,
      showResult: false,
      showRetry: false
    })
    this._stageTimer = setTimeout(function () {
      that.setData({ stageText: "正在整理记录…" })
    }, 3000)
    wx.showLoading({ title: "识别中", mask: true })

    api.photoParse(fileID, this.data.todayKey).then(function (res) {
      wx.hideLoading()
      that.stopStageTimer()
      if (!res) throw new Error("empty_response")
      if (res.error === "ocr_empty") {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "没识别到文字，请把本子拍清楚、避开反光和阴影",
          rawText: res.rawText || "",
          showError: true,
          showRetry: true
        })
        return
      }
      if (res.error === "no_items") {
        that.setData({
          stage: "error",
          stageText: "",
          errorText: "识别到文字，但没拆出可保存的记录。可查看原文后重新拍照",
          rawText: res.rawText || "",
          showRaw: true,
          rawToggleText: "收起识别原文",
          showError: true,
          showRetry: true
        })
        return
      }
      that.applyParsed(res)
    }).catch(function (err) {
      wx.hideLoading()
      that.stopStageTimer()
      that.setData({
        stage: "error",
        stageText: "",
        errorText: photoErrorMessage(err),
        showError: true,
        showRetry: !!fileID
      })
    })
  },

  retryParse: function () {
    if (!this.data.fileID) {
      this.choosePhoto()
      return
    }
    this.parsePhoto(this.data.fileID)
  },

  applyParsed: function (res) {
    var defaultDateKey = this.data.todayKey
    if (res.detectedDate) defaultDateKey = res.detectedDate

    var items = helpers.buildDisplayItems(res.items || [], defaultDateKey)
    var count = helpers.countChecked(items)
    var saveText = count > 0 ? "保存 " + count + " 条记录" : "保存记录"

    this.setData({
      stage: "done",
      stageText: "",
      items: items,
      checkedCount: count,
      saveButtonText: saveText,
      saveDisabled: count === 0,
      detectedDate: res.detectedDate || "",
      defaultDateKey: defaultDateKey,
      defaultDateLabel: helpers.dateLabel(defaultDateKey, this.data.todayKey),
      rawText: res.rawText || "",
      showRaw: false,
      rawToggleText: "查看识别原文",
      errorText: "",
      showCapture: false,
      showPreview: true,
      showResult: true,
      showError: false,
      showRetry: false
    })
  },

  onTimeChange: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var time = e.detail.value
    var items = this.data.items.slice()
    if (isNaN(index) || !items[index]) return
    var item = copyItem(items[index])
    item.time = time
    item.timePickerValue = time
    item.timeLabel = time
    item.timeMissing = false
    item.timeClass = "pi-time"
    items[index] = item
    this.setData({ items: items })
  },

  onDefaultDateChange: function (e) {
    var dateKey = e.detail.value
    var items = this.data.items.slice()
    for (var i = 0; i < items.length; i++) {
      items[i] = helpers.applyDefaultDate(copyItem(items[i]), dateKey)
    }
    this.setData({
      defaultDateKey: dateKey,
      defaultDateLabel: helpers.dateLabel(dateKey, this.data.todayKey),
      items: items
    })
  },

  toggleItem: function (e) {
    var index = parseInt(e.currentTarget.dataset.index, 10)
    var items = this.data.items.slice()
    if (isNaN(index) || !items[index]) return
    var item = copyItem(items[index])
    item.checked = !item.checked
    item.checkClass = helpers.checkClass(item.checked)
    item.checkMark = item.checked ? "✓" : ""
    item.cardClass = item.checked ? "pi-item" : "pi-item pi-item-off"
    items[index] = item

    var count = helpers.countChecked(items)
    this.setData({
      items: items,
      checkedCount: count,
      saveButtonText: count > 0 ? "保存 " + count + " 条记录" : "保存记录",
      saveDisabled: count === 0
    })
  },

  toggleRaw: function () {
    var show = !this.data.showRaw
    this.setData({
      showRaw: show,
      rawToggleText: show ? "收起识别原文" : "查看识别原文"
    })
  },

  retake: function () {
    this.stopStageTimer()
    this.cleanupPhoto()
    this.setData({
      imagePath: "",
      fileID: "",
      stage: "idle",
      stageText: "",
      items: [],
      checkedCount: 0,
      saveButtonText: "保存记录",
      saveDisabled: true,
      detectedDate: "",
      defaultDateKey: this.data.todayKey,
      defaultDateLabel: "今天",
      rawText: "",
      showRaw: false,
      rawToggleText: "查看识别原文",
      saving: false,
      errorText: "",
      showCapture: true,
      showPreview: false,
      showResult: false,
      showError: false,
      showRetry: false
    })
    this.choosePhoto()
  },

  save: function () {
    if (this.data.saving) return

    var selected = []
    for (var i = 0; i < this.data.items.length; i++) {
      if (this.data.items[i].checked) selected.push(this.data.items[i])
    }
    if (!selected.length) {
      wx.showToast({ title: "请至少选择一条", icon: "none" })
      return
    }

    var payloads = []
    for (var j = 0; j < selected.length; j++) {
      payloads.push(helpers.buildPayload(selected[j]))
    }

    var that = this
    this.setData({ saving: true, saveButtonText: "保存中…" })

    api.addEventsBatch(payloads).then(function (res) {
      var saved = (res && res.saved) || 0
      var failed = res && res.failed ? res.failed.length : 0
      if (saved === 0) {
        that.setData({
          saving: false,
          saveButtonText: "保存 " + selected.length + " 条记录"
        })
        wx.showToast({ title: "保存失败，请重试", icon: "none" })
        return
      }
      if (failed > 0) {
        wx.showToast({ title: "已保存 " + saved + " 条，" + failed + " 条未保存", icon: "none" })
      } else {
        wx.showToast({ title: "已保存 " + saved + " 条", icon: "success" })
      }
      that.cleanupPhoto()
      setTimeout(function () {
        wx.navigateBack()
      }, 600)
    }).catch(function (err) {
      that.setData({
        saving: false,
        saveButtonText: "保存 " + selected.length + " 条记录"
      })
      wx.showToast({ title: photoErrorMessage(err), icon: "none" })
    })
  },

  cleanupPhoto: function () {
    var fileID = this.data.fileID
    if (!fileID || this._fileDeleted) return
    this._fileDeleted = true
    wx.cloud.deleteFile({
      fileList: [fileID],
      fail: function () {}
    })
  }
})
