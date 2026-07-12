App({
  onLaunch: function () {
    try {
      if (wx.cloud) {
        var envId = ""
        try {
          var env = require("./env")
          envId = env && env.CLOUD_ENV_ID ? String(env.CLOUD_ENV_ID) : ""
        } catch (e) {
          envId = ""
          console.warn("env.js not found, using dynamic env")
        }
        wx.cloud.init({
          env: envId || wx.cloud.DYNAMIC_CURRENT_ENV
        })
        console.log("cloud init done, env:", envId || "dynamic")
      } else {
        console.warn("wx.cloud not available")
      }
    } catch (e) {
      console.error("App onLaunch error:", e)
    }
  }
})
