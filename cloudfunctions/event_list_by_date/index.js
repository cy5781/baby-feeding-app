const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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
    .limit(200)
    .get()

  return { items: res.data || [] }
}
