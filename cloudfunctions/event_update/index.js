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
  const id = String(event.id || "").trim()
  if (!id) throw new Error("id_required")

  // Verify event belongs to family
  const existing = await db.collection("events").doc(id).get()
  if (!existing.data || existing.data.familyId !== familyId) {
    throw new Error("not_found_or_unauthorized")
  }

  const type = String(event.type || existing.data.type)
  const dateKey = String(event.dateKey || existing.data.dateKey)
  const ts = typeof event.ts === "number" ? event.ts : (existing.data.ts || Date.now())
  const note = String(event.note !== undefined ? event.note : (existing.data.note || ""))

  const data = { type, dateKey, ts, note, updatedAt: db.serverDate() }

  if (type === "milk") {
    data.milkAmount = parseInt(event.milkAmount, 10) || existing.data.milkAmount || 0
    data.feedMethod = String(event.feedMethod || existing.data.feedMethod || "")
    if (!data.milkAmount) throw new Error("milkAmount_required")
  } else if (type === "solid") {
    data.solidItem = String(event.solidItem || existing.data.solidItem || "").trim()
    data.solidPortion = String(event.solidPortion || existing.data.solidPortion || "")
    if (!data.solidItem) throw new Error("solidItem_required")
  } else if (type === "med") {
    data.medName = String(event.medName || existing.data.medName || "").trim()
    if (!data.medName) throw new Error("medName_required")
    data.medNameLabel = MED_LABELS[data.medName] || data.medName
  } else if (type === "poop") {
    data.poopType = String(event.poopType || existing.data.poopType || "").trim()
    data.poopColor = String(event.poopColor || existing.data.poopColor || "").trim()
    data.poopAmount = String(event.poopAmount || existing.data.poopAmount || "").trim()
    if (!data.poopType || !data.poopColor) throw new Error("poop_required")
  } else if (type === "sleep") {
    data.sleepEvent = String(event.sleepEvent || existing.data.sleepEvent || "").trim()
    if (!data.sleepEvent) throw new Error("sleepEvent_required")
  } else if (type === "vaccine") {
    data.subType = String(event.subType || existing.data.subType || "").trim()
    data.imageUrl = String(event.imageUrl || existing.data.imageUrl || "").trim()
  } else if (type === "illness") {
    data.subType = String(event.subType || existing.data.subType || "").trim()
    if (!data.subType) throw new Error("illness_required")
  } else if (type === "weight") {
    data.weightKg = parseFloat(event.weightKg) || existing.data.weightKg || 0
    if (!data.weightKg) throw new Error("weight_required")
  }

  await db.collection("events").doc(id).update({ data })
  return { id, updated: true }
}
