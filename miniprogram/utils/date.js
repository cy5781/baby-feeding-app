function pad2(n) {
  return n < 10 ? "0" + n : "" + n
}

function formatDateKey(d) {
  var y = d.getFullYear()
  var m = pad2(d.getMonth() + 1)
  var day = pad2(d.getDate())
  return y + "-" + m + "-" + day
}

function formatTimeHM(d) {
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes())
}

function todayKey() {
  return formatDateKey(new Date())
}

function addDays(dateKey, deltaDays) {
  var parts = dateKey.split("-")
  var y = parseInt(parts[0], 10)
  var m = parseInt(parts[1], 10)
  var d = parseInt(parts[2], 10)
  var dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return formatDateKey(dt)
}

function weekdayCN(dateKey) {
  var parts = dateKey.split("-")
  var y = parseInt(parts[0], 10)
  var m = parseInt(parts[1], 10)
  var d = parseInt(parts[2], 10)
  var dt = new Date(y, m - 1, d)
  var days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
  return days[dt.getDay()]
}

function monthDayCN(dateKey) {
  var parts = dateKey.split("-")
  var m = parseInt(parts[1], 10)
  var d = parseInt(parts[2], 10)
  return m + "月" + d + "日"
}

function timeAgoCN(ts) {
  var diffMs = Date.now() - ts
  if (diffMs < 0) return "刚刚"
  var totalMin = Math.floor(diffMs / 60000)
  if (totalMin < 1) return "刚刚"
  if (totalMin < 60) return totalMin + "分钟前"
  var h = Math.floor(totalMin / 60)
  var m = totalMin % 60
  if (m === 0) return h + "小时前"
  return h + "小时" + m + "分前"
}

module.exports = {
  formatDateKey: formatDateKey,
  formatTimeHM: formatTimeHM,
  todayKey: todayKey,
  addDays: addDays,
  weekdayCN: weekdayCN,
  monthDayCN: monthDayCN,
  timeAgoCN: timeAgoCN
}
