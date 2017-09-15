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
