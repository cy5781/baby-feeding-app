var MILK_QUICK = [60, 100, 130, 145, 160, 180]

var SOLID_PRESETS = ["米糊", "蛋黄", "面条", "粥", "蔬菜泥", "馒头", "小米粥", "南瓜泥"]

var SOLID_PORTIONS = ["少量", "半碗", "一碗", "很多"]

var MED_PRESETS = [
  { key: "AD", label: "AD" },
  { key: "D3", label: "D3" },
  { key: "DHA", label: "DHA" },
  { key: "CALCIUM", label: "液体钙" }
]

var POOP_TYPES = ["干", "正常", "稀"]

var POOP_COLORS = ["黄", "绿", "褐", "黑"]

var POOP_AMOUNTS = ["少", "正常", "多"]

var TIME_FILTERS = [
  { key: "all", label: "全天" },
  { key: "6-12", label: "上午" },
  { key: "12-18", label: "下午" },
  { key: "18-6", label: "晚上" }
]

module.exports = {
  MILK_QUICK: MILK_QUICK,
  SOLID_PRESETS: SOLID_PRESETS,
  SOLID_PORTIONS: SOLID_PORTIONS,
  MED_PRESETS: MED_PRESETS,
  POOP_TYPES: POOP_TYPES,
  POOP_COLORS: POOP_COLORS,
  POOP_AMOUNTS: POOP_AMOUNTS,
  TIME_FILTERS: TIME_FILTERS
}
