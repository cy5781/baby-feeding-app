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

exports.main = async () => {
  const familyId = await requireFamilyId()

  // Delete all events for this family (paginated to handle > 200 docs)
  while (true) {
    const res = await db.collection("events")
      .where({ familyId })
      .limit(200)
      .get()
    if ((res.data || []).length === 0) break
    const delTasks = res.data.map((doc) => db.collection("events").doc(doc._id).remove())
    await Promise.all(delTasks)
  }

  return { ok: true }
}
