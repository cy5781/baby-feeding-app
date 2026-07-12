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
  const dateKey = String(event.dateKey || "")
  if (!dateKey) throw new Error("dateKey_required")

  const res = await db.collection("events")
    .where({ familyId, dateKey })
    .orderBy("ts", "desc")
    .limit(500)
    .get()

  const items = res.data || []
  let milkCount = 0, milkTotal = 0, solidCount = 0, poopCount = 0
  const meds = { AD: false, D3: false, DHA: false, CALCIUM: false }
  let lastMilk = null

  for (const e of items) {
    if (e.type === "milk") {
      milkCount += 1
      milkTotal += parseInt(e.milkAmount, 10) || 0
      if (!lastMilk) lastMilk = { ts: e.ts, milkAmount: e.milkAmount }
    } else if (e.type === "solid") {
      solidCount += 1
    } else if (e.type === "poop") {
      poopCount += 1
    } else if (e.type === "med") {
      const key = String(e.medName || "").trim()
      if (Object.prototype.hasOwnProperty.call(meds, key)) meds[key] = true
    }
  }

  return { milkCount, milkTotal, solidCount, poopCount, meds, lastMilk }
}
