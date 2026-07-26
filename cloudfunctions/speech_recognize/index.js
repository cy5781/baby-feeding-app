var cloud = require("wx-server-sdk")
var https = require("https")
var crypto = require("crypto")

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function hmac(key, msg) {
  return crypto.createHmac("sha256", key).update(msg).digest()
}

function sha256Hex(msg) {
  return crypto.createHash("sha256").update(msg).digest("hex")
}

function postTC3(endpoint, action, version, region, payload, secretId, secretKey) {
  var timestamp = Math.floor(Date.now() / 1000)
  var date = new Date(timestamp * 1000).toISOString().slice(0, 10)
  var service = "asr"
  var algorithm = "TC3-HMAC-SHA256"
  var host = endpoint

  var httpRequestMethod = "POST"
  var canonicalUri = "/"
  var canonicalQueryString = ""
  var canonicalHeaders = "content-type:application/json\nhost:" + host + "\n"
  var signedHeaders = "content-type;host"
  var hashedRequestPayload = sha256Hex(payload)
  var canonicalRequest = httpRequestMethod + "\n"
    + canonicalUri + "\n"
    + canonicalQueryString + "\n"
    + canonicalHeaders + "\n"
    + signedHeaders + "\n"
    + hashedRequestPayload

  var credentialScope = date + "/" + service + "/tc3_request"
  var hashedCanonicalRequest = sha256Hex(canonicalRequest)
  var stringToSign = algorithm + "\n"
    + timestamp.toString() + "\n"
    + credentialScope + "\n"
    + hashedCanonicalRequest

  var kDate = hmac("TC3" + secretKey, date)
  var kService = hmac(kDate, service)
  var kSigning = hmac(kService, "tc3_request")
  var signature = hmac(kSigning, stringToSign).toString("hex")

  var authorization = algorithm + " "
    + "Credential=" + secretId + "/" + credentialScope + ", "
    + "SignedHeaders=" + signedHeaders + ", "
    + "Signature=" + signature

  return new Promise(function (resolve, reject) {
    var req = https.request({
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
    }, function (res) {
      var raw = ""
      res.setEncoding("utf8")
      res.on("data", function (chunk) { raw += chunk })
      res.on("end", function () {
        try {
          var data = JSON.parse(raw)
          if (data.Response && data.Response.Result) {
            resolve(data.Response.Result)
          } else if (data.Response && data.Response.Error) {
            reject(new Error(data.Response.Error.Message || "ASR_error"))
          } else {
            reject(new Error("ASR_no_result"))
          }
        } catch (e) {
          reject(new Error("ASR_bad_response"))
        }
      })
    })
    req.on("error", reject)
    req.write(payload)
    req.end()
  })
}

exports.main = async function (event) {
  var secretId = process.env.TENCENT_SECRET_ID
  var secretKey = process.env.TENCENT_SECRET_KEY

  if (!secretId || !secretKey) {
    throw new Error("asr_credentials_missing")
  }

  var fileID = event.fileID
  if (!fileID) throw new Error("missing_fileID")

  // Get temp download URL from cloud storage
  var urlRes = await cloud.getTempFileURL({ fileList: [fileID] })
  var fileInfo = (urlRes.fileList && urlRes.fileList[0]) || {}
  if (fileInfo.status !== 0 || !fileInfo.tempFileURL) {
    throw new Error("cannot_get_temp_url")
  }

  var voiceFormat = event.voiceFormat || "mp3"
  var engType = voiceFormat === "wav" ? "16k_zh" : "16k_zh"

  var payload = JSON.stringify({
    EngSerViceType: engType,
    SourceType: 0,
    VoiceFormat: voiceFormat,
    Url: fileInfo.tempFileURL
  })

  var text = await postTC3(
    "asr.tencentcloudapi.com",
    "SentenceRecognition",
    "2019-06-14",
    "ap-guangzhou",
    payload,
    secretId,
    secretKey
  )

  return { text: text }
}
