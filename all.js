'use strict'

//lib.js

// escape characters
var escapeStringFor = {}
for (var c = 0; c < 128; c++)
  escapeStringFor[c] = String.fromCharCode(c)
escapeStringFor["'".charCodeAt(0)]  = "\\'"
escapeStringFor['"'.charCodeAt(0)]  = '\\"'
escapeStringFor["\\".charCodeAt(0)] = "\\\\"
escapeStringFor["\b".charCodeAt(0)] = "\\b"
escapeStringFor["\f".charCodeAt(0)] = "\\f"
escapeStringFor["\n".charCodeAt(0)] = "\\n"
escapeStringFor["\r".charCodeAt(0)] = "\\r"
escapeStringFor["\t".charCodeAt(0)] = "\\t"
escapeStringFor["\v".charCodeAt(0)] = "\\v"
function escapeChar(c) {
  var charCode = c.charCodeAt(0)
  if (charCode < 128)
    return escapeStringFor[charCode]
  else if (128 <= charCode && charCode < 256)
    return "\\x" + charCode.toString(16).padStart(0, "0")
  else
    return "\\u" + charCode.toString(16).padStart(4, "0")
}

function unescape(s) {
  if (s.charAt(0) == '\\')
    switch (s.charAt(1)) {
      case "'":  return "'"
      case '"':  return '"'
      case '\\': return '\\'
      case 'b':  return '\b'
      case 'f':  return '\f'
      case 'n':  return '\n'
      case 'r':  return '\r'
      case 't':  return '\t'
      case 'v':  return '\v'
      case 'x':  return String.fromCharCode(parseInt(s.substring(2, 4), 16))
      case 'u':  return String.fromCharCode(parseInt(s.substring(2, 6), 16))
      default:   return s.charAt(1)
    }
  else
    return s
}


function sourceString(s) {
  return JSON.stringify(s)
}


// unique tags for objects (useful for making "hash tables")

var getTag = (function() {
  var numIdx = 0
  return function(x) {
    if (x === null || x === undefined)
      return x
    switch (typeof x) {
      case "boolean": return x ? "Btrue" : "Bfalse"
      case "string":  return "S" + x
      case "number":  return "N" + x
      default:        return x.hasOwnProperty("_id_") ? x._id_ : x._id_ = "R" + numIdx++
    }
  }
})()


//ometa-base.js

/*
  new syntax:
    #foo and `foo	match the string object 'foo' (it's also accepted in my JS)
    'abc'		match the string object 'abc'
    'c'			match the string object 'c'
    ``abc''		match the sequence of string objects 'a', 'b', 'c'
    "abc"		token('abc')
    [1 2 3]		match the array object [1, 2, 3]
    foo(bar)		apply rule foo with argument bar
    -> ...		semantic actions written in JS (see OMetaParser's atomicHostExpr rule)
*/

/*
ometa M {
  number = number:n digit:d -> { n * 10 + d.digitValue() }
         | digit:d          -> { d.digitValue() }
}

translates to...

class M extends OMeta {
  number() {
            return this._or(function() {
                              var n = this._apply("number"),
                                  d = this._apply("digit")
                              return n * 10 + d.digitValue()
                            },
                            function() {
                              var d = this._apply("digit")
                              return d.digitValue()
                            }
                           )
          }
}
M.matchAll("123456789", "number")
*/

// the failure exception

var fail = { toString: function() { return "match failed" } }

// streams and memoization

class OMInputStream {
  constructor(hd, tl) {
    this.memo = {}
    this.lst  = tl.lst
    this.idx  = tl.idx
    this.hd   = hd
    this.tl   = tl
  }
  head() { return this.hd }
  tail() { return this.tl }
  upTo(that) {
    const r = []
    let curr = this
    while (curr !== that) {
      r.push(curr.head())
      curr = curr.tail()
    }
    return typeof this.lst === 'string' ? r.join('') : r
  }
}

class OMInputStreamEnd extends OMInputStream {
  constructor(lst, idx) {
    super(undefined, {lst, idx})
  }
  head() { throw fail }
  tail() { throw fail }
}

class ListOMInputStream extends OMInputStream {
  constructor(lst, idx) {
    super(lst[idx], {lst, idx})
    this.tl = undefined
  }
  tail() {
    return this.tl || (this.tl = makeListOMInputStream(this.lst, this.idx + 1))
  }
}

function makeListOMInputStream(lst, idx) {
  return new (idx < lst.length ? ListOMInputStream : OMInputStreamEnd)(lst, idx)
}

function makeOMInputStreamProxy(target) {
  const o = Object.create(target)
  o.target = target
  o.memo = {}
  o.tl = undefined
  o.tail = function () { return this.tl || (this.tl = makeOMInputStreamProxy(target.tail())) }
  return o
}

// Failer (i.e., that which makes things fail) is used to detect (direct) left recursion and memoize failures

class Failer {
  constructor() {
    this.used = false
  }
}

// the OMeta "class" and basic functionality

class OMeta {
  _apply(rule) {
    var memoRec = this.input.memo[rule]
    if (memoRec == undefined) {
      var origInput = this.input,
          failer    = new Failer()
      if (this[rule] === undefined)
        throw 'tried to apply undefined rule "' + rule + '"'
      this.input.memo[rule] = failer
      this.input.memo[rule] = memoRec = {ans: this[rule](), nextInput: this.input}
      if (failer.used) {
        var sentinel = this.input
        while (true) {
          try {
            this.input = origInput
            var ans = this[rule]()
            if (this.input == sentinel)
              throw fail
            memoRec.ans       = ans
            memoRec.nextInput = this.input
          }
          catch (f) {
            if (f != fail)
              throw f
            break
          }
        }
      }
    }
    else if (memoRec instanceof Failer) {
      memoRec.used = true
      throw fail
    }
    this.input = memoRec.nextInput
    return memoRec.ans
  }

  // note: _applyWithArgs and _superApplyWithArgs are not memoized, so they can't be left-recursive
  _applyWithArgs(rule) {
    var ruleFn = this[rule]
    var ruleFnArity = ruleFn.length
    for (var idx = arguments.length - 1; idx >= ruleFnArity + 1; idx--) // prepend "extra" arguments in reverse order
      this._prependInput(arguments[idx])
    return ruleFnArity == 0 ?
             ruleFn.call(this) :
             ruleFn.apply(this, Array.prototype.slice.call(arguments, 1, ruleFnArity + 1))
  }
  _superApplyWithArgs(recv, rule) {
    var ruleFn = this[rule]
    var ruleFnArity = ruleFn.length
    for (var idx = arguments.length - 1; idx >= ruleFnArity + 2; idx--) // prepend "extra" arguments in reverse order
      recv._prependInput(arguments[idx])
    return ruleFnArity == 0 ?
             ruleFn.call(recv) :
             ruleFn.apply(recv, Array.prototype.slice.call(arguments, 2, ruleFnArity + 2))
  }
  _prependInput(v) {
    this.input = new OMInputStream(v, this.input)
  }

  // if you want your grammar (and its subgrammars) to memoize parameterized rules, invoke this method on it:
  memoizeParameterizedRules() {
    this._prependInput = function(v) {
      var newInput
      if (typeof v !== 'object') {
        newInput = this.input[getTag(v)]
        if (!newInput) {
          newInput = new OMInputStream(v, this.input)
          this.input[getTag(v)] = newInput
        }
      }
      else newInput = new OMInputStream(v, this.input)
      this.input = newInput
    }
    this._applyWithArgs = function(rule) {
      var ruleFnArity = this[rule].length
      for (var idx = arguments.length - 1; idx >= ruleFnArity + 1; idx--) // prepend "extra" arguments in reverse order
        this._prependInput(arguments[idx])
      return ruleFnArity == 0 ?
               this._apply(rule) :
               this[rule].apply(this, Array.prototype.slice.call(arguments, 1, ruleFnArity + 1))
    }
  }

  _pred(b) {
    if (b)
      return true
    throw fail
  }
  _not(x) {
    var origInput = this.input
    try { x.call(this) }
    catch (f) {
      if (f != fail)
        throw f
      this.input = origInput
      return true
    }
    throw fail
  }
  _lookahead(x) {
    var origInput = this.input,
        r         = x.call(this)
    this.input = origInput
    return r
  }
  _or() {
    var origInput = this.input
    for (var idx = 0; idx < arguments.length; idx++)
      try { this.input = origInput; return arguments[idx].call(this) }
      catch (f) {
        if (f != fail)
          throw f
      }
    throw fail
  }
  _xor(ruleName) {
    var origInput = this.input, idx = 1, newInput, ans
    while (idx < arguments.length) {
      try {
        this.input = origInput
        ans = arguments[idx].call(this)
        if (newInput)
          throw 'more than one choice matched by "exclusive-OR" in ' + ruleName
        newInput = this.input
      }
      catch (f) {
        if (f != fail)
          throw f
      }
      idx++
    }
    if (newInput) {
      this.input = newInput
      return ans
    }
    else
      throw fail
  }
  disableXORs() {
    this._xor = this._or
  }
  _opt(x) {
    var origInput = this.input, ans
    try { ans = x.call(this) }
    catch (f) {
      if (f != fail)
        throw f
      this.input = origInput
    }
    return ans
  }
  _many(x) {
    var ans = arguments[1] != undefined ? [arguments[1]] : []
    while (true) {
      var origInput = this.input
      try { ans.push(x.call(this)) }
      catch (f) {
        if (f != fail)
          throw f
        this.input = origInput
        break
      }
    }
    return ans
  }
  _many1(x) { return this._many(x, x.call(this)) }
  _form(x) {
    var v = this._apply("anything")
    if (!(typeof v === "string" || Array.isArray(v))) throw fail
    var origInput = this.input
    this.input = makeListOMInputStream(v, 0)
    var r = x.call(this)
    this._apply("end")
    this.input = origInput
    return v
  }
  _consumedBy(x) {
    var origInput = this.input
    x.call(this)
    return origInput.upTo(this.input)
  }
  _idxConsumedBy(x) {
    var origInput = this.input
    x.call(this)
    return {fromIdx: origInput.idx, toIdx: this.input.idx}
  }
  _interleave(mode1, part1, mode2, part2 /* ..., moden, partn */) {
    var currInput = this.input, ans = []
    for (var idx = 0; idx < arguments.length; idx += 2)
      ans[idx / 2] = (arguments[idx] == "*" || arguments[idx] == "+") ? [] : undefined
    while (true) {
      var idx = 0, allDone = true
      while (idx < arguments.length) {
        if (arguments[idx] != "0")
          try {
            this.input = currInput
            switch (arguments[idx]) {
              case "*": ans[idx / 2].push(arguments[idx + 1].call(this));                       break
              case "+": ans[idx / 2].push(arguments[idx + 1].call(this)); arguments[idx] = "*"; break
              case "?": ans[idx / 2] =    arguments[idx + 1].call(this);  arguments[idx] = "0"; break
              case "1": ans[idx / 2] =    arguments[idx + 1].call(this);  arguments[idx] = "0"; break
              default:  throw "invalid mode '" + arguments[idx] + "' in OMeta._interleave"
            }
            currInput = this.input
            break
          }
          catch (f) {
            if (f != fail)
              throw f
            // if this (failed) part's mode is "1" or "+", we're not done yet
            allDone = allDone && (arguments[idx] == "*" || arguments[idx] == "?")
          }
        idx += 2
      }
      if (idx == arguments.length) {
        if (allDone)
          return ans
        else
          throw fail
      }
    }
  }
  _currIdx() { return this.input.idx }

  // some basic rules
  anything() {
    var r = this.input.head()
    this.input = this.input.tail()
    return r
  }
  end() {
    return this._not(function() { return this._apply("anything") })
  }
  pos() {
    return this.input.idx
  }
  empty() { return true }
  apply(r) {
    return this._apply(r)
  }
  foreign(g, r) {
    const gi = new g()
    gi.input = makeOMInputStreamProxy(this.input)
    const ans = gi._apply(r)
    this.input = gi.input.target
    return ans
  }

  //  some useful "derived" rules
  exactly(wanted) {
    if (wanted === this._apply("anything"))
      return wanted
    throw fail
  }
  "true"() {
    var r = this._apply("anything")
    this._pred(r === true)
    return r
  }
  "false"() {
    var r = this._apply("anything")
    this._pred(r === false)
    return r
  }
  undefined() {
    var r = this._apply("anything")
    this._pred(r === undefined)
    return r
  }
  number() {
    var r = this._apply("anything")
    this._pred(typeof r === "number")
    return r
  }
  string() {
    var r = this._apply("anything")
    this._pred(typeof r === "string")
    return r
  }
  char() {
    var r = this._apply("anything")
    this._pred(typeof r === "string" && r.length == 1)
    return r
  }
  space() {
    var r = this._apply("char")
    this._pred(r.charCodeAt(0) <= 32)
    return r
  }
  spaces() {
    return this._many(function() { return this._apply("space") })
  }
  digit() {
    var r = this._apply("char")
    this._pred(r >= "0" && r <= "9")
    return r
  }
  lower() {
    var r = this._apply("char")
    this._pred(r >= "a" && r <= "z")
    return r
  }
  upper() {
    var r = this._apply("char")
    this._pred(r >= "A" && r <= "Z")
    return r
  }
  letter() {
    return this._or(function() { return this._apply("lower") },
                    function() { return this._apply("upper") })
  }
  letterOrDigit() {
    return this._or(function() { return this._apply("letter") },
                    function() { return this._apply("digit")  })
  }
  firstAndRest(first, rest)  {
     return this._many(function() { return this._apply(rest) }, this._apply(first))
  }
  seq(xs) {
    for (var idx = 0; idx < xs.length; idx++)
      this._applyWithArgs("exactly", xs[idx])
    return xs
  }
  notLast(rule) {
    var r = this._apply(rule)
    this._lookahead(function() { return this._apply(rule) })
    return r
  }
  listOf(rule, delim) {
    return this._or(function() {
                      var r = this._apply(rule)
                      return this._many(function() {
                                          this._applyWithArgs("token", delim)
                                          return this._apply(rule)
                                        },
                                        r)
                    },
                    function() { return [] })
  }
  token(cs) {
    this._apply("spaces")
    return this._applyWithArgs("seq", cs)
  }
  fromTo(x, y) {
    return this._consumedBy(function() {
                              this._applyWithArgs("seq", x)
                              this._many(function() {
                                this._not(function() { this._applyWithArgs("seq", y) })
                                this._apply("char")
                              })
                              this._applyWithArgs("seq", y)
                            })
  }

  initialize() {}
  // match and matchAll are a grammar's "public interface"
  _genericMatch(input, rule, args, matchFailed) {
    if (args == undefined)
      args = []
    var realArgs = [rule]
    for (var idx = 0; idx < args.length; idx++)
      realArgs.push(args[idx])
    var m = Object.create(this)
    m.input = input
    m.initialize()
    try { return realArgs.length == 1 ? m._apply.call(m, realArgs[0]) : m._applyWithArgs.apply(m, realArgs) }
    catch (f) {
      if (f == fail && matchFailed != undefined) {
        var input = m.input
        if (input.idx != undefined) {
          while (input.tl != undefined && input.tl.idx != undefined)
            input = input.tl
          input.idx--
        }
        return matchFailed(m, input.idx)
      }
      throw f
    }
  }
  static match(obj, rule, args, matchFailed) {
    const p = new this()
    return p._genericMatch(makeListOMInputStream([obj], 0),    rule, args, matchFailed)
  }
  static matchAll(listyObj, rule, args, matchFailed) {
    const p = new this()
    return p._genericMatch(makeListOMInputStream(listyObj, 0), rule, args, matchFailed)
  }
}


//bs-js-compiler.js

class BSJSParser extends OMeta {
	["space"]() {
		return this._or((function () { return OMeta.prototype._superApplyWithArgs(this,'space') }),(function () { return this._applyWithArgs("fromTo","//", "\n") }),(function () { return this._applyWithArgs("fromTo","/*", "*/") }))
	}
	["nameFirst"]() {
		return this._or((function () { return this._apply("letter") }),(function () { return (function() {
	switch(this._apply('anything')) {
		case "$": return "$"
		case "_": return "_"
		default: throw fail
	}}).call(this) }))
	}
	["nameRest"]() {
		return this._or((function () { return this._apply("nameFirst") }),(function () { return this._apply("digit") }))
	}
	["iName"]() {
		return this._consumedBy((function () { return (function () {this._apply("nameFirst"); return this._many((function () { return this._apply("nameRest") }))}).call(this) }))
	}
	["isKeyword"]() {
		var x;return (function () {x=this._apply("anything"); return this._pred(BSJSParser._isKeyword(x))}).call(this)
	}
	["name"]() {
		var n;return (function () {n=this._apply("iName"); this._not((function () { return this._applyWithArgs("isKeyword",n) })); return ["name",n]}).call(this)
	}
	["keyword"]() {
		var k;return (function () {k=this._apply("iName"); this._applyWithArgs("isKeyword",k); return [k,k]}).call(this)
	}
	["hexDigit"]() {
		var x,v;return (function () {x=this._apply("char"); v=hexDigits.indexOf(x.toLowerCase()); this._pred((v >= (0))); return v}).call(this)
	}
	["hexLit"]() {
		var n,d;return this._or((function () { return (function () {n=this._apply("hexLit"); d=this._apply("hexDigit"); return ((n * (16)) + d)}).call(this) }),(function () { return this._apply("hexDigit") }))
	}
	["number"]() {
		var n,f;return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "0": return (function () {this._applyWithArgs("exactly","x"); "0x"; n=this._apply("hexLit"); return ["number",n]}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {f=this._consumedBy((function () { return (function () {this._many1((function () { return this._apply("digit") })); return this._opt((function () { return (function () {this._applyWithArgs("exactly","."); return this._many1((function () { return this._apply("digit") }))}).call(this) }))}).call(this) })); return ["number",parseFloat(f)]}).call(this) }))
	}
	["escapeChar"]() {
		var s;return (function () {s=this._consumedBy((function () { return (function () {this._applyWithArgs("exactly","\\"); return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "u": return (function () {this._apply("hexDigit"); this._apply("hexDigit"); this._apply("hexDigit"); return this._apply("hexDigit")}).call(this)
		case "x": return (function () {this._apply("hexDigit"); return this._apply("hexDigit")}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return this._apply("char") }))}).call(this) })); return unescape(s)}).call(this)
	}
	["str"]() {
		var cs,n;return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "\"": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "\"": return (function () {this._applyWithArgs("exactly","\""); "\"\"\""; cs=this._many((function () { return (function () {this._not((function () { return (function () {this._applyWithArgs("exactly","\""); this._applyWithArgs("exactly","\""); this._applyWithArgs("exactly","\""); return "\"\"\""}).call(this) })); return this._apply("char")}).call(this) })); this._applyWithArgs("exactly","\""); this._applyWithArgs("exactly","\""); this._applyWithArgs("exactly","\""); "\"\"\""; return ["string",cs.join("")]}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {cs=this._many((function () { return this._or((function () { return this._apply("escapeChar") }),(function () { return (function () {this._not((function () { return this._applyWithArgs("exactly","\"") })); return this._apply("char")}).call(this) })) })); this._applyWithArgs("exactly","\""); return ["string",cs.join("")]}).call(this) }))
		case "'": return (function () {cs=this._many((function () { return this._or((function () { return this._apply("escapeChar") }),(function () { return (function () {this._not((function () { return this._applyWithArgs("exactly","'") })); return this._apply("char")}).call(this) })) })); this._applyWithArgs("exactly","'"); return ["string",cs.join("")]}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {(function() {
	switch(this._apply('anything')) {
		case "#": return "#"
		case "`": return "`"
		default: throw fail
	}}).call(this); n=this._apply("iName"); return ["string",n]}).call(this) }))
	}
	["special"]() {
		var s;return (function () {s=(function() {
	switch(this._apply('anything')) {
		case "(": return "("
		case ")": return ")"
		case "{": return "{"
		case "}": return "}"
		case "[": return "["
		case "]": return "]"
		case ",": return ","
		case ";": return ";"
		case "?": return "?"
		case ":": return ":"
		case "!": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "!=="
		default: throw fail
	}}).call(this) }),(function () { return "!=" }))
		default: throw fail
	}}).call(this) }),(function () { return "!" }))
		case "=": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "==="
		default: throw fail
	}}).call(this) }),(function () { return "==" }))
		default: throw fail
	}}).call(this) }),(function () { return "=" }))
		case ">": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return ">="
		default: throw fail
	}}).call(this) }),(function () { return ">" }))
		case "<": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "<="
		default: throw fail
	}}).call(this) }),(function () { return "<" }))
		case "+": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "+": return "++"
		case "=": return "+="
		default: throw fail
	}}).call(this) }),(function () { return "+" }))
		case "-": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "-": return "--"
		case "=": return "-="
		default: throw fail
	}}).call(this) }),(function () { return "-" }))
		case "*": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "*="
		default: throw fail
	}}).call(this) }),(function () { return "*" }))
		case "/": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "/="
		default: throw fail
	}}).call(this) }),(function () { return "/" }))
		case "%": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "%="
		default: throw fail
	}}).call(this) }),(function () { return "%" }))
		case "&": return (function() {
	switch(this._apply('anything')) {
		case "&": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "&&="
		default: throw fail
	}}).call(this) }),(function () { return "&&" }))
		default: throw fail
	}}).call(this)
		case "|": return (function() {
	switch(this._apply('anything')) {
		case "|": return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "=": return "||="
		default: throw fail
	}}).call(this) }),(function () { return "||" }))
		default: throw fail
	}}).call(this)
		case ".": return "."
		default: throw fail
	}}).call(this); return [s,s]}).call(this)
	}
	["tok"]() {
		return (function () {this._apply("spaces"); return this._or((function () { return this._apply("name") }),(function () { return this._apply("keyword") }),(function () { return this._apply("number") }),(function () { return this._apply("str") }),(function () { return this._apply("special") }))}).call(this)
	}
	["toks"]() {
		var ts;return (function () {ts=this._many((function () { return this._apply("token") })); this._apply("spaces"); this._apply("end"); return ts}).call(this)
	}
	["token"]() {
		var tt,t;return (function () {tt=this._apply("anything"); t=this._apply("tok"); this._pred((t[(0)] == tt)); return t[(1)]}).call(this)
	}
	["spacesNoNl"]() {
		return this._many((function () { return (function () {this._not((function () { return this._applyWithArgs("exactly","\n") })); return this._apply("space")}).call(this) }))
	}
	["expr"]() {
		var e,t,f,rhs;return (function () {e=this._apply("orExpr"); return this._or((function () { return (function () {this._applyWithArgs("token","?"); t=this._apply("expr"); this._applyWithArgs("token",":"); f=this._apply("expr"); return ["condExpr",e,t,f]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","="); rhs=this._apply("expr"); return ["set",e,rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","+="); rhs=this._apply("expr"); return ["mset",e,"+",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","-="); rhs=this._apply("expr"); return ["mset",e,"-",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","*="); rhs=this._apply("expr"); return ["mset",e,"*",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","/="); rhs=this._apply("expr"); return ["mset",e,"/",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","%="); rhs=this._apply("expr"); return ["mset",e,"%",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","&&="); rhs=this._apply("expr"); return ["mset",e,"&&",rhs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","||="); rhs=this._apply("expr"); return ["mset",e,"||",rhs]}).call(this) }),(function () { return (function () {this._apply("empty"); return e}).call(this) }))}).call(this)
	}
	["orExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("orExpr"); this._applyWithArgs("token","||"); y=this._apply("andExpr"); return ["binop","||",x,y]}).call(this) }),(function () { return this._apply("andExpr") }))
	}
	["andExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("andExpr"); this._applyWithArgs("token","&&"); y=this._apply("eqExpr"); return ["binop","&&",x,y]}).call(this) }),(function () { return this._apply("eqExpr") }))
	}
	["eqExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("eqExpr"); return this._or((function () { return (function () {this._applyWithArgs("token","=="); y=this._apply("relExpr"); return ["binop","==",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","!="); y=this._apply("relExpr"); return ["binop","!=",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","==="); y=this._apply("relExpr"); return ["binop","===",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","!=="); y=this._apply("relExpr"); return ["binop","!==",x,y]}).call(this) }))}).call(this) }),(function () { return this._apply("relExpr") }))
	}
	["relExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("relExpr"); return this._or((function () { return (function () {this._applyWithArgs("token",">"); y=this._apply("addExpr"); return ["binop",">",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token",">="); y=this._apply("addExpr"); return ["binop",">=",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","<"); y=this._apply("addExpr"); return ["binop","<",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","<="); y=this._apply("addExpr"); return ["binop","<=",x,y]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","instanceof"); y=this._apply("addExpr"); return ["binop","instanceof",x,y]}).call(this) }))}).call(this) }),(function () { return this._apply("addExpr") }))
	}
	["addExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("addExpr"); this._applyWithArgs("token","+"); y=this._apply("mulExpr"); return ["binop","+",x,y]}).call(this) }),(function () { return (function () {x=this._apply("addExpr"); this._applyWithArgs("token","-"); y=this._apply("mulExpr"); return ["binop","-",x,y]}).call(this) }),(function () { return this._apply("mulExpr") }))
	}
	["mulExpr"]() {
		var x,y;return this._or((function () { return (function () {x=this._apply("mulExpr"); this._applyWithArgs("token","*"); y=this._apply("unary"); return ["binop","*",x,y]}).call(this) }),(function () { return (function () {x=this._apply("mulExpr"); this._applyWithArgs("token","/"); y=this._apply("unary"); return ["binop","/",x,y]}).call(this) }),(function () { return (function () {x=this._apply("mulExpr"); this._applyWithArgs("token","%"); y=this._apply("unary"); return ["binop","%",x,y]}).call(this) }),(function () { return this._apply("unary") }))
	}
	["unary"]() {
		var p;return this._or((function () { return (function () {this._applyWithArgs("token","-"); p=this._apply("postfix"); return ["unop","-",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","+"); p=this._apply("postfix"); return ["unop","+",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","++"); p=this._apply("postfix"); return ["preop","++",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","--"); p=this._apply("postfix"); return ["preop","--",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","!"); p=this._apply("unary"); return ["unop","!",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","void"); p=this._apply("unary"); return ["unop","void",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","delete"); p=this._apply("unary"); return ["unop","delete",p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","typeof"); p=this._apply("unary"); return ["unop","typeof",p]}).call(this) }),(function () { return this._apply("postfix") }))
	}
	["postfix"]() {
		var p;return (function () {p=this._apply("primExpr"); return this._or((function () { return (function () {this._apply("spacesNoNl"); this._applyWithArgs("token","++"); return ["postop","++",p]}).call(this) }),(function () { return (function () {this._apply("spacesNoNl"); this._applyWithArgs("token","--"); return ["postop","--",p]}).call(this) }),(function () { return (function () {this._apply("empty"); return p}).call(this) }))}).call(this)
	}
	["primExpr"]() {
		var p,i,m,as,f;return this._or((function () { return (function () {p=this._apply("primExpr"); return this._or((function () { return (function () {this._applyWithArgs("token","["); i=this._apply("expr"); this._applyWithArgs("token","]"); return ["getp",i,p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","."); m=this._applyWithArgs("token","name"); this._applyWithArgs("token","("); as=this._applyWithArgs("listOf","expr", ","); this._applyWithArgs("token",")"); return ["send",m,p].concat(as)}).call(this) }),(function () { return (function () {this._applyWithArgs("token","."); f=this._applyWithArgs("token","name"); return ["getp",["string",f],p]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","("); as=this._applyWithArgs("listOf","expr", ","); this._applyWithArgs("token",")"); return ["call",p].concat(as)}).call(this) }))}).call(this) }),(function () { return this._apply("primExprHd") }))
	}
	["primExprHd"]() {
		var e,n,s,as,es;return this._or((function () { return (function () {this._applyWithArgs("token","("); e=this._apply("expr"); this._applyWithArgs("token",")"); return e}).call(this) }),(function () { return (function () {this._applyWithArgs("token","this"); return ["this"]}).call(this) }),(function () { return (function () {n=this._applyWithArgs("token","name"); return ["get",n]}).call(this) }),(function () { return (function () {n=this._applyWithArgs("token","number"); return ["number",n]}).call(this) }),(function () { return (function () {s=this._applyWithArgs("token","string"); return ["string",s]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","function"); return this._apply("funcRest")}).call(this) }),(function () { return (function () {this._applyWithArgs("token","new"); n=this._applyWithArgs("token","name"); this._applyWithArgs("token","("); as=this._applyWithArgs("listOf","expr", ","); this._applyWithArgs("token",")"); return ["new",n].concat(as)}).call(this) }),(function () { return (function () {this._applyWithArgs("token","["); es=this._applyWithArgs("listOf","expr", ","); this._applyWithArgs("token","]"); return ["arr"].concat(es)}).call(this) }),(function () { return this._apply("json") }),(function () { return this._apply("re") }))
	}
	["json"]() {
		var bs;return (function () {this._applyWithArgs("token","{"); bs=this._applyWithArgs("listOf","jsonBinding", ","); this._applyWithArgs("token","}"); return ["json"].concat(bs)}).call(this)
	}
	["jsonBinding"]() {
		var n,v;return (function () {n=this._apply("jsonPropName"); this._applyWithArgs("token",":"); v=this._apply("expr"); return ["binding",n,v]}).call(this)
	}
	["jsonPropName"]() {
		return this._or((function () { return this._applyWithArgs("token","name") }),(function () { return this._applyWithArgs("token","number") }),(function () { return this._applyWithArgs("token","string") }))
	}
	["re"]() {
		var x;return (function () {this._apply("spaces"); x=this._consumedBy((function () { return (function () {this._applyWithArgs("exactly","/"); this._apply("reBody"); this._applyWithArgs("exactly","/"); return this._many((function () { return this._apply("reFlag") }))}).call(this) })); return ["regExpr",x]}).call(this)
	}
	["reBody"]() {
		return (function () {this._apply("re1stChar"); return this._many((function () { return this._apply("reChar") }))}).call(this)
	}
	["re1stChar"]() {
		return this._or((function () { return (function () {this._not((function () { return (function() {
	switch(this._apply('anything')) {
		case "*": return "*"
		case "\\": return "\\"
		case "/": return "/"
		case "[": return "["
		default: throw fail
	}}).call(this) })); return this._apply("reNonTerm")}).call(this) }),(function () { return this._apply("escapeChar") }),(function () { return this._apply("reClass") }))
	}
	["reChar"]() {
		return this._or((function () { return this._apply("re1stChar") }),(function () { return (function() {
	switch(this._apply('anything')) {
		case "*": return "*"
		default: throw fail
	}}).call(this) }))
	}
	["reNonTerm"]() {
		return (function () {this._not((function () { return (function() {
	switch(this._apply('anything')) {
		case "\n": return "\n"
		case "\r": return "\r"
		default: throw fail
	}}).call(this) })); return this._apply("char")}).call(this)
	}
	["reClass"]() {
		return (function () {this._applyWithArgs("exactly","["); this._many((function () { return this._apply("reClassChar") })); return this._applyWithArgs("exactly","]")}).call(this)
	}
	["reClassChar"]() {
		return (function () {this._not((function () { return (function() {
	switch(this._apply('anything')) {
		case "[": return "["
		case "]": return "]"
		default: throw fail
	}}).call(this) })); return this._apply("reChar")}).call(this)
	}
	["reFlag"]() {
		return this._apply("nameFirst")
	}
	["formal"]() {
		return (function () {this._apply("spaces"); return this._applyWithArgs("token","name")}).call(this)
	}
	["funcRest"]() {
		var fs,body;return (function () {this._applyWithArgs("token","("); fs=this._applyWithArgs("listOf","formal", ","); this._applyWithArgs("token",")"); this._applyWithArgs("token","{"); body=this._apply("srcElems"); this._applyWithArgs("token","}"); return ["func",fs,body]}).call(this)
	}
	["sc"]() {
		return this._or((function () { return (function () {this._apply("spacesNoNl"); return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "\n": return "\n"
		default: throw fail
	}}).call(this) }),(function () { return this._lookahead((function () { return this._applyWithArgs("exactly","}") })) }),(function () { return this._apply("end") }))}).call(this) }),(function () { return this._applyWithArgs("token",";") }))
	}
	["binding"]() {
		var n,v;return (function () {n=this._applyWithArgs("token","name"); v=this._or((function () { return (function () {this._applyWithArgs("token","="); return this._apply("expr")}).call(this) }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); return ["var",n,v]}).call(this)
	}
	["block"]() {
		var ss;return (function () {this._applyWithArgs("token","{"); ss=this._apply("srcElems"); this._applyWithArgs("token","}"); return ss}).call(this)
	}
	["stmt"]() {
		var bs,c,t,f,s,i,u,n,v,e,cs,x;return this._or((function () { return this._apply("block") }),(function () { return (function () {this._applyWithArgs("token","var"); bs=this._applyWithArgs("listOf","binding", ","); this._apply("sc"); return ["begin"].concat(bs)}).call(this) }),(function () { return (function () {this._applyWithArgs("token","if"); this._applyWithArgs("token","("); c=this._apply("expr"); this._applyWithArgs("token",")"); t=this._apply("stmt"); f=this._or((function () { return (function () {this._applyWithArgs("token","else"); return this._apply("stmt")}).call(this) }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); return ["if",c,t,f]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","while"); this._applyWithArgs("token","("); c=this._apply("expr"); this._applyWithArgs("token",")"); s=this._apply("stmt"); return ["while",c,s]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","do"); s=this._apply("stmt"); this._applyWithArgs("token","while"); this._applyWithArgs("token","("); c=this._apply("expr"); this._applyWithArgs("token",")"); this._apply("sc"); return ["doWhile",s,c]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","for"); this._applyWithArgs("token","("); i=this._or((function () { return (function () {this._applyWithArgs("token","var"); return this._apply("binding")}).call(this) }),(function () { return this._apply("expr") }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); this._applyWithArgs("token",";"); c=this._or((function () { return this._apply("expr") }),(function () { return (function () {this._apply("empty"); return ["get","true"]}).call(this) })); this._applyWithArgs("token",";"); u=this._or((function () { return this._apply("expr") }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); this._applyWithArgs("token",")"); s=this._apply("stmt"); return ["for",i,c,u,s]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","for"); this._applyWithArgs("token","("); v=this._or((function () { return (function () {this._applyWithArgs("token","var"); n=this._applyWithArgs("token","name"); return ["var",n,["get","undefined"]]}).call(this) }),(function () { return this._apply("expr") })); this._applyWithArgs("token","in"); e=this._apply("expr"); this._applyWithArgs("token",")"); s=this._apply("stmt"); return ["forIn",v,e,s]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","switch"); this._applyWithArgs("token","("); e=this._apply("expr"); this._applyWithArgs("token",")"); this._applyWithArgs("token","{"); cs=this._many((function () { return this._or((function () { return (function () {this._applyWithArgs("token","case"); c=this._apply("expr"); this._applyWithArgs("token",":"); cs=this._apply("srcElems"); return ["case",c,cs]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","default"); this._applyWithArgs("token",":"); cs=this._apply("srcElems"); return ["default",cs]}).call(this) })) })); this._applyWithArgs("token","}"); return ["switch",e].concat(cs)}).call(this) }),(function () { return (function () {this._applyWithArgs("token","break"); this._apply("sc"); return ["break"]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","continue"); this._apply("sc"); return ["continue"]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","throw"); this._apply("spacesNoNl"); e=this._apply("expr"); this._apply("sc"); return ["throw",e]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","try"); t=this._apply("block"); this._applyWithArgs("token","catch"); this._applyWithArgs("token","("); e=this._applyWithArgs("token","name"); this._applyWithArgs("token",")"); c=this._apply("block"); f=this._or((function () { return (function () {this._applyWithArgs("token","finally"); return this._apply("block")}).call(this) }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); return ["try",t,e,c,f]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","return"); e=this._or((function () { return this._apply("expr") }),(function () { return (function () {this._apply("empty"); return ["get","undefined"]}).call(this) })); this._apply("sc"); return ["return",e]}).call(this) }),(function () { return (function () {this._applyWithArgs("token","with"); this._applyWithArgs("token","("); x=this._apply("expr"); this._applyWithArgs("token",")"); s=this._apply("stmt"); return ["with",x,s]}).call(this) }),(function () { return (function () {e=this._apply("expr"); this._apply("sc"); return e}).call(this) }),(function () { return (function () {this._applyWithArgs("token",";"); return ["get","undefined"]}).call(this) }))
	}
	["srcElem"]() {
		var n,f;return this._or((function () { return (function () {this._applyWithArgs("token","function"); n=this._applyWithArgs("token","name"); f=this._apply("funcRest"); return ["var",n,f]}).call(this) }),(function () { return this._apply("stmt") }))
	}
	["srcElems"]() {
		var ss;return (function () {ss=this._many((function () { return this._apply("srcElem") })); return ["begin"].concat(ss)}).call(this)
	}
	["topLevel"]() {
		var r;return (function () {r=this._apply("srcElems"); this._apply("spaces"); this._apply("end"); return r}).call(this)
	}
}var hexDigits="0123456789abcdef";(BSJSParser["keywords"]=({}));var keywords=["break","case","catch","continue","default","delete","do","else","finally","for","function","if","in","instanceof","new","return","switch","this","throw","try","typeof","var","void","while","with","ometa"];for(var idx=(0);(idx < keywords["length"]);idx++){(BSJSParser["keywords"][keywords[idx]]=true)}(BSJSParser["_isKeyword"]=(function (k){return this["keywords"].hasOwnProperty(k)}));class BSSemActionParser extends BSJSParser {
	["curlySemAction"]() {
		var r,s,ss;return this._or((function () { return (function () {this._applyWithArgs("token","{"); r=this._apply("expr"); this._apply("sc"); this._applyWithArgs("token","}"); this._apply("spaces"); return r}).call(this) }),(function () { return (function () {this._applyWithArgs("token","{"); ss=this._many((function () { return (function () {s=this._apply("srcElem"); this._lookahead((function () { return this._apply("srcElem") })); return s}).call(this) })); s=this._or((function () { return (function () {r=this._apply("expr"); this._apply("sc"); return ["return",r]}).call(this) }),(function () { return this._apply("srcElem") })); ss.push(s); this._applyWithArgs("token","}"); this._apply("spaces"); return ["send","call",["func",[],["begin"].concat(ss)],["this"]]}).call(this) }))
	}
	["semAction"]() {
		var r;return this._or((function () { return this._apply("curlySemAction") }),(function () { return (function () {r=this._apply("primExpr"); this._apply("spaces"); return r}).call(this) }))
	}
}class BSJSTranslator extends OMeta {
	["trans"]() {
		var t,ans;return (function () {this._form((function () { return (function () {t=this._apply("anything"); return ans=this._applyWithArgs("apply",t)}).call(this) })); return ans}).call(this)
	}
	["curlyTrans"]() {
		var r,rs;return this._or((function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","begin"); return r=this._apply("curlyTrans")}).call(this) })); return r}).call(this) }),(function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","begin"); return rs=this._many((function () { return this._apply("trans") }))}).call(this) })); return (("{" + rs.join(";")) + "}")}).call(this) }),(function () { return (function () {r=this._apply("trans"); return (("{" + r) + "}")}).call(this) }))
	}
	["this"]() {
		return "this"
	}
	["break"]() {
		return "break"
	}
	["continue"]() {
		return "continue"
	}
	["number"]() {
		var n;return (function () {n=this._apply("anything"); return (("(" + n) + ")")}).call(this)
	}
	["string"]() {
		var s;return (function () {s=this._apply("anything"); return sourceString(s)}).call(this)
	}
	["regExpr"]() {
		var x;return (function () {x=this._apply("anything"); return x}).call(this)
	}
	["arr"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("trans") })); return (("[" + xs.join(",")) + "]")}).call(this)
	}
	["unop"]() {
		var op,x;return (function () {op=this._apply("anything"); x=this._apply("trans"); return (((("(" + op) + " ") + x) + ")")}).call(this)
	}
	["getp"]() {
		var fd,x;return (function () {fd=this._apply("trans"); x=this._apply("trans"); return (((x + "[") + fd) + "]")}).call(this)
	}
	["get"]() {
		var x;return (function () {x=this._apply("anything"); return x}).call(this)
	}
	["set"]() {
		var lhs,rhs;return (function () {lhs=this._apply("trans"); rhs=this._apply("trans"); return (((("(" + lhs) + "=") + rhs) + ")")}).call(this)
	}
	["mset"]() {
		var lhs,op,rhs;return (function () {lhs=this._apply("trans"); op=this._apply("anything"); rhs=this._apply("trans"); return ((((("(" + lhs) + op) + "=") + rhs) + ")")}).call(this)
	}
	["binop"]() {
		var op,x,y;return (function () {op=this._apply("anything"); x=this._apply("trans"); y=this._apply("trans"); return (((((("(" + x) + " ") + op) + " ") + y) + ")")}).call(this)
	}
	["preop"]() {
		var op,x;return (function () {op=this._apply("anything"); x=this._apply("trans"); return (op + x)}).call(this)
	}
	["postop"]() {
		var op,x;return (function () {op=this._apply("anything"); x=this._apply("trans"); return (x + op)}).call(this)
	}
	["return"]() {
		var x;return (function () {x=this._apply("trans"); return ("return " + x)}).call(this)
	}
	["with"]() {
		var x,s;return (function () {x=this._apply("trans"); s=this._apply("curlyTrans"); return ((("with(" + x) + ")") + s)}).call(this)
	}
	["if"]() {
		var cond,t,e;return (function () {cond=this._apply("trans"); t=this._apply("curlyTrans"); e=this._apply("curlyTrans"); return ((((("if(" + cond) + ")") + t) + "else") + e)}).call(this)
	}
	["condExpr"]() {
		var cond,t,e;return (function () {cond=this._apply("trans"); t=this._apply("trans"); e=this._apply("trans"); return (((((("(" + cond) + "?") + t) + ":") + e) + ")")}).call(this)
	}
	["while"]() {
		var cond,body;return (function () {cond=this._apply("trans"); body=this._apply("curlyTrans"); return ((("while(" + cond) + ")") + body)}).call(this)
	}
	["doWhile"]() {
		var body,cond;return (function () {body=this._apply("curlyTrans"); cond=this._apply("trans"); return (((("do" + body) + "while(") + cond) + ")")}).call(this)
	}
	["for"]() {
		var init,cond,upd,body;return (function () {init=this._apply("trans"); cond=this._apply("trans"); upd=this._apply("trans"); body=this._apply("curlyTrans"); return ((((((("for(" + init) + ";") + cond) + ";") + upd) + ")") + body)}).call(this)
	}
	["forIn"]() {
		var x,arr,body;return (function () {x=this._apply("trans"); arr=this._apply("trans"); body=this._apply("curlyTrans"); return ((((("for(" + x) + " in ") + arr) + ")") + body)}).call(this)
	}
	["begin"]() {
		var x,xs;return this._or((function () { return (function () {x=this._apply("trans"); this._apply("end"); return x}).call(this) }),(function () { return (function () {xs=this._many((function () { return (function () {x=this._apply("trans"); return this._or((function () { return (function () {this._or((function () { return this._pred((x[(x["length"] - (1))] == "}")) }),(function () { return this._apply("end") })); return x}).call(this) }),(function () { return (function () {this._apply("empty"); return (x + ";")}).call(this) }))}).call(this) })); return xs.join("")}).call(this) }))
	}
	["func"]() {
		var args,body;return (function () {args=this._apply("anything"); body=this._apply("curlyTrans"); return (((("(function (" + args.join(",")) + ")") + body) + ")")}).call(this)
	}
	["call"]() {
		var fn,args;return (function () {fn=this._apply("trans"); args=this._many((function () { return this._apply("trans") })); return (((fn + "(") + args.join(",")) + ")")}).call(this)
	}
	["send"]() {
		var msg,recv,args;return (function () {msg=this._apply("anything"); recv=this._apply("trans"); args=this._many((function () { return this._apply("trans") })); return (((((recv + ".") + msg) + "(") + args.join(",")) + ")")}).call(this)
	}
	["new"]() {
		var cls,args;return (function () {cls=this._apply("anything"); args=this._many((function () { return this._apply("trans") })); return (((("new " + cls) + "(") + args.join(",")) + ")")}).call(this)
	}
	["var"]() {
		var name,val;return (function () {name=this._apply("anything"); val=this._apply("trans"); return ((("var " + name) + "=") + val)}).call(this)
	}
	["throw"]() {
		var x;return (function () {x=this._apply("trans"); return ("throw " + x)}).call(this)
	}
	["try"]() {
		var x,name,c,f;return (function () {x=this._apply("curlyTrans"); name=this._apply("anything"); c=this._apply("curlyTrans"); f=this._apply("curlyTrans"); return ((((((("try " + x) + "catch(") + name) + ")") + c) + "finally") + f)}).call(this)
	}
	["json"]() {
		var props;return (function () {props=this._many((function () { return this._apply("trans") })); return (("({" + props.join(",")) + "})")}).call(this)
	}
	["binding"]() {
		var name,val;return (function () {name=this._apply("anything"); val=this._apply("trans"); return ((sourceString(name) + ": ") + val)}).call(this)
	}
	["switch"]() {
		var x,cases;return (function () {x=this._apply("trans"); cases=this._many((function () { return this._apply("trans") })); return (((("switch(" + x) + "){") + cases.join(";")) + "}")}).call(this)
	}
	["case"]() {
		var x,y;return (function () {x=this._apply("trans"); y=this._apply("trans"); return ((("case " + x) + ": ") + y)}).call(this)
	}
	["default"]() {
		var y;return (function () {y=this._apply("trans"); return ("default: " + y)}).call(this)
	}
}


//bs-ometa-compiler.js

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


//bs-ometa-optimizer.js

class BSNullOptimization extends OMeta {
	["setHelped"]() {
		return (this["_didSomething"]=true)
	}
	["helped"]() {
		return this._pred(this["_didSomething"])
	}
	["trans"]() {
		var t,ans;return (function () {this._form((function () { return (function () {t=this._apply("anything"); this._pred((this[t] != undefined)); return ans=this._applyWithArgs("apply",t)}).call(this) })); return ans}).call(this)
	}
	["optimize"]() {
		var x;return (function () {x=this._apply("trans"); this._apply("helped"); return x}).call(this)
	}
	["App"]() {
		var rule,args;return (function () {rule=this._apply("anything"); args=this._many((function () { return this._apply("anything") })); return ["App",rule].concat(args)}).call(this)
	}
	["Act"]() {
		var expr;return (function () {expr=this._apply("anything"); return ["Act",expr]}).call(this)
	}
	["Pred"]() {
		var expr;return (function () {expr=this._apply("anything"); return ["Pred",expr]}).call(this)
	}
	["Or"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("trans") })); return ["Or"].concat(xs)}).call(this)
	}
	["XOr"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("trans") })); return ["XOr"].concat(xs)}).call(this)
	}
	["And"]() {
		var xs;return (function () {xs=this._many((function () { return this._apply("trans") })); return ["And"].concat(xs)}).call(this)
	}
	["Opt"]() {
		var x;return (function () {x=this._apply("trans"); return ["Opt",x]}).call(this)
	}
	["Many"]() {
		var x;return (function () {x=this._apply("trans"); return ["Many",x]}).call(this)
	}
	["Many1"]() {
		var x;return (function () {x=this._apply("trans"); return ["Many1",x]}).call(this)
	}
	["Set"]() {
		var n,v;return (function () {n=this._apply("anything"); v=this._apply("trans"); return ["Set",n,v]}).call(this)
	}
	["Not"]() {
		var x;return (function () {x=this._apply("trans"); return ["Not",x]}).call(this)
	}
	["Lookahead"]() {
		var x;return (function () {x=this._apply("trans"); return ["Lookahead",x]}).call(this)
	}
	["Form"]() {
		var x;return (function () {x=this._apply("trans"); return ["Form",x]}).call(this)
	}
	["ConsBy"]() {
		var x;return (function () {x=this._apply("trans"); return ["ConsBy",x]}).call(this)
	}
	["IdxConsBy"]() {
		var x;return (function () {x=this._apply("trans"); return ["IdxConsBy",x]}).call(this)
	}
	["JumpTable"]() {
		var c,e,ces;return (function () {ces=this._many((function () { return (function () {this._form((function () { return (function () {c=this._apply("anything"); return e=this._apply("trans")}).call(this) })); return [c,e]}).call(this) })); return ["JumpTable"].concat(ces)}).call(this)
	}
	["Interleave"]() {
		var m,p,xs;return (function () {xs=this._many((function () { return (function () {this._form((function () { return (function () {m=this._apply("anything"); return p=this._apply("trans")}).call(this) })); return [m,p]}).call(this) })); return ["Interleave"].concat(xs)}).call(this)
	}
	["Rule"]() {
		var name,ls,body;return (function () {name=this._apply("anything"); ls=this._apply("anything"); body=this._apply("trans"); return ["Rule",name,ls,body]}).call(this)
	}
}(BSNullOptimization["initialize"]=(function (){(this["_didSomething"]=false)}));class BSAssociativeOptimization extends BSNullOptimization {
	["And"]() {
		var x,xs;return this._or((function () { return (function () {x=this._apply("trans"); this._apply("end"); this._apply("setHelped"); return x}).call(this) }),(function () { return (function () {xs=this._applyWithArgs("transInside","And"); return ["And"].concat(xs)}).call(this) }))
	}
	["Or"]() {
		var x,xs;return this._or((function () { return (function () {x=this._apply("trans"); this._apply("end"); this._apply("setHelped"); return x}).call(this) }),(function () { return (function () {xs=this._applyWithArgs("transInside","Or"); return ["Or"].concat(xs)}).call(this) }))
	}
	["XOr"]() {
		var x,xs;return this._or((function () { return (function () {x=this._apply("trans"); this._apply("end"); this._apply("setHelped"); return x}).call(this) }),(function () { return (function () {xs=this._applyWithArgs("transInside","XOr"); return ["XOr"].concat(xs)}).call(this) }))
	}
	["transInside"]() {
		var t,xs,ys,x;return (function () {t=this._apply("anything"); return this._or((function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly",t); return xs=this._applyWithArgs("transInside",t)}).call(this) })); ys=this._applyWithArgs("transInside",t); this._apply("setHelped"); return xs.concat(ys)}).call(this) }),(function () { return (function () {x=this._apply("trans"); xs=this._applyWithArgs("transInside",t); return [x].concat(xs)}).call(this) }),(function () { return [] }))}).call(this)
	}
}class BSSeqInliner extends BSNullOptimization {
	["App"]() {
		var s,cs,rule,args;return this._or((function () { return (function() {
	switch(this._apply('anything')) {
		case "seq": return (function () {s=this._apply("anything"); this._apply("end"); cs=this._applyWithArgs("seqString",s); this._apply("setHelped"); return ["And"].concat(cs).concat([["Act",s]])}).call(this)
		default: throw fail
	}}).call(this) }),(function () { return (function () {rule=this._apply("anything"); args=this._many((function () { return this._apply("anything") })); return ["App",rule].concat(args)}).call(this) }))
	}
	["inlineChar"]() {
		var c;return (function () {c=this._applyWithArgs("foreign",BSOMetaParser, 'eChar'); this._not((function () { return this._apply("end") })); return ["App","exactly",sourceString(c)]}).call(this)
	}
	["seqString"]() {
		var s,cs;return (function () {this._lookahead((function () { return (function () {s=this._apply("anything"); return this._pred(((typeof s) === "string"))}).call(this) })); return this._or((function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","\""); cs=this._many((function () { return this._apply("inlineChar") })); return this._applyWithArgs("exactly","\"")}).call(this) })); return cs}).call(this) }),(function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","'"); cs=this._many((function () { return this._apply("inlineChar") })); return this._applyWithArgs("exactly","'")}).call(this) })); return cs}).call(this) }))}).call(this)
	}
}var JumpTable=(function (choiceOp,choice){(this["choiceOp"]=choiceOp);(this["choices"]=({}));this.add(choice)});(JumpTable["prototype"]["add"]=(function (choice){var c=choice[(0)];var t=choice[(1)];if(this["choices"][c]){if((this["choices"][c][(0)] == this["choiceOp"])){this["choices"][c].push(t)}else{(this["choices"][c]=[this["choiceOp"],this["choices"][c],t])}}else{(this["choices"][c]=t)}}));(JumpTable["prototype"]["toTree"]=(function (){var r=["JumpTable"];var choiceKeys=Object.keys(this["choices"]);for(var i=(0);(i < choiceKeys["length"]);(i+=(1))){r.push([choiceKeys[i],this["choices"][choiceKeys[i]]])};return r}));class BSJumpTableOptimization extends BSNullOptimization {
	["Or"]() {
		var cs;return (function () {cs=this._many((function () { return this._or((function () { return this._applyWithArgs("jtChoices","Or") }),(function () { return this._apply("trans") })) })); return ["Or"].concat(cs)}).call(this)
	}
	["XOr"]() {
		var cs;return (function () {cs=this._many((function () { return this._or((function () { return this._applyWithArgs("jtChoices","XOr") }),(function () { return this._apply("trans") })) })); return ["XOr"].concat(cs)}).call(this)
	}
	["quotedString"]() {
		var c,cs;return (function () {this._lookahead((function () { return this._apply("string") })); this._form((function () { return (function() {
	switch(this._apply('anything')) {
		case "\"": return (function () {cs=this._many((function () { return (function () {c=this._applyWithArgs("foreign",BSOMetaParser, 'eChar'); this._not((function () { return this._apply("end") })); return c}).call(this) })); return this._applyWithArgs("exactly","\"")}).call(this)
		case "'": return (function () {cs=this._many((function () { return (function () {c=this._applyWithArgs("foreign",BSOMetaParser, 'eChar'); this._not((function () { return this._apply("end") })); return c}).call(this) })); return this._applyWithArgs("exactly","'")}).call(this)
		default: throw fail
	}}).call(this) })); return cs.join("")}).call(this)
	}
	["jtChoice"]() {
		var x,rest;return this._or((function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","And"); this._form((function () { return (function () {this._applyWithArgs("exactly","App"); this._applyWithArgs("exactly","exactly"); return x=this._apply("quotedString")}).call(this) })); return rest=this._many((function () { return this._apply("anything") }))}).call(this) })); return [x,["And"].concat(rest)]}).call(this) }),(function () { return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","App"); this._applyWithArgs("exactly","exactly"); return x=this._apply("quotedString")}).call(this) })); return [x,["Act",sourceString(x)]]}).call(this) }))
	}
	["jtChoices"]() {
		var op,c,jt;return (function () {op=this._apply("anything"); c=this._apply("jtChoice"); jt=new JumpTable(op,c); this._many((function () { return (function () {c=this._apply("jtChoice"); return jt.add(c)}).call(this) })); this._apply("setHelped"); return jt.toTree()}).call(this)
	}
}class BSOMetaOptimizer extends OMeta {
	["optimizeGrammar"]() {
		var n,sn,rs;return (function () {this._form((function () { return (function () {this._applyWithArgs("exactly","Grammar"); n=this._apply("anything"); sn=this._apply("anything"); return rs=this._many((function () { return this._apply("optimizeRule") }))}).call(this) })); return ["Grammar",n,sn].concat(rs)}).call(this)
	}
	["optimizeRule"]() {
		var r;return (function () {r=this._apply("anything"); this._or((function () { return r=this._applyWithArgs("foreign",BSSeqInliner, 'optimize', r) }),(function () { return this._apply("empty") })); this._many((function () { return this._or((function () { return r=this._applyWithArgs("foreign",BSAssociativeOptimization, 'optimize', r) }),(function () { return r=this._applyWithArgs("foreign",BSJumpTableOptimization, 'optimize', r) })) })); return r}).call(this)
	}
}


//bs-ometa-js-compiler.js

class BSOMetaJSParser extends BSJSParser {
	["srcElem"]() {
		var r;return this._or((function () { return (function () {this._apply("spaces"); r=this._applyWithArgs("foreign",BSOMetaParser, 'grammar'); this._apply("sc"); return r}).call(this) }),(function () { return BSJSParser.prototype._superApplyWithArgs(this,'srcElem') }))
	}
}class BSOMetaJSTranslator extends BSJSTranslator {
	["Grammar"]() {
		return this._applyWithArgs("foreign",BSOMetaTranslator, 'Grammar')
	}
}


//ometa-node.js

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
