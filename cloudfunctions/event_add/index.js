const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MED_LABELS = { AD: "AD", D3: "D3", DHA: "DHA", CALCIUM: "液体钙" }

async function requireFamilyId() {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error("login_required")
  const member = await db.collection("family_members").where({ openid: OPENID }).limit(1).get()
  if ((member.data || []).length === 0) throw new Error("family_required")
  return member.data[0].familyId
}

exports.main = async (event) => {
  const familyId = await requireFamilyId()

  const type = String(event.type || "")
  const dateKey = String(event.dateKey || "")
  const ts = typeof event.ts === "number" ? event.ts : Date.now()
  const note = String(event.note || "")

  if (!type || !dateKey) throw new Error("bad_request")

  const data = { familyId, type, dateKey, ts, note, createdAt: db.serverDate() }

  if (type === "milk") {
    data.milkAmount = parseInt(event.milkAmount, 10)
    if (!data.milkAmount) throw new Error("milkAmount_required")
  } else if (type === "solid") {
    data.solidItem = String(event.solidItem || "").trim()
    data.solidPortion = String(event.solidPortion || "")
    if (!data.solidItem) throw new Error("solidItem_required")
  } else if (type === "med") {
    data.medName = String(event.medName || "").trim()
    if (!data.medName) throw new Error("medName_required")
    data.medNameLabel = MED_LABELS[data.medName] || data.medName
  } else if (type === "poop") {
    data.poopType = String(event.poopType || "").trim()
    data.poopColor = String(event.poopColor || "").trim()
    if (!data.poopType || !data.poopColor) throw new Error("poop_required")
  } else if (type === "sleep") {
    data.sleepEvent = String(event.sleepEvent || "").trim()
    if (!data.sleepEvent) throw new Error("sleepEvent_required")
  } else {
    throw new Error("type_not_supported")
  }

  const res = await db.collection("events").add({ data })
  return { id: res._id }
}
