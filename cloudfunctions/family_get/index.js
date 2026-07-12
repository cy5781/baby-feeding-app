const cloud = require("wx-server-sdk")
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) throw new Error("login_required")

  const member = await db.collection("family_members").where({ openid: OPENID }).limit(1).get()
  if ((member.data || []).length === 0) {
    return { joined: false, joinCode: "" }
  }

  const familyId = member.data[0].familyId
  const fam = await db.collection("families").doc(familyId).get()
  return { joined: true, familyId, joinCode: fam.data.joinCode }
}
