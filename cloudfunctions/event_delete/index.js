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
  const id = String(event.id || "")
  if (!id) throw new Error("id_required")

  const doc = await db.collection("events").doc(id).get()
  if (!doc.data) throw new Error("not_found")
  if (doc.data.familyId !== familyId) throw new Error("forbidden")

  await db.collection("events").doc(id).remove()
  return { ok: true }
}
