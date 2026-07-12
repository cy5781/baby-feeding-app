const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error("login_required")

  const joinCode = String(event.joinCode || "").trim().toUpperCase()
  if (!joinCode) throw new Error("joinCode_required")

  const fam = await db.collection("families").where({ joinCode }).limit(1).get()
  if ((fam.data || []).length === 0) throw new Error("family_not_found")

  const familyId = fam.data[0]._id

  const existing = await db.collection("family_members")
    .where({ openid: OPENID, familyId }).limit(1).get()
  if ((existing.data || []).length > 0) {
    return { familyId, joinCode }
  }

  await db.collection("family_members").add({
    data: { openid: OPENID, familyId, joinedAt: db.serverDate() }
  })

  return { familyId, joinCode }
}
