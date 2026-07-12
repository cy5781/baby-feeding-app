const cloud = require("wx-server-sdk")
const https = require("https")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + (u.search || ""),
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        ...headers
      }
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { raw += chunk })
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(raw)) }
          catch (e) { reject(new Error("bad_json_response")) }
        } else {
          reject(new Error(`http_${res.statusCode || 0}`))
        }
      })
    })
    req.on("error", reject)
    req.write(data)
    req.end()
  })
}

function normalizeResult(obj) {
  const allowedTypes = ["milk", "solid", "med", "poop", "sleep"]
  if (!obj || typeof obj !== "object") return { type: "unknown" }
  if (!allowedTypes.includes(obj.type)) return { type: "unknown" }

  const out = { type: obj.type }

  if (obj.type === "milk") {
    out.milkAmount = parseInt(obj.milkAmount, 10) || 0
  }
  if (obj.type === "solid") {
    out.solidItem = String(obj.solidItem || "").trim()
    out.solidPortion = String(obj.solidPortion || "")
  }
  if (obj.type === "med") {
    out.medName = String(obj.medName || "").trim()
  }
  if (obj.type === "poop") {
    out.poopType = String(obj.poopType || "").trim()
    out.poopColor = String(obj.poopColor || "").trim()
  }
  if (obj.type === "sleep") {
    out.sleepEvent = String(obj.sleepEvent || "").trim()
  }

  const offset = parseInt(obj.dateOffsetDays, 10)
  if (Number.isFinite(offset) && offset >= -2 && offset <= 0) out.dateOffsetDays = offset

  const hour = parseInt(obj.hour, 10)
  const minute = parseInt(obj.minute, 10)
  if (Number.isFinite(hour) && hour >= 0 && hour <= 23) out.hour = hour
  if (Number.isFinite(minute) && minute >= 0 && minute <= 59) out.minute = minute

  out.note = String(obj.note || "").trim()
  return out
}

exports.main = async (event) => {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY_missing")

  const text = String(event.text || "").trim()
  if (!text) return { parsed: { type: "unknown" } }

  const system = [
    "你是一个信息抽取服务，只输出 JSON。",
    "从用户输入里抽取一条宝宝喂养记录。",
    "允许的类型 type：milk / solid / med / poop / sleep。",
    "输出 JSON schema：",
    "{",
    '  "type": "milk|solid|med|poop|sleep|unknown",',
    '  "milkAmount": 130,',
    '  "solidItem": "米糊",',
    '  "solidPortion": "少量|半碗|一碗|",',
    '  "medName": "AD|D3|DHA|CALCIUM",',
    '  "poopType": "干|正常|稀",',
    '  "poopColor": "黄|绿|褐|黑",',
    '  "sleepEvent": "入睡|醒来",',
    '  "dateOffsetDays": 0,',
    '  "hour": 21,',
    '  "minute": 30,',
    '  "note": ""',
    "}",
    "dateOffsetDays 只允许 0(今天)/-1(昨天)/-2(前天)，没提到就用0。",
    "hour/minute 如果用户没说时间就省略，不要胡编。",
    "中文数字要转成阿拉伯数字（如"一百四十五"→145，"九点半"→9:30）。",
    "如果无法判断类型，type 输出 unknown。"
  ].join("\n")

  const body = {
    model: "deepseek-v4-flash",
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_tokens: 300,
    messages: [
      { role: "system", content: system },
      { role: "user", content: text }
    ]
  }

  const resp = await postJson("https://api.deepseek.com/chat/completions", body, {
    Authorization: `Bearer ${apiKey}`
  })

  const content = resp && resp.choices && resp.choices[0]
    && resp.choices[0].message && resp.choices[0].message.content
  let parsed = null
  try { parsed = JSON.parse(content) }
  catch (e) { parsed = { type: "unknown" } }

  return { parsed: normalizeResult(parsed) }
}
