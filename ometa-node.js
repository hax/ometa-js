function translateCode(s) {
  var tree = BSOMetaJSParser.matchAll(s, "topLevel", undefined, (m, i) => {
		const e = new Error('parse error')
		e.errorPos = i
		throw e
	})
  return BSOMetaJSTranslator.match(tree, "trans", undefined, (m, i) => {
		const e = new Error('codegen error')
		e.errorPos = i
		throw e
	})
}

exports.OMeta = OMeta
exports.fail = fail
exports.translateCode = translateCode
