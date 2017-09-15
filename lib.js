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
