var dateUtils = require("../../utils/date")
var monthDayCN = dateUtils.monthDayCN
var dateKeyToTs = dateUtils.dateKeyToTs

function iconFor(type) {
  if (type === "milk") return "🍼"
  if (type === "solid") return "🥣"
  if (type === "med") return "💊"
  if (type === "poop") return "💩"
  if (type === "sleep") return "😴"
  if (type === "vaccine") return "💉"
  if (type === "illness") return "🤒"
  if (type === "weight") return "⚖️"
  return "📝"
}

function describeItem(item) {
  if (item.type === "milk") {
    var fm = item.feedMethod || "奶粉"
    return fm + " " + item.milkAmount + "ml"
  }
  if (item.type === "solid") {
    var p = item.solidPortion ? "（" + item.solidPortion + "）" : ""
    return "辅食 " + item.solidItem + p
  }
  if (item.type === "med") {
    return "用药 " + (item.medNameLabel || item.medName || "")
  }
  if (item.type === "poop") {
    var amt = item.poopAmount ? " · " + item.poopAmount : ""
    return "便便 " + item.poopType + " · " + item.poopColor + amt
  }
  if (item.type === "sleep") return "睡眠 " + item.sleepEvent
  if (item.type === "vaccine") return "疫苗 " + (item.subType || "疫苗")
  if (item.type === "illness") return "生病 " + (item.subType || "不适")
  if (item.type === "weight") return "体重 " + (item.weightKg || 0) + "kg"
  return "记录"
}

function checkClass(checked) {
  return checked ? "pi-check pi-check-on" : "pi-check"
}

function dateLabel(dateKey, todayKey) {
  return dateKey === todayKey ? "今天" : monthDayCN(dateKey)
}

function buildDisplayItems(items, defaultDateKey) {
  var out = []
  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    var time = item.time || "12:00"
    var timeMissing = !!item.timeMissing
    out.push({
      index: i,
      type: item.type,
      icon: iconFor(item.type),
      desc: describeItem(item),
      dateKey: item.dateKey,
      hasOwnDate: !!item.hasOwnDate,
      time: time,
      timePickerValue: time,
      timeLabel: timeMissing ? "12:00（未识别，点此修改）" : time,
      timeMissing: timeMissing,
      timeClass: timeMissing ? "pi-time pi-time-warn" : "pi-time",
      dateLabel: monthDayCN(item.dateKey),
      showDate: !!item.hasOwnDate && item.dateKey !== defaultDateKey,
      checked: true,
      checkClass: "pi-check pi-check-on",
      checkMark: "✓",
      cardClass: "pi-item",
      raw: item
    })
  }
  return out
}

function applyDefaultDate(item, dateKey) {
  if (!item.hasOwnDate) {
    item.dateKey = dateKey
    item.dateLabel = monthDayCN(dateKey)
  }
  item.showDate = !!item.hasOwnDate && item.dateKey !== dateKey
  return item
}

function countChecked(items) {
  var n = 0
  for (var i = 0; i < items.length; i++) {
    if (items[i].checked) n++
  }
  return n
}

function buildPayload(item) {
  var raw = item.raw || {}
  var note = String(raw.note || "").trim()
  if (item.timeMissing) {
    note = note ? note + "；时间未识别，按12:00记录" : "时间未识别，按12:00记录"
  }

  var payload = {
    type: raw.type,
    dateKey: item.dateKey,
    ts: dateKeyToTs(item.dateKey, item.time),
    note: note
  }

  if (raw.type === "milk") {
    payload.milkAmount = raw.milkAmount
    payload.feedMethod = raw.feedMethod || ""
  } else if (raw.type === "solid") {
    payload.solidItem = raw.solidItem
    payload.solidPortion = raw.solidPortion || ""
  } else if (raw.type === "med") {
    payload.medName = raw.medName
  } else if (raw.type === "poop") {
    payload.poopType = raw.poopType
    payload.poopColor = raw.poopColor
    payload.poopAmount = raw.poopAmount || ""
  } else if (raw.type === "sleep") {
    payload.sleepEvent = raw.sleepEvent
  } else if (raw.type === "vaccine") {
    payload.subType = raw.subType || "疫苗"
  } else if (raw.type === "illness") {
    payload.subType = raw.subType
  } else if (raw.type === "weight") {
    payload.weightKg = raw.weightKg
  }

  return payload
}

function photoErrorMessage(text) {
  text = String(text || "")
  if (text.indexOf("ocr_credentials_missing") !== -1) {
    return "文字识别服务未配置，请联系管理员检查腾讯云密钥"
  }
  if (text.indexOf("ocr_service_unavailable") !== -1) {
    return "文字识别服务未开通，请在腾讯云控制台开通 OCR"
  }
  if (text.indexOf("ocr_empty") !== -1) {
    return "没识别到文字，请把本子拍清楚、避开反光和阴影"
  }
  if (text.indexOf("no_items") !== -1) {
    return "识别到文字，但没拆出可保存的记录。可查看原文后重新拍照"
  }
  if (text.indexOf("too_many_events") !== -1) {
    return "一次最多保存 30 条记录"
  }
  if (text.indexOf("ocr_failed") !== -1) {
    return "识别失败，请重试或换一张照片"
  }
  if (text.indexOf("llm_failed") !== -1) {
    return "记录整理失败，请重试"
  }
  if (text.indexOf("family_required") !== -1) {
    return "请先在「我的」页面创建或加入家庭"
  }
  if (text.indexOf("login_required") !== -1) {
    return "登录态失效，请退出后重新登录再试"
  }
  return "操作失败，请重试"
}

module.exports = {
  iconFor: iconFor,
  describeItem: describeItem,
  checkClass: checkClass,
  dateLabel: dateLabel,
  buildDisplayItems: buildDisplayItems,
  applyDefaultDate: applyDefaultDate,
  countChecked: countChecked,
  buildPayload: buildPayload,
  photoErrorMessage: photoErrorMessage
}
