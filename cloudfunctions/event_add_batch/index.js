const cloud = require("wx-server-sdk")
const validate = require("./validate")

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
  const events = event.events
  if (!Array.isArray(events) || events.length === 0) throw new Error("bad_request")
  if (events.length > 30) throw new Error("too_many_events")

  const familyId = await requireFamilyId()
  const ids = []
  const failed = []

  for (let i = 0; i < events.length; i++) {
    const result = validate.validateEvent(events[i])
    if (!result.ok) {
      failed.push({ index: i, reason: result.reason })
      continue
    }
    const data = Object.assign({}, result.data, {
      familyId: familyId,
      source: "photo",
      createdAt: db.serverDate()
    })
    try {
      const res = await db.collection("events").add({ data: data })
      ids.push(res._id)
    } catch (e) {
      failed.push({ index: i, reason: "db_error" })
    }
  }

  return { saved: ids.length, ids: ids, failed: failed }
}
