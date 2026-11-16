# 拍照导入喂养记录 — 设计文档

- 日期：2026-11-16
- 状态：已确认设计，待实现
- 相关产品文档：`feeding-app-spec.md`、`baby_feeding_prototype_v2_mint.html`

## 1. 背景与目标

家人（主要是爷爷奶奶）仍会把喂养情况写在纸质本子上，例如：

```
9:10  奶粉 150
10:30 便便 黄 正常
11:00 睡
12:00 醒
下午 米糊 半碗
D3 一滴
```

目标是让用户在小程序里 **拍一张本子照片 → 自动识别整页手写内容 → 拆成多条结构化记录 → 人工确认/勾选 → 批量写入云数据库**，避免逐条手动补录。

成功标准：

- 一张照片可以一次识别并保存多条记录（上限 30 条）。
- 识别结果必须先展示、可修改时间、可逐条取消，**绝不自动入库**。
- 老人可读的大字号、大触控区域，页面风格与现有「小清新淡绿」一致。
- 不增加新的第三方供应商：复用现有腾讯云密钥与 DeepSeek 密钥。

## 2. 非目标

- 不做自动去重（纸质记录可能重复记，是否保存由用户在确认页决定）。
- 不保留照片原图（仅用于本次识别，用完删除）。
- 不识别图片中的表格线、印刷表头等非记录内容。
- 不改变现有语音/手动录入流程，也不重构已有页面。

## 3. 方案选择

选择 **独立拍照导入页 + 两个云函数**：

| 方案 | 结论 |
|---|---|
| A. 新页面 `pages/photo-import` + `photo_parse` + `event_add_batch` | **采用**。流程独立，天然支持整页多条记录，状态边界清晰 |
| B. 作为「拍照」Tab 塞进现有语音页 | 不采用。语音页是单条解析模型，多记录列表会让状态互相干扰 |
| C. 前端逐行 OCR 后逐条调 `nlp_parse` | 不采用。请求多、丢失整页上下文（日期、表头、行间关系），准确率差 |

识别链路：

```
拍照/选图
  → 上传云存储（临时）
  → photo_parse 云函数
       → 腾讯云 GeneralHandwritingOCR（手写体识别）
       → DeepSeek（多记录结构化）
       → 服务端归一化
  → 确认页（逐条勾选/改时间）
  → event_add_batch 云函数（一次入库）
  → 删除临时照片
```

## 4. 入口与页面结构

### 4.1 首页入口

`pages/today/index.wxml` 在「一键记录」网格下方增加一个通栏次要按钮：

```
📷 拍照识别记录本
```

- 白底、`#4F9668` 边框、`#2C6B40` 文字，最小高度 `88rpx`（约 44px）。
- 底部悬浮的「🎤 说一句话记录」保持不变。
- 首页 JS 增加 `goPhotoImport`，`wx.navigateTo` 到 `/pages/photo-import/index`。

### 4.2 拍照导入页

新页面 `pages/photo-import/index`，导航标题「拍照导入」，`app.json` 注册。

页面按状态展示：

1. **未选图**：虚线卡片 + 「📷 拍照 / 从相册选择」大按钮。
2. **上传/识别中**：照片缩略图 + 进度文案：
   - `正在上传照片…`
   - `正在识别手写内容…`
   - `正在整理记录…`
3. **识别完成**：
   - 照片缩略图（最大高度 `360rpx`，圆角 `28rpx`）+ 小按钮「重新拍照」
   - 标题「识别到 N 条记录」
   - 「记录日期」选择器（`picker mode="date"`，`end` 为今天）：识别到本子日期（`detectedDate`）则用它初始化，否则用今天。修改它只影响**没有自己日期**的条目。
   - 每条记录一张确认卡片：
     - 左侧圆形勾选（已选：`#4F9668` 底 + 白色 ✓；未选：白底 `#D3E6CB` 边），勾选区域触控尺寸不小于 `88rpx`
     - 第一行：类型 emoji + 描述，字号 `32rpx`、加粗
     - 第二行：时间。可点开 `<picker mode="time">` 修改
     - 若该条有独立日期且与全局日期不同，显示「8月12日」
     - 未识别到时间：显示 `12:00（未识别，点此修改）`，保存时在 `note` 追加「时间未识别，按12:00记录」
   - 折叠区「查看识别原文」，展示 OCR 原文，便于排错
   - 底部主按钮「保存 N 条记录」
4. **无结果**：提示「没识别到文字，请把本子拍清楚、避开反光和阴影」+「重新拍照」。
5. **有文字但没拆出记录**：显示原文折叠区 + 「重新拍照」。
6. **识别失败（网络/OCR/LLM）**：错误文案 +「重试识别」（复用已上传的 `fileID`，不重新上传）+「重新拍照」。

所有动态 class、显示文案、勾选标记都在 JS 里预计算成字段（如 `checkClass`、`timeLabel`、`showDate`），WXML 属性中不使用 `===` 或三元表达式。

## 5. 云函数设计

### 5.1 `photo_parse`

自包含：`index.js` + `package.json`（`wx-server-sdk@latest`）。纯归一化逻辑放在同目录 `normalize.js`，便于本地测试。

入参：

```js
{
  fileID: string,        // 云存储文件 ID，必填
  todayKey: "YYYY-MM-DD" // 客户端当天日期，必填
}
```

流程：

1. 校验 `fileID`、`todayKey`。
2. `cloud.getTempFileURL` 获取图片临时地址。
3. 调用腾讯云 OCR：
   - 域名 `ocr.tencentcloudapi.com`
   - Action `GeneralHandwritingOCR`，Version `2018-11-19`
   - Region `ap-guangzhou`
   - Service `ocr`，TC3-HMAC-SHA256 签名（复用 `speech_recognize` 的签名实现）
   - 入参 `{ ImageUrl: tempFileURL }`
   - 从 `Response.TextDetections` 取 `DetectedText`；有 `Polygon` 时按左上角 `Y → X` 排序，缺失时保持接口顺序。
4. 原文按行拼接为 `rawText`。若为空，返回错误码 `ocr_empty`。
5. 调 DeepSeek：
   - 模型沿用 `deepseek-v4-flash`
   - `thinking: { type: "disabled" }`
   - `response_format: { type: "json_object" }`
   - `max_tokens: 2000`
6. 解析 + 归一化（见 5.3），返回：

```js
{
  items: [ /* 归一化后的记录 */ ],
  detectedDate: "YYYY-MM-DD" | "",
  rawText: "OCR 原文"
}
```

错误码（通过 `throw new Error(code)`）：

- `ocr_credentials_missing`：缺少 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`
- `ocr_service_unavailable`：OCR 返回鉴权/未开通类错误
- `ocr_empty`：没有识别到文字
- `ocr_failed`：OCR 请求失败
- `llm_failed`：DeepSeek 失败或返回非 JSON
- `no_items`：有文字但归一化后没有有效记录

### 5.2 `event_add_batch`

自包含：`index.js` + `package.json`。复制 `event_add` 的 `requireFamilyId` 与类型校验逻辑（云函数不跨目录共享代码）。

入参：

```js
{ events: [ /* 每条同 event_add 的 payload */ ] }
```

规则：

- `events` 非数组或为空 → `bad_request`；超过 30 条 → `too_many_events`。
- `requireFamilyId()` 只查一次。
- 逐条校验，规则与 `event_add` 完全一致：
  - milk：`milkAmount` 必填
  - solid：`solidItem` 必填
  - med：`medName` 必填，写入 `medNameLabel`（AD/D3/DHA/CALCIUM 映射）
  - poop：`poopType` + `poopColor` 必填
  - sleep：`sleepEvent` 必填
  - vaccine：`subType` 或 `imageUrl` 至少一个
  - illness：`subType` 必填
  - weight：`weightKg > 0`
- 合法条目逐条写入 `events` 集合，`source` 固定为 `"photo"`（若客户端传了其它值也不采用），`createdAt` 用 `db.serverDate()`。
- 非法条目跳过，不中断整批。
- 返回：

```js
{ saved: number, ids: string[], failed: [{ index, reason }] }
```

### 5.3 服务端归一化（`normalize.js`）

纯函数，无外部依赖，导出 `normalizeParsed(parsed, opts)`。

输入为 LLM 返回的对象，`opts` 含 `todayKey`、`defaultDateKey`、`maxItems`。

规则：

- `type` 白名单：`milk | solid | med | poop | sleep | vaccine | illness | weight`，其它丢弃。
- 数值和字符串清洗：
  - `milkAmount`：整数，`1..500`，否则丢弃该条
  - `solidItem`：非空字符串，最长 100 字；`solidPortion` 只允许 `少量|半碗|一碗|很多`，否则置空
  - `medName`：优先映射到 `AD|D3|DHA|CALCIUM`；无法映射时保留原文作为 `medName`，`medNameLabel` 用原文
  - `poopType`：`干|正常|稀`；`poopColor`：`黄|绿|褐|黑`；不合法则丢弃
  - `poopAmount`：`少|正常|多`，可空
  - `sleepEvent`：`入睡|醒来`；空则丢弃
  - `vaccine`：`subType` 空则默认 `疫苗`
  - `illness`：`subType` 空则丢弃
  - `weightKg`：`> 0 && < 50`，否则丢弃
  - `note`：去空白，最长 200 字
- 时间：`HH:mm` 合法才保留，否则置空。
- 日期：
  - 合法 `YYYY-MM-DD` 且不晚于 `todayKey` 才保留。
  - 单条日期优先，其次页面 `detectedDate`，最后 `defaultDateKey`。
  - 输出 `hasOwnDate`：仅当该条自己带有合法日期时为 `true`。前端据此决定是否跟随全局日期选择器变化。
- 去重：按 `type + dateKey + time + 关键字段` 生成签名，重复条目只保留第一条。
- 上限 `maxItems = 30`。
- 每条输出结构：

```js
{
  type, dateKey, hasOwnDate: boolean, time, timeMissing: boolean,
  milkAmount, feedMethod,
  solidItem, solidPortion,
  medName, medNameLabel,
  poopType, poopColor, poopAmount,
  sleepEvent, subType, weightKg,
  note
}
```

### 5.4 DeepSeek prompt

System prompt 要点（放在云函数里，不暴露给前端）：

- 角色：把纸质喂养记录 OCR 文本拆成多条结构化记录，只输出 JSON。
- 今天日期为 `{todayKey}`；年份推断：文中「8月12日」若晚于今天则视为上一年。
- 输出 schema：

```json
{
  "detectedDate": "YYYY-MM-DD 或空字符串",
  "items": [
    {
      "type": "milk|solid|med|poop|sleep|vaccine|illness|weight",
      "time": "HH:mm 或空字符串",
      "dateKey": "YYYY-MM-DD 或空字符串",
      "milkAmount": 145,
      "feedMethod": "母乳|混合|奶粉|",
      "solidItem": "米糊",
      "solidPortion": "少量|半碗|一碗|很多|",
      "medName": "AD|D3|DHA|CALCIUM 或原文",
      "poopType": "干|正常|稀|",
      "poopColor": "黄|绿|褐|黑|",
      "poopAmount": "少|正常|多|",
      "sleepEvent": "入睡|醒来|",
      "subType": "疫苗名或症状",
      "weightKg": 8.5,
      "note": "对应原始行"
    }
  ]
}
```

- 一行一条；明确写了多个时间点（如「9:00-10:00 睡」）可拆成「入睡」「醒来」两条。
- 中文数字转阿拉伯数字（「一百五」→150，「九点半」→09:30）。
- 没写时间就留空，**不许编造**；没写日期就留空或使用 `detectedDate`。
- 常见简写映射：`奶/奶粉/配方奶` → milk；`母乳` → milk + feedMethod 母乳；`便/臭臭/拉` → poop；`睡/入睡` → 入睡；`醒/起床` → 醒来；`D3/AD/DHA/钙` → med。
- 无法归类的行不要输出。
- 最多 30 条。

## 6. 前端实现

### 6.1 页面数据

```js
{
  imagePath: "",            // 本地临时路径
  fileID: "",               // 云存储文件 ID
  stage: "idle",            // idle | uploading | parsing | done | error
  stageText: "",
  items: [],                // 每条含 checked/checkClass/icon/desc/time/timeLabel/timePickerValue/timeMissing/dateKey/hasOwnDate/dateLabel/showDate 等字段
  checkedCount: 0,
  saveButtonText: "保存记录",
  detectedDate: "",
  defaultDateKey: "YYYY-MM-DD",
  defaultDateLabel: "今天",
  todayKey: "YYYY-MM-DD",
  rawText: "",
  showRaw: false,
  rawToggleText: "查看识别原文",
  saving: false
}
```

### 6.2 交互

- `choosePhoto`：`wx.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["camera", "album"] })`，成功后自动上传。
- `uploadAndParse`：`wx.cloud.uploadFile` 到 `photo-import/<timestamp>.jpg`，然后调 `api.photoParse(fileID, todayKey)`。
- 解析结果映射到页面数据：
  - `time`：`item.time || "12:00"`；`timeMissing` 沿用服务端结果
  - `timePickerValue`：同 `time`
  - `timeLabel`：有识别时间显示 `09:10`；未识别显示 `12:00（未识别，点此修改）`
  - 若 `detectedDate` 合法，用它初始化 `defaultDateKey` 和 `defaultDateLabel`
  - `dateKey`：服务端已按「单条日期 → detectedDate → todayKey」解析好
  - `showDate`：`hasOwnDate && dateKey !== defaultDateKey`
- `onTimeChange`：更新单条 `time`、`timeLabel`、`timePickerValue`，并把 `timeMissing` 置 false。
- `onDefaultDateChange`：更新全局日期；只更新 `hasOwnDate === false` 的条目的 `dateKey` 与 `showDate`。
- `toggleItem`：切换勾选，重算 `checkedCount` 与保存按钮文案；`checkedCount === 0` 时保存按钮禁用。
- `retake`：清空状态，重新选图。
- `retryParse`：不清空 `fileID`，直接重新调用 `api.photoParse`。
- `save`：
  - 只提交勾选项，按 `dateKey + time` 计算 `ts`（`dateKeyToTs`）。
  - `timeMissing` 为 true 时，`note` 追加「时间未识别，按12:00记录」。
  - 调 `api.addEventsBatch(events)`；成功后 toast「已保存 N 条」，删除临时照片，`navigateBack`。
  - 若 `failed` 非空，toast「已保存 N 条，M 条未保存」。
- `onUnload`：若照片尚未删除，best-effort `wx.cloud.deleteFile`。

### 6.3 视觉规范

- 背景 `#F5FAF3`，卡片白底、圆角 `28rpx`、阴影沿用 `.card`。
- 主按钮 `#4F9668` 白字；次要按钮白底绿边。
- 类型颜色只用于小面积图标/强调，不整片铺绿。
- 正文字号不小于 `28rpx`，关键描述 `32rpx`，按钮 `34rpx`，触控高度不小于 `88rpx`。
- 不使用 CSS `inset` 简写、不在 `page` 选择器使用 CSS 变量。

### 6.4 API 封装

`miniprogram/services/api.js` 增加：

```js
photoParse: function (fileID, todayKey) {
  return call("photo_parse", { fileID: fileID, todayKey: todayKey })
},
addEventsBatch: function (events) {
  return ensureFamily().then(function () {
    return call("event_add_batch", { events: events })
  })
}
```

## 7. 错误处理与文案

| 场景 | 前端文案 |
|---|---|
| `ocr_empty` | 没识别到文字，请把本子拍清楚、避开反光和阴影 |
| `no_items` | 识别到文字，但没拆出可保存的记录。可查看原文后重新拍照 |
| `ocr_credentials_missing` | 文字识别服务未配置，请联系管理员检查腾讯云密钥 |
| `ocr_service_unavailable` | 文字识别服务未开通，请在腾讯云控制台开通 OCR |
| `ocr_failed` | 识别失败，请重试或换一张照片 |
| `llm_failed` | 记录整理失败，请重试 |
| `too_many_events` | 一次最多保存 30 条记录 |
| `family_required` | 沿用现有：请先在「我的」页面创建或加入家庭 |
| 上传失败 | 照片上传失败，请重试 |

## 8. 配置与部署前置

1. 腾讯云控制台开通 **文字识别 OCR**，并确认账号有 `QcloudOCRFullAccess`（或等价）权限；通常有免费额度。
2. 云函数环境变量沿用：
   - `TENCENT_SECRET_ID`
   - `TENCENT_SECRET_KEY`
   - `DEEPSEEK_API_KEY`
3. 在云开发控制台把 `photo_parse` 的**超时时间调到 20 秒**（OCR + LLM 串行，默认 3 秒不够）。
4. 部署 `photo_parse`、`event_add_batch` 两个云函数。
5. 云存储无需新增权限配置；照片由当前用户上传与删除。

## 9. 测试与验证

### 9.1 自动检查

- 所有新增/修改 JS 执行 `node --check`。
- `cloudfunctions/photo_parse/normalize.js` 用本地 Node 脚本覆盖：
  - 正常 milk / poop / sleep / med 混合输入
  - 中文数字（一百四十五 → 145）
  - 缺时间 → `timeMissing: true`
  - 非法类型 → 丢弃
  - 未来日期 → 回退到默认日期
  - 重复行 → 去重
  - 超过 30 条 → 截断
- 测试脚本放在 `tests/photo-import-normalize.test.js`，不放进云函数目录（避免随函数部署）。

### 9.2 手动验收（需要用户执行）

1. 部署两个云函数、开通 OCR、调整超时。
2. 开发者工具/真机拍一张手写本子照片。
3. 检查：
   - 多条记录是否都识别出来
   - 时间/日期是否正确
   - 取消勾选后不会保存
   - 保存后首页时间线与「记录」页能看到，`source` 为 `photo`
   - 保存后云存储临时照片已删除
   - 拍照取消、断网、OCR 报错时页面不白屏

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 手写 OCR 准确率不稳定 | 展示原文折叠区；确认页可改时间、可取消；提示拍摄清晰 |
| 云函数超时 | 超时调到 20 秒；一次只处理一张图 |
| OCR 额度/费用 | 一次照片一次 OCR 调用；免费额度内日常使用足够 |
| 隐私 | 照片仅用于本次识别，保存或离开页面即删除；不写入 events |
| 重复导入 | 确认页由用户勾选；不做自动去重 |
| 日期推断错误 | 默认日期在页面顶部可见且可修改；单条日期优先 |

## 11. 涉及文件

新增：

- `cloudfunctions/photo_parse/index.js`
- `cloudfunctions/photo_parse/normalize.js`
- `cloudfunctions/photo_parse/package.json`
- `cloudfunctions/event_add_batch/index.js`
- `cloudfunctions/event_add_batch/package.json`
- `miniprogram/pages/photo-import/index.js`
- `miniprogram/pages/photo-import/index.json`
- `miniprogram/pages/photo-import/index.wxml`
- `miniprogram/pages/photo-import/index.wxss`
- `tests/photo-import-normalize.test.js`

修改：

- `miniprogram/app.json`（注册页面）
- `miniprogram/pages/today/index.js`（`goPhotoImport`）
- `miniprogram/pages/today/index.wxml`（入口按钮）
- `miniprogram/pages/today/index.wxss`（入口样式）
- `miniprogram/services/api.js`（`photoParse` / `addEventsBatch`）
- `CLAUDE.md`（架构表补充两个云函数和一个页面）
