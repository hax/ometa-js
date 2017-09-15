class BSOMetaJSParser extends BSJSParser {
	["srcElem"]() {
		var r;return this._or((function () { return (function () {this._apply("spaces"); r=this._applyWithArgs("foreign",BSOMetaParser, 'grammar'); this._apply("sc"); return r}).call(this) }),(function () { return BSJSParser.prototype._superApplyWithArgs(this,'srcElem') }))
	}
}class BSOMetaJSTranslator extends BSJSTranslator {
	["Grammar"]() {
		return this._applyWithArgs("foreign",BSOMetaTranslator, 'Grammar')
	}
}
