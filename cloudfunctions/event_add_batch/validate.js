var MED_LABELS = { AD: "AD", D3: "D3", DHA: "DHA", CALCIUM: "液体钙" }
var DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function trimStr(v) {
  return String(v === null || v === undefined ? "" : v).trim()
}

function validateEvent(event) {
  if (!event || typeof event !== "object") {
    return { ok: false, reason: "bad_event" }
  }

  var type = trimStr(event.type)
  var dateKey = trimStr(event.dateKey)
  var ts = typeof event.ts === "number" ? event.ts : NaN

  if (!type) return { ok: false, reason: "type_required" }
  if (!DATE_RE.test(dateKey)) return { ok: false, reason: "dateKey_required" }
  if (!isFinite(ts)) return { ok: false, reason: "ts_required" }

  var data = {
    type: type,
    dateKey: dateKey,
    ts: ts,
    note: trimStr(event.note)
  }

  if (type === "milk") {
    var amount = parseInt(event.milkAmount, 10)
    if (!isFinite(amount) || amount <= 0) return { ok: false, reason: "milkAmount_required" }
    data.milkAmount = amount
    data.feedMethod = trimStr(event.feedMethod)
  } else if (type === "solid") {
    var solidItem = trimStr(event.solidItem)
    if (!solidItem) return { ok: false, reason: "solidItem_required" }
    data.solidItem = solidItem
    data.solidPortion = trimStr(event.solidPortion)
  } else if (type === "med") {
    var medName = trimStr(event.medName)
    if (!medName) return { ok: false, reason: "medName_required" }
    data.medName = medName
    data.medNameLabel = MED_LABELS[medName] || medName
  } else if (type === "poop") {
    var poopType = trimStr(event.poopType)
    var poopColor = trimStr(event.poopColor)
    if (!poopType || !poopColor) return { ok: false, reason: "poop_required" }
    data.poopType = poopType
    data.poopColor = poopColor
    data.poopAmount = trimStr(event.poopAmount)
  } else if (type === "sleep") {
    var sleepEvent = trimStr(event.sleepEvent)
    if (!sleepEvent) return { ok: false, reason: "sleepEvent_required" }
    data.sleepEvent = sleepEvent
  } else if (type === "vaccine") {
    var subType = trimStr(event.subType)
    var imageUrl = trimStr(event.imageUrl)
    if (!subType && !imageUrl) return { ok: false, reason: "vaccine_required" }
    data.subType = subType
    data.imageUrl = imageUrl
  } else if (type === "illness") {
    var illnessType = trimStr(event.subType)
    if (!illnessType) return { ok: false, reason: "illness_required" }
    data.subType = illnessType
  } else if (type === "weight") {
    var kg = parseFloat(event.weightKg)
    if (!isFinite(kg) || kg <= 0 || kg >= 50) return { ok: false, reason: "weight_required" }
    data.weightKg = kg
  } else {
    return { ok: false, reason: "type_not_supported" }
  }

  return { ok: true, data: data }
}

module.exports = {
  validateEvent: validateEvent,
  MED_LABELS: MED_LABELS
}
