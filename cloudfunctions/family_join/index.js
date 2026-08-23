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

  // 关键修复：一个用户只能属于一个家庭。
  // 加入新家庭前，先删除用户在其他家庭的所有成员记录。
  // 这也顺带清理了旧版本 join 逻辑造成的重复成员记录。
  const myMemberships = await db.collection("family_members")
    .where({ openid: OPENID }).get()
  const memberships = myMemberships.data || []
  for (const m of memberships) {
    if (m.familyId !== familyId) {
      await db.collection("family_members").doc(m._id).remove()
    }
  }

  // 确保目标家庭的成员记录存在（若已存在则无需重复添加）
  const existing = await db.collection("family_members")
    .where({ openid: OPENID, familyId }).limit(1).get()
  if ((existing.data || []).length === 0) {
    await db.collection("family_members").add({
      data: { openid: OPENID, familyId, joinedAt: db.serverDate() }
    })
  }

  return { familyId, joinCode }
}
