const ometa = require('.')
const {existsSync, readFileSync, writeFileSync} = require('fs')

const files = [
	'lib',
	'ometa-base',
	'bs-js-compiler',
	'bs-ometa-compiler',
	'bs-ometa-optimizer',
	'bs-ometa-js-compiler',
	'ometa-node',
]

function readFile(name) {
	const filename = __dirname + '/' + name
	if (existsSync(filename + '.txt')) {
		console.log('transpling', name)
		try {
			const code = endsWithNL(ometa.translateCode(readFileSync(filename + '.txt', 'utf-8')))
			writeFileSync(filename + '.js', code)
			return code
		} catch (e) {
			console.error(e)
			return readFileSync(filename + '.js', 'utf-8')
		}
	} else {
		return readFileSync(filename + '.js', 'utf-8')
	}
}

function endsWithNL(text) {
	return text.endsWith('\n') ? text : text + '\n'
}

const all = "'use strict'" + files.reduce((a, b) => a + '\n\n//' + b + '.js\n\n' + readFile(b), '')
writeFileSync(__dirname + '/all.js', all)
