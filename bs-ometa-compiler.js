class BSOMetaParser extends OMeta {
	["space"]() {
		return this._or((function () { return OMeta.prototype._superApplyWithArgs(this,'space') }),(function () { return this._applyWithArgs("fromTo","//", "\n") }),(function () { return this._applyWithArgs("fromTo","/*", "*/") }))
	}
	["nameFirst"]() {
		return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "_": return "_"
		case "$": return "$"
		default: throw fail
	}}).call(this) }),(function () { return this._apply("letter") }))
	}
	["nameRest"]() {
		return this._or((function () { return this._apply("nameFirst") }),(function () { return this._apply("digit") }))
	}
	["tsName"]() {
		return this._consumedBy((function () { return (function () {this._apply("nameFirst"); return this._many((function () { return this._apply("nameRest") }))}).call(this) }))
	}
	["name"]() {
		return (function () {this._apply("spaces"); return this._apply("tsName")}).call(this)
	}
	["hexDigit"]() {
		var x,v;return (function () {x=this._apply("char"); v=hexDigits.indexOf(x.toLowerCase()); this._pred((v >= (0))); return v}).call(this)
	}
	["eChar"]() {
		var s;return this._or((function () { return (function () {s=this._consumedBy((function () { return (function () {this._applyWithArgs("exactly","\\"); return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "u": return (function () {this._apply("hexDigit"); this._apply("hexDigit"); this._apply("hexDigit"); return this._apply("hexDigit")}).call(this)
		case "x": return (function () {this._apply("hexDigit"); return this._apply("hexDigit")}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return this._apply("char") }))}).call(this) })); return unescape(s)}).call(this) }),(function () { return this._apply("char") }))
	}
	["tsString"]() {
		var xs;return (function () {this._applyWithArgs("exactly","'"); xs=this._many((function () { return (function () {this._not((function () { return this._applyWithArgs("exactly","'") })); return this._apply("eChar")}).call(this) })); this._applyWithArgs("exactly","'"); return xs.join("")}).call(this)
	}
	["characters"]() {
		var xs;return (function () {this._applyWithArgs("exactly","`"); this._applyWithArgs("exactly","`"); xs=this._many((function () { return (function () {this._not((function () { return (function () {this._applyWithArgs("exactly","'"); return this._applyWithArgs("exactly","'")}).call(this) })); return this._apply("eChar")}).call(this) })); this._applyWithArgs("exactly","'"); this._applyWithArgs("exactly","'"); return ["App","seq",sourceString(xs.join(""))]}).call(this)
	}
	["sCharacters"]() {
		var xs;return (function () {this._applyWithArgs("exactly","\""); xs=this._many((function () { return (function () {this._not((function () { return this._applyWithArgs("exactly","\"") })); return this._apply("eChar")}).call(this) })); this._applyWithArgs("exactly","\""); return ["App","token",sourceString(xs.join(""))]}).call(this)
	}
	["string"]() {
		var xs;return (function () {xs=this._or((function () { return (function () {(function() {
	switch(this._apply('anything')) {
		case "#": return "#"
		case "`": return "`"
		default: throw fail
	}}).call(this); return this._apply("tsName")}).call(this) }),(function () { return this._apply("tsString") })); return ["App","exactly",sourceString(xs)]}).call(this)
	}
	["number"]() {
		var n;return (function () {n=this._consumedBy((function () { return (function () {this._opt((function () { return this._applyWithArgs("exactly","-") })); return this._many1((function () { return this._apply("digit") }))}).call(this) })); return ["App","exactly",n]}).call(this)
	}
	["keyword"]() {
		var xs;return (function () {xs=this._apply("anything"); this._applyWithArgs("token",xs); this._not((function () { return this._apply("letterOrDigit") })); return xs}).call(this)
	}
	["args"]() {
		var xs;return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "(": return (function () {xs=this._applyWithArgs("listOf","hostExpr", ","); this._applyWithArgs("token",")"); return xs}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {this._apply("empty"); return []}).call(this) }))
	}
	["application"]() {
		var rule,as,grm;return this._or((function () { return (function () {this._applyWithArgs("token","^"); rule=this._apply("name"); as=this._apply("args"); return ["App","super",(("'" + rule) + "'")].concat(as)}).call(this) }),(function () { return (function () {grm=this._apply("name"); this._applyWithArgs("token","."); rule=this._apply("name"); as=this._apply("args"); return ["App","foreign",grm,(("'" + rule) + "'")].concat(as)}).call(this) }),(function () { return (function () {rule=this._apply("name"); as=this._apply("args"); return ["App",rule].concat(as)}).call(this) }))
	}
	["hostExpr"]() {
		var r;return (function () {r=this._applyWithArgs("foreign",BSSemActionParser, 'expr'); return this._applyWithArgs("foreign",BSJSTranslator, 'trans', r)}).call(this)
	}
	["curlyHostExpr"]() {
		var r;return (function () {r=this._applyWithArgs("foreign",BSSemActionParser, 'curlySemAction'); return this._applyWithArgs("foreign",BSJSTranslator, 'trans', r)}).call(this)
	}
	["primHostExpr"]() {
		var r;return (function () {r=this._applyWithArgs("foreign",BSSemActionParser, 'semAction'); return this._applyWithArgs("foreign",BSJSTranslator, 'trans', r)}).call(this)
	}
	["atomicHostExpr"]() {
		return this._or((function () { return this._apply("curlyHostExpr") }),(function () { return this._apply("primHostExpr") }))
	}
	["semAction"]() {
		var x;return this._or((function () { return (function () {x=this._apply("curlyHostExpr"); return ["Act",x]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","!"); x=this._apply("atomicHostExpr"); return ["Act",x]}).call(this) }))
	}
	["arrSemAction"]() {
		var x;return (function () {this._applyWithArgs("token","->"); x=this._apply("atomicHostExpr"); return ["Act",x]}).call(this)
	}
	["semPred"]() {
		var x;return (function () {this._applyWithArgs("token","?"); x=this._apply("atomicHostExpr"); return ["Pred",x]}).call(this)
	}
	["expr"]() {
		var x,xs;return this._or((function () { return (function () {x=this._applyWithArgs("expr5",true); xs=this._many1((function () { return (function () {this._applyWithArgs("token","|"); return this._applyWithArgs("expr5",true)}).call(this) })); return ["Or",x].concat(xs)}).call(this) }),(function () { return (function () {x=this._applyWithArgs("expr5",true); xs=this._many1((function () { return (function () {this._applyWithArgs("token","||"); return this._applyWithArgs("expr5",true)}).call(this) })); return ["XOr",x].concat(xs)}).call(this) }),(function () { return this._applyWithArgs("expr5",false) }))
	}
	["expr5"]() {
		var ne,x,xs;return (function () {ne=this._apply("anything"); return this._or((function () { return (function () {x=this._apply("interleavePart"); xs=this._many1((function () { return (function () {this._applyWithArgs("token","&&"); return this._apply("interleavePart")}).call(this) })); return ["Interleave",x].concat(xs)}).call(this) }),(function () { return this._applyWithArgs("expr4",ne) }))}).call(this)
	}
	["interleavePart"]() {
		var part;return this._or((function () { return (function () {this._applyWithArgs("token","("); part=this._applyWithArgs("expr4",true); this._applyWithArgs("token",")"); return ["1",part]}).call(this) }),(function () { return (function () {part=this._applyWithArgs("expr4",true); return this._applyWithArgs("modedIPart",part)}).call(this) }))
	}
	["modedIPart"]() {
		var part;return this._or((function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","And"); return this._form((function () { return (function () {this._applyWithArgs("exactly","Many"); return part=this._apply("anything")}).call(this) }))}).call(this) })); return ["*",part]}).call(this) }),(function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","And"); return this._form((function () { return (function () {this._applyWithArgs("exactly","Many1"); return part=this._apply("anything")}).call(this) }))}).call(this) })); return ["+",part]}).call(this) }),(function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","And"); return this._form((function () { return (function () {this._applyWithArgs("exactly","Opt"); return part=this._apply("anything")}).call(this) }))}).call(this) })); return ["?",part]}).call(this) }),(function () { return (function () {part=this._apply("anything"); return ["1",part]}).call(this) }))
	}
	["expr4"]() {
		var ne,xs,act;return (function () {ne=this._apply("anything"); return this._or((function () { return (function () {xs=this._many((function () { return this._apply("expr3") })); act=this._apply("arrSemAction"); return ["And"].concat(xs).concat([act])}).call(this) }),(function () { return (function () {this._pred(ne); xs=this._many1((function () { return this._apply("expr3") })); return ["And"].concat(xs)}).call(this) }),(function () { return (function () {this._pred((ne == false)); xs=this._many((function () { return this._apply("expr3") })); return ["And"].concat(xs)}).call(this) }))}).call(this)
	}
	["optIter"]() {
		var x;return (function () {x=this._apply("anything"); return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "*": return ["Many",x]
		case "+": return ["Many1",x]
		case "?": return ["Opt",x]
		default: throw fail
	}}).call(this) }),(function () { return (function () {this._apply("empty"); return x}).call(this) }))}).call(this)
	}
	["optBind"]() {
		var x,n;return (function () {x=this._apply("anything"); return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case ":": return (function () {n=this._apply("name"); return (function (){(this["locals"][n]=true);return ["Set",n,x]}).call(this)}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {this._apply("empty"); return x}).call(this) }))}).call(this)
	}
	["expr3"]() {
		var n,x,e;return this._or((function () { return (function () {this._applyWithArgs("token",":"); n=this._apply("name"); return (function (){(this["locals"][n]=true);return ["Set",n,["App","anything"]]}).call(this)}).call(this) }),(function () { return (function () {e=this._or((function () { return (function () {x=this._apply("expr2"); return this._applyWithArgs("optIter",x)}).call(this) }),(function () { return this._apply("semAction") })); return this._applyWithArgs("optBind",e)}).call(this) }),(function () { return this._apply("semPred") }))
	}
	["expr2"]() {
		var x;return this._or((function () { return (function () {this._applyWithArgs("token","~"); x=this._apply("expr2"); return ["Not",x]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","&"); x=this._apply("expr1"); return ["Lookahead",x]}).call(this) }),(function () { return this._apply("expr1") }))
	}
	["expr1"]() {
		var x;return this._or((function () { return this._apply("application") }),(function () { return (function () {x=this._or((function () { return this._applyWithArgs("keyword","undefined") }),(function () { return this._applyWithArgs("keyword","nil") }),(function () { return this._applyWithArgs("keyword","true") }),(function () { return this._applyWithArgs("keyword","false") })); return ["App","exactly",x]}).call(this) }),(function () { return (function () {this._apply("spaces"); return this._or((function () { return this._apply("characters") }),(function () { return this._apply("sCharacters") }),(function () { return this._apply("string") }),(function () { return this._apply("number") }))}).call(this) }),(function () { return (function () {this._applyWithArgs("token","["); x=this._apply("expr"); this._applyWithArgs("token","]"); return ["Form",x]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","<"); x=this._apply("expr"); this._applyWithArgs("token",">"); return ["ConsBy",x]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","@<"); x=this._apply("expr"); this._applyWithArgs("token",">"); return ["IdxConsBy",x]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","("); x=this._apply("expr"); this._applyWithArgs("token",")"); return x}).call(this) }))
	}
	["ruleName"]() {
		return this._or((function () { return this._apply("name") }),(function () { return (function () {this._apply("spaces"); return this._apply("tsString")}).call(this) }))
	}
	["rule"]() {
		var n,x,xs;return (function () {this._lookahead((function () { return n=this._apply("ruleName") })); (this["locals"]=({})); x=this._applyWithArgs("rulePart",n); xs=this._many((function () { return (function () {this._applyWithArgs("token",","); return this._applyWithArgs("rulePart",n)}).call(this) })); return ["Rule",n,Object.keys(this["locals"]),["Or",x].concat(xs)]}).call(this)
	}
	["rulePart"]() {
		var rn,n,b1,b2;return (function () {rn=this._apply("anything"); n=this._apply("ruleName"); this._pred((n == rn)); b1=this._applyWithArgs("expr4",false); return this._or((function () { return (function () {this._applyWithArgs("token","="); b2=this._apply("expr"); return ["And",b1,b2]}).call(this) }),(function () { return (function () {this._apply("empty"); return b1}).call(this) }))}).call(this)
	}
	["grammar"]() {
		var n,sn,rs;return (function () {this._applyWithArgs("keyword","ometa"); n=this._apply("name"); sn=this._or((function () { return (function () {this._applyWithArgs("token","<:"); return this._apply("name")}).call(this) }),(function () { return (function () {this._apply("empty"); return "OMeta"}).call(this) })); this._applyWithArgs("token","{"); rs=this._applyWithArgs("listOf","rule", ","); this._applyWithArgs("token","}"); return this._applyWithArgs("foreign",BSOMetaOptimizer, 'optimizeGrammar', ["Grammar",n,sn].concat(rs))}).call(this)
	}
}var hexDigits="0123456789abcdef";class BSOMetaTranslator extends OMeta {
	["App"]() {
		var args,rule;return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "super": return (function () {args=this._many1((function () { return this._apply("anything") })); return [this["sName"],".prototype._superApplyWithArgs(this,",args.join(", "),")"].join("")}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {rule=this._apply("anything"); args=this._many1((function () { return this._apply("anything") })); return ["this._applyWithArgs(\"",rule,"\",",args.join(", "),")"].join("")}).call(this) }),(function () { return (function () {rule=this._apply("anything"); return ["this._apply(\"",rule,"\")"].join("")}).call(this) }))
	}
	["Act"]() {
		var expr;return (function () {expr=this._apply("anything"); return expr}).call(this)
	}
	["Pred"]() {
		var expr;return (function () {expr=this._apply("anything"); return ["this._pred(",expr,")"].join("")}).call(this)
	}
	["Or"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("transFn") })); return ["this._or(",xs.join(","),")"].join("")}).call(this)
	}
	["XOr"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("transFn") })); xs.unshift(sourceString(((this["name"] + ".") + this["rName"]))); return ["this._xor(",xs.join(","),")"].join("")}).call(this)
	}
	["And"]() {
		var xs,y;return this._or((function () { return (function () {xs=this._many((function () { return this._applyWithArgs("notLast","trans") })); y=this._apply("trans"); xs.push(("return " + y)); return ["(function () {",xs.join("; "),"}).call(this)"].join("")}).call(this) }),(function () { return "undefined" }))
	}
	["Opt"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._opt(",x,")"].join("")}).call(this)
	}
	["Many"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._many(",x,")"].join("")}).call(this)
	}
	["Many1"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._many1(",x,")"].join("")}).call(this)
	}
	["Set"]() {
		var n,v;return (function () {n=this._apply("anything"); v=this._apply("trans"); return [n,"=",v].join("")}).call(this)
	}
	["Not"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._not(",x,")"].join("")}).call(this)
	}
	["Lookahead"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._lookahead(",x,")"].join("")}).call(this)
	}
	["Form"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._form(",x,")"].join("")}).call(this)
	}
	["ConsBy"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._consumedBy(",x,")"].join("")}).call(this)
	}
	["IdxConsBy"]() {
		var x;return (function () {x=this._apply("transFn"); return ["this._idxConsumedBy(",x,")"].join("")}).call(this)
	}
	["JumpTable"]() {
		var cases;return (function () {cases=this._many((function () { return this._apply("jtCase") })); return this.jumpTableCode(cases)}).call(this)
	}
	["Interleave"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("intPart") })); return ["this._interleave(",xs.join(","),")"].join("")}).call(this)
	}
	["Rule"]() {
		var name,ls,body;return (function () {name=this._apply("anything"); (this["rName"]=name); ls=this._apply("locals"); body=this._apply("trans"); return ["\t[\"",name,"\"]() {\n\t\t",ls,"return ",body,"\n\t}"].join("")}).call(this)
	}
	["Grammar"]() {
		var name,sName,rules;return (function () {name=this._apply("anything"); sName=this._apply("anything"); (this["name"]=name); (this["sName"]=sName); rules=this._many((function () { return this._apply("trans") })); return ["class ",name," extends ",sName," {\n",rules.join("\n"),"\n}"].join("")}).call(this)
	}
	["intPart"]() {
		var mode,part;return (function () {this._form((function () { return (function () {mode=this._apply("anything"); return part=this._apply("transFn")}).call(this) })); return ((sourceString(mode) + ",") + part)}).call(this)
	}
	["jtCase"]() {
		var x,e;return (function () {this._form((function () { return (function () {x=this._apply("anything"); return e=this._apply("trans")}).call(this) })); return [sourceString(x),e]}).call(this)
	}
	["locals"]() {
		var vs;return this._or((function () { return (function () {this._form((function () { return vs=this._many1((function () { return this._apply("string") })) })); return ["var ",vs.join(","),";"].join("")}).call(this) }),(function () { return (function () {this._form((function () { return undefined })); return ""}).call(this) }))
	}
	["trans"]() {
		var t,ans;return (function () {this._form((function () { return (function () {t=this._apply("anything"); return ans=this._applyWithArgs("apply",t)}).call(this) })); return ans}).call(this)
	}
	["transFn"]() {
		var x;return (function () {x=this._apply("trans"); return ["(function () { return ",x," })"].join("")}).call(this)
	}
}(BSOMetaTranslator["prototype"]["jumpTableCode"]=(function (cases){var s=("(function() {\n" + "\tswitch(this._apply('anything')) {\n");for(var i=(0);(i < cases["length"]);++i){(s+=(((("\t\tcase " + cases[i][(0)]) + ": return ") + cases[i][(1)]) + "\n"))};(s+=(("\t\tdefault: throw fail\n" + "\t}") + "}).call(this)"));return s}))
