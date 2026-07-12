# 宝宝喂养记录（微信小程序 + 云开发）

## 目录结构

- miniprogram：小程序前端
- cloudfunctions：云函数（用于“家庭码共享 + 事件CRUD + 日汇总/统计”）

## 本地运行

1. 安装微信开发者工具
2. 导入项目目录：`baby_feed_miniapp`
3. 在开发者工具里开通云开发
4. 在“云开发 / 云函数”中依次上传并部署云函数（右键函数目录 -> 上传并部署：云端安装依赖）

如果遇到 `Environment not found`（没有默认环境），请把云开发环境 ID 填到 [env.js](file:///Users/xuming/Documents/trae_projects/baby_feed_miniapp/miniprogram/env.js) 的 `CLOUD_ENV_ID`，再重新编译。

## 云开发准备

云函数依赖 `wx-server-sdk`，在微信开发者工具中部署时会自动安装依赖。

## 云函数清单

- family_create：创建家庭码（若已加入则返回已有家庭）
- family_join：加入家庭码
- family_get：获取当前是否已加入家庭
- event_add：新增记录
- event_list_by_date：按天拉取记录列表
- summary_daily：当天汇总
- stats_range：近N天简表
- event_delete：删除单条记录
- event_clear_all：清空家庭下全部记录
- nlp_parse：自然语言解析（可选，需配置 DeepSeek Key）

## 数据集合

程序使用云开发数据库中的以下集合：

- families
- family_members
- events

如果你的云环境没有自动生成这些集合，请在云开发控制台里手动创建后再测试保存链路。

## 自然语言解析（DeepSeek，可选）

云函数 `nlp_parse` 通过 DeepSeek Chat Completions 接口做结构化解析，要求在云开发环境里配置环境变量：

- `DEEPSEEK_API_KEY`

配置方式：云开发控制台 -> 环境 -> 环境变量 -> 新增（不要把 Key 写进代码或提交到仓库）。

## 使用说明（第一版）

- 今日：一键记录（喝奶/辅食/用药/便便）+ 当日汇总 + 最近记录
- 记录：选择日期查看当天记录 + 当天汇总
- 统计：今天/近7天/近30天
- 我的：创建/加入家庭码（家人共享同一套数据）
