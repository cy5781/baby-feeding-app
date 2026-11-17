const cloud = require("wx-server-sdk")
const validate = require("./validate")
const runBatch = require("./run_batch").runBatch

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

  return runBatch(events, {
    validate: validate.validateEvent,
    familyId: familyId,
    createdAt: function () { return db.serverDate() },
    add: function (data) {
      return db.collection("events").add({ data: data })
    }
  })
}
