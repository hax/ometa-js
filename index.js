'use strict'

// var vm = require('vm')
var fs = require('fs'),
	path = require('path')

var mtime = mt(__filename)
// var context = vm.createContext()
// context.global = context
// if (!context.setTimeout) context.setTimeout = setTimeout
// if (!context.console) context.console = console
// function load(module) {
// 	var filename = require.resolve(module)
// 	mtime = Math.max(mt(filename), mtime)
// 	var code = fs.readFileSync(filename).toString()
// 	vm.runInContext(code, context, filename)
// }
//
// load('es6-shim')
// load('es7-shim/dist/es7-shim.min')
// load('./all')

require('es7-shim')

module.exports = require('./all')
var translateCode = require('./all').translateCode

require.extensions['.ometajs'] = function(module, filename) {
	var code, temp = filename.slice(0, -2) + '.js'
	if (fs.existsSync(temp) && mt(temp) >= Math.max(mt(filename), mtime)) {
		code = fs.readFileSync(temp).toString()
	} else {
		console.log('recompile', filename)
		code = fs.readFileSync(filename).toString()
		code = translateCode(code)
		code = wrapModule(temp, code)
		fs.writeFileSync(temp, code)
	}
	module._compile(code, temp)
}

function mt(filename) {
	return fs.statSync(filename).mtime.getTime()
}

function wrapModule(filename, code) {
	var dpProcs = [
		{
			re: /^module\s+(.*?)\s+at\s+(.*)/,
			tr: function(m) {
				return 'var ' + m[1] + ' = ' + 'require(' + m[2] + ')'
			}
		},
		{
			re: /^import\s+(.*?)\s+from\s+(.*)/,
			tr: function(m) {
				return 'void function(m){' +
					'Object.defineProperties(imports, {' +
						m[1].replace(/([^,]+)/g, '$1:{get:function(){return m.$1}}') +
					'})' +
				'}(require(' + m[2] + '))'
			}
		},
		{
			re: /^export\s+(.*)/,
			tr: function(m) {
				return 'Object.defineProperties(exports, {' +
					m[1].replace(/([^,]+)/g, '$1:{get:function(){return $1}}') +
				'})'
			}
		}
	]
	var ometajsPath = './' + path.relative(path.dirname(filename), __filename).replace(/\\/g, '/')
	var targetCode = [
		'var ometajs = require(' + JSON.stringify(ometajsPath) + ')',
		'var OMeta = ometajs.OMeta',
		'var fail = ometajs.fail',
		'var imports = Object.create(null)',
		'with (imports) {',
			'void function(){',
				'"use strict"',
	]
	
	var re = /^"(.*?)";/, offset = 0, m
	while (m = re.exec(code.slice(offset))) {
		var s = m[1].replace(/\\'/g, "'")
		for (var i = 0; i < dpProcs.length; i++) {
			var dpm = dpProcs[i].re.exec(s)
			if (dpm) {
				targetCode.push(dpProcs[i].tr(dpm))
				break
			}
		}
		offset += m[0].length
	}
	targetCode.push(
				code,
			'}()',
		'}'
	)
	return targetCode.join('\n')
}
