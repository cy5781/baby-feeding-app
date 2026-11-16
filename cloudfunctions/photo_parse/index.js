const cloud = require("wx-server-sdk")
const https = require("https")
const crypto = require("crypto")
const normalize = require("./normalize")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function sha256Hex(msg) {
  return crypto.createHash("sha256").update(msg).digest("hex")
}

function hmac(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest()
}

function postTC3(endpoint, action, version, region, service, payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  const algorithm = "TC3-HMAC-SHA256"
  const host = endpoint
  const httpRequestMethod = "POST"
  const canonicalUri = "/"
  const canonicalQueryString = ""
  const canonicalHeaders = "content-type:application/json\nhost:" + host + "\n"
  const signedHeaders = "content-type;host"
  const hashedRequestPayload = sha256Hex(payload)
  const canonicalRequest = httpRequestMethod + "\n"
    + canonicalUri + "\n"
    + canonicalQueryString + "\n"
    + canonicalHeaders + "\n"
    + signedHeaders + "\n"
    + hashedRequestPayload

  const credentialScope = date + "/" + service + "/tc3_request"
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = algorithm + "\n"
    + timestamp.toString() + "\n"
    + credentialScope + "\n"
    + hashedCanonicalRequest

  const kDate = hmac("TC3" + secretKey, date)
  const kService = hmac(kDate, service)
  const kSigning = hmac(kService, "tc3_request")
  const signature = hmac(kSigning, stringToSign).toString("hex")

  const authorization = algorithm + " "
    + "Credential=" + secretId + "/" + credentialScope + ", "
    + "SignedHeaders=" + signedHeaders + ", "
    + "Signature=" + signature

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: "POST",
      hostname: host,
      path: "/",
      headers: {
        "Content-Type": "application/json",
        "Host": host,
        "X-TC-Action": action,
        "X-TC-Version": version,
        "X-TC-Timestamp": timestamp.toString(),
        "X-TC-Region": region,
        "Authorization": authorization
      }
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { raw += chunk })
      res.on("end", () => {
        let data
        try {
          data = JSON.parse(raw)
        } catch (e) {
          reject(new Error("ocr_failed"))
          return
        }
        const resp = data && data.Response
        if (!resp) {
          reject(new Error("ocr_failed"))
          return
        }
        if (resp.Error) {
          const codeText = String(resp.Error.Code || "") + " " + String(resp.Error.Message || "")
          if (/AuthFailure|Unauthorized|Permission|NotActivated|Unopened|ServiceNot|not activated/i.test(codeText)) {
            reject(new Error("ocr_service_unavailable"))
          } else {
            reject(new Error("ocr_failed"))
          }
          return
        }
        resolve(resp)
      })
    })
    req.on("error", () => reject(new Error("ocr_failed")))
    req.write(payload)
    req.end()
  })
}

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const data = JSON.stringify(body)
    const req = https.request({
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + (u.search || ""),
      headers: Object.assign({
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }, headers)
    }, (res) => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", (chunk) => { raw += chunk })
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw))
          } catch (e) {
            reject(new Error("llm_failed"))
          }
        } else {
          reject(new Error("llm_failed"))
        }
      })
    })
    req.on("error", () => reject(new Error("llm_failed")))
    req.write(data)
    req.end()
  })
}

exports.main = async (event) => {
  const fileID = String(event.fileID || "").trim()
  const todayKey = String(event.todayKey || "").trim()
  if (!fileID) throw new Error("missing_fileID")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) throw new Error("missing_todayKey")

  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) throw new Error("ocr_credentials_missing")

  const urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
  const fileInfo = (urlRes.fileList && urlRes.fileList[0]) || {}
  if (fileInfo.status !== 0 || !fileInfo.tempFileURL) throw new Error("ocr_failed")

  const ocrResp = await postTC3(
    "ocr.tencentcloudapi.com",
    "GeneralHandwritingOCR",
    "2018-11-19",
    "ap-guangzhou",
    "ocr",
    JSON.stringify({ ImageUrl: fileInfo.tempFileURL }),
    secretId,
    secretKey
  )

  const rawText = normalize.ocrTextFromResponse(ocrResp)
  if (!rawText) {
    return { items: [], detectedDate: "", rawText: "", error: "ocr_empty" }
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error("llm_failed")

  const body = {
    model: "deepseek-v4-flash",
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    max_tokens: 2000,
    messages: [
      { role: "system", content: normalize.buildSystemPrompt(todayKey) },
      { role: "user", content: rawText }
    ]
  }

  let resp
  try {
    resp = await postJson("https://api.deepseek.com/chat/completions", body, {
      Authorization: "Bearer " + apiKey
    })
  } catch (e) {
    throw new Error("llm_failed")
  }

  const content = resp && resp.choices && resp.choices[0]
    && resp.choices[0].message && resp.choices[0].message.content
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch (e) {
    throw new Error("llm_failed")
  }

  const normalized = normalize.normalizeParsed(parsed, {
    todayKey: todayKey,
    defaultDateKey: todayKey,
    maxItems: 30
  })

  if (!normalized.items.length) {
    return {
      items: [],
      detectedDate: normalized.detectedDate,
      rawText: rawText,
      error: "no_items"
    }
  }

  return {
    items: normalized.items,
    detectedDate: normalized.detectedDate,
    rawText: rawText
  }
}
