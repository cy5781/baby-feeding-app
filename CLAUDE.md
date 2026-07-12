# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A WeChat Mini Program (微信小程序) for baby feeding tracking, designed primarily for elderly users (grandparents). Uses WeChat Cloud Development (云开发) for serverless backend — cloud functions + cloud database. Supports manual quick-entry, voice/text NLP input via DeepSeek API, and family sharing via join codes.

## Authoritative Sources

The only two files that define what to build:

- **`feeding-app-spec.md`** — Full product spec: design tokens, page structure, data model, interaction logic, NLP prompt design, and recommended build order (MVP first).
- **`baby_feeding_prototype_v2_mint.html`** — Interactive HTML prototype. Open it in a browser to see the intended UX, animations, and interaction flow. The JS logic in this prototype (`openSheet`, `pick`, `confirmSheet`, `startVoice`, `confirmVoice`, `setFilter`, `changeDay`, etc.) is the reference implementation to port to Mini Program APIs.

**All existing code under `miniprogram/` and `cloudfunctions/` should be ignored.** This is a from-scratch rebuild. Read the spec and prototype first, then implement.

## Tech Stack (from spec)

| Module | Choice |
|---|---|
| Frontend | WeChat Mini Program native |
| Backend/Data | WeChat Cloud Development (cloud DB + cloud functions) |
| Voice Recognition | `wx.getRecorderManager` + WeChat speech-to-text plugin or third-party ASR |
| LLM Parsing | DeepSeek API, called through a cloud function (never expose API key in frontend) |
| State | `Page.data` / `setData` (no complex state library needed) |

## Design System (from spec §3)

"小清新淡绿" (fresh light green). Key tokens:

```
--paper:        #F5FAF3   /* page/card backgrounds */
--paper-line:   #D3E6CB   /* dividers, borders */
--ink:          #33422E   /* primary text */
--ink-soft:     #7E9078   /* secondary text */
--primary:      #4F9668   /* forest green — main buttons, emphasis cards */
--primary-soft: #DCEFDA   /* selected state background */
--accent:       #E3A857   /* warm orange — milk numbers, visual anchor */
--accent-soft:  #FBEBD2
--success:      #3F8F7A   /* medicine/success state */
--success-soft: #DCEEE9
--warn:         #E38A72   /* alerts */
--warn-soft:    #FBE2DA
--radius-card:  20px
--shadow-card:  0 6px 18px rgba(51,66,46,0.08)
```

**Don't paint the whole UI green.** Green is only for primary actions; milk data uses warm orange as a visual anchor; medicine uses teal-green to differentiate from primary.

- Font: system default (`PingFang SC`), page title can use `STKaiti` / `Noto Serif SC` at 24-26px
- Minimum font size 14px (elderly readability); key numbers (ml) at 18-22px bold
- Minimum touch target 44px
- Card border-radius 20px, inner padding 16-20px

## Page Structure (from spec §4)

1. **Home (首页)** — date bar → last-feeding card (progress bar) → 4-grid quick entry (feed/poop/sleep/med) → today's timeline with time-range filter → floating mic button
2. **Voice modal** — record → transcribe → LLM parse → show confirmation card → user confirms save. **Never auto-save.**
3. **History (记录)** — day-by-day pagination, table layout with daily summary

## Data Model (from spec §6)

```json
{
  "id": "string",
  "date": "2026-06-07",
  "time": "09:10",
  "type": "feed | poop | sleep | med | food",
  "feedMethod": "母乳 | 混合 | 奶粉",
  "amountMl": 145,
  "sleepEvent": "入睡 | 醒来",
  "medName": "D3 | DHA | 益生菌 | 其他",
  "foodNote": "小米粥、南瓜泥（少许）",
  "note": "备注",
  "source": "manual | voice",
  "createdAt": "ISO timestamp"
}
```

Daily summary is derived data — compute on the fly, don't store separately.

## NLP Prompt (from spec §7.2)

System prompt for DeepSeek: extract `type`, `feedMethod`, `amountMl`, `sleepEvent`, `medName`, `foodNote`, `note` as JSON only. Convert Chinese numerals to digits. If unparseable, return `type: "unknown"` with original text in `note`. The prompt lives in the cloud function, never in frontend.

## Recommended Build Order (MVP, from spec §8)

1. Home page static layout + 4 quick-entry bottom sheets (no voice)
2. Cloud DB CRUD (today + history)
3. Time-range filter
4. History day-pagination + daily summary
5. Voice → transcribe → LLM parse → confirm → save (full pipeline)
6. Polish: empty states, loading states, error copy

## Project Config

`project.config.json` is already set up with `miniprogramRoot: "miniprogram/"` and `cloudfunctionRoot: "cloudfunctions/"`. Base library 3.4.7. AppID: `wx833dacd6c9c9d367`. Cloud env ID is in `miniprogram/env.js`.

## ⚠️ WeChat Mini Program Critical Rules

These rules come from hard debugging experience. Breaking any of them causes **blank pages** (all pages show white screen with no content).

### WXML: Never use `{{}}` expressions with `===` or ternary inside HTML attribute values

**Wrong** (causes blank pages):
```html
<text class="chip {{amount === item ? 'chip-active' : ''}}">...</text>
<view class="overlay {{showRange ? 'active' : ''}}">...</view>
```

**Right** — compute the full class string in JS and pass it as a data property:
```html
<text class="{{item.chipClass}}">...</text>
<view class="{{rangeOverlayClass}}">...</view>
```
```js
// In JS:
data: { chipClass: "chip" },
onPick: function(e) {
  this.setData({ chipClass: "chip chip-active" })
}
```

WXML `{{}}` in text content (between tags) is fine — simple ternary in text like `{{condition ? 'A' : 'B'}}` works. The problem is specifically `{{}}` inside **attribute values** (`class="..."`, `style="..."`).

### WXSS: Never use CSS `inset` shorthand

**Wrong**: `inset: 0;`
**Right**: `top: 0; right: 0; bottom: 0; left: 0;`

### WXSS: Never use CSS custom properties (`--var`) on the `page` selector

They may not work across all base library versions. Use hardcoded color values directly in selectors. The `page` selector should only set basic properties (background, color, font-size).

### JavaScript: Always use ES5 syntax (no arrow functions, no template literals, no destructuring, no `const`/`let`)

Even though `project.config.json` has `"es6": true`, the minifier/transpiler can silently break ES6 code, resulting in blank pages with no console error.

**Wrong**:
```js
const { todayKey } = require("../../utils/date")
Page({
  onShow() { this.load() },
  loadData() {
    const items = list.map(e => `奶粉 ${e.milkAmount}ml`)
  }
})
```

**Right**:
```js
var todayKey = require("../../utils/date").todayKey
Page({
  onShow: function() { this.load() },
  loadData: function() {
    var that = this
    var items = list.map(function(e) { return "奶粉 " + e.milkAmount + "ml" })
  }
})
```

### WXML attributes: Boolean attributes need explicit values

**Wrong**: `<scroll-view scroll-x>`
**Right**: `<scroll-view scroll-x="{{true}}">`

### Cloud functions: Each function must be self-contained

Do not `require()` a shared file from a sibling directory. WeChat Cloud deploys each function independently — shared files don't resolve at runtime unless uploaded with every function that needs them. Duplicate helper code in each cloud function.

### Cloud functions: Use `process.env` for secrets

API keys (DeepSeek, etc.) go in Cloud Development Console → Environment → Environment Variables. Access via `process.env.DEEPSEEK_API_KEY`. Never hardcode keys.

## Current Architecture

### Frontend (`miniprogram/`)

| File/Dir | Purpose |
|---|---|
| `app.js` | Cloud init with error handling |
| `app.json` | Pages + tabBar (今日/统计/记录/我的) |
| `app.wxss` | Global styles — hardcoded design token values, utility classes |
| `env.js` | `CLOUD_ENV_ID` export |
| `services/api.js` | All `wx.cloud.callFunction` calls + `ensureFamily()` + error helpers (`isFamilyRequired`, `isLoginRequired`, `friendlyMessage`) |
| `utils/date.js` | `todayKey`, `formatDateKey`, `formatTimeHM`, `addDays`, `weekdayCN`, `monthDayCN`, `timeAgoCN` |
| `utils/constants.js` | `MILK_QUICK`, `SOLID_PRESETS`, `SOLID_PORTIONS`, `MED_PRESETS`, `POOP_TYPES`, `POOP_COLORS`, `TIME_FILTERS` |
| `pages/today/` | Home: summary card + last-feed card + 4-grid quick entry + timeline with time filter + floating mic button + custom range overlay |
| `pages/stats/` | Stats: today card + 7/30 day toggle + daily rows |
| `pages/records/` | History: day navigation + log table + daily summary |
| `pages/me/` | Family: create/join family code, clear data |
| `pages/entry-milk/` | Milk entry with quick chips + stepper + note |
| `pages/entry-solid/` | Solid food entry with presets + portion + note |
| `pages/entry-med/` | Medicine entry with AD/D3/DHA/Ca presets + note |
| `pages/entry-poop/` | Poop entry with type/color chips + note |
| `pages/voice/` | Text NLP entry: type → DeepSeek parse → confirm card → save; fallback local regex parser; voice recording stub |

### Cloud Functions (`cloudfunctions/`)

Each has `index.js` + `package.json` (dep: `wx-server-sdk@latest`). All follow pattern: `cloud.init` → `requireFamilyId()` (OPENID check → family lookup) → query with `familyId` filter.

| Function | Purpose |
|---|---|
| `family_create` | Create family with unique 6-char join code, auto-add member |
| `family_join` | Join existing family by join code |
| `family_get` | Get current user's family status |
| `event_add` | Add event (milk/solid/med/poop/sleep) with type-specific validation |
| `event_list_by_date` | List events for a date, ordered by ts desc |
| `event_delete` | Delete event with ownership check |
| `event_clear_all` | Delete all events for the family (paginated) |
| `summary_daily` | Aggregate: milk count/total, solid count, poop count, med checkmarks, lastMilk |
| `stats_range` | N-day (max 90) summary rows |
| `nlp_parse` | Call DeepSeek API (`deepseek-v4-flash`, `response_format: json_object`) to parse Chinese feeding description into structured JSON |

### Data Model

Three collections in cloud DB:
- **families**: `{ joinCode, createdAt }`
- **family_members**: `{ openid, familyId, joinedAt }`
- **events**: `{ familyId, type, dateKey, ts, note, createdAt }` + type-specific fields (`milkAmount`, `solidItem`, `solidPortion`, `medName`, `medNameLabel`, `poopType`, `poopColor`, `sleepEvent`)

### Error Protocol

Cloud functions throw specific error messages that the frontend classifies:
- `login_required` → OPENID missing (prompt re-login)
- `family_required` → user not in any family (prompt create/join)
- Collection/collection → DB collections not created (prompt check console)

`api.addEvent()` auto-calls `ensureFamily()` which calls `family_create` if user has no family yet.
