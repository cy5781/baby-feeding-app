function call(name, data) {
  return wx.cloud.callFunction({ name: name, data: data }).then(function (res) {
    return res.result
  })
}

function errorText(err) {
  if (!err) return ""
  if (typeof err === "string") return err
  return String(err.errMsg || err.message || "").trim()
}

function isFamilyRequired(err) {
  return errorText(err).indexOf("family_required") !== -1
}

function isLoginRequired(err) {
  var t = errorText(err)
  return t.indexOf("login_required") !== -1 || t.indexOf("需要重新登录") !== -1
}

function isCloudDisabled(err) {
  var t = errorText(err)
  return t.indexOf("-601034") !== -1 || t.indexOf("开通云开发") !== -1 || t.indexOf("cloud.callFunction") !== -1
}

function friendlyMessage(err, fallback) {
  if (isLoginRequired(err)) {
    return "登录态失效，请退出后重新登录再试"
  }
  if (isFamilyRequired(err)) {
    return "请先在「我的」页面创建或加入家庭"
  }
  if (isCloudDisabled(err)) {
    return "请在开发者工具中开通云开发"
  }
  return fallback || "操作失败，请稍后再试"
}

function ensureFamily() {
  return call("family_get", {}).then(function (family) {
    if (family && family.joined !== false) return family
    throw new Error("family_required")
  }).catch(function (err) {
    if (!isFamilyRequired(err)) throw err
    return call("family_create", {})
  })
}

module.exports = {
  errorText: errorText,
  isFamilyRequired: isFamilyRequired,
  isLoginRequired: isLoginRequired,
  isCloudDisabled: isCloudDisabled,
  friendlyMessage: friendlyMessage,

  familyGet: function () { return call("family_get", {}) },
  familyCreate: function () { return call("family_create", {}) },
  familyJoin: function (joinCode) { return call("family_join", { joinCode: joinCode }) },

  addEvent: function (payload) {
    return ensureFamily().then(function () {
      return call("event_add", payload)
    })
  },

  listByDate: function (dateKey) { return call("event_list_by_date", { dateKey: dateKey }) },
  dailySummary: function (dateKey) { return call("summary_daily", { dateKey: dateKey }) },
  statsRange: function (days) { return call("stats_range", { days: days }) },
  deleteEvent: function (id) { return call("event_delete", { id: id }) },
  clearAll: function () { return call("event_clear_all", {}) },
  nlpParse: function (text) { return call("nlp_parse", { text: text }) }
}
