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

function pad2(n) { return n < 10 ? `0${n}` : `${n}` }

function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

exports.main = async (event) => {
  const familyId = await requireFamilyId()
  const days = Math.min(90, Math.max(1, parseInt(event.days, 10) || 7))

  const keys = []
  const now = new Date()
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    keys.push(toDateKey(d))
  }

  const _ = db.command
  let all = []
  let offset = 0
  const pageSize = 500
  while (true) {
    const res = await db.collection("events")
      .where({ familyId, dateKey: _.in(keys) })
      .orderBy("ts", "desc")
      .skip(offset).limit(pageSize).get()
    all = all.concat(res.data || [])
    if ((res.data || []).length < pageSize) break
    offset += pageSize
  }

  const map = {}
  for (const k of keys) {
    map[k] = { dateKey: k, milkCount: 0, milkTotal: 0, solidCount: 0, poopCount: 0 }
  }

  for (const e of all) {
    const row = map[e.dateKey]
    if (!row) continue
    if (e.type === "milk") {
      row.milkCount += 1
      row.milkTotal += parseInt(e.milkAmount, 10) || 0
    } else if (e.type === "solid") {
      row.solidCount += 1
    } else if (e.type === "poop") {
      row.poopCount += 1
    }
  }

  return { rows: keys.map((k) => map[k]) }
}
