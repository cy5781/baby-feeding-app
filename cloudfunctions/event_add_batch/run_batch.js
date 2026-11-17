function runBatch(events, deps) {
  return Promise.all(events.map(function (evt, i) {
    var result = deps.validate(evt)
    if (!result.ok) {
      return { index: i, ok: false, reason: result.reason }
    }

    var data = {}
    for (var k in result.data) data[k] = result.data[k]
    data.familyId = deps.familyId
    data.source = "photo"
    data.createdAt = deps.createdAt()

    return deps.add(data).then(function (res) {
      return { index: i, ok: true, id: res._id }
    }).catch(function () {
      return { index: i, ok: false, reason: "db_error" }
    })
  })).then(function (results) {
    var ids = []
    var failed = []
    for (var i = 0; i < results.length; i++) {
      if (results[i].ok) ids.push(results[i].id)
      else failed.push({ index: results[i].index, reason: results[i].reason })
    }
    return { saved: ids.length, ids: ids, failed: failed }
  })
}

module.exports = { runBatch: runBatch }
