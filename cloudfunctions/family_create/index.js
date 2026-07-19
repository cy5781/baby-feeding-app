const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function genJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < 6; i += 1) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

async function ensureUniqueJoinCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = genJoinCode()
    const hit = await db.collection("families").where({ joinCode: code }).limit(1).get()
    if ((hit.data || []).length === 0) return code
  }
  return `${Date.now()}`.slice(-6)
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error("login_required")

  const member = await db.collection("family_members").where({ openid: OPENID }).limit(1).get()
  if ((member.data || []).length > 0) {
    const familyId = member.data[0].familyId
    try {
      const fam = await db.collection("families").doc(familyId).get()
      if (fam.data) return { familyId, joinCode: fam.data.joinCode }
    } catch (e) {
      // Family doc deleted — fall through to create a new one
    }
  }

  const joinCode = await ensureUniqueJoinCode()
  const famAdd = await db.collection("families").add({
    data: { joinCode, createdAt: db.serverDate() }
  })
  const familyId = famAdd._id

  await db.collection("family_members").add({
    data: { openid: OPENID, familyId, joinedAt: db.serverDate() }
  })

  return { familyId, joinCode }
}
