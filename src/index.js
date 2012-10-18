var r = require('requirejs')

r.config({
	baseUrl: __dirname,
	paths: {
		cs: '../lib/requirejs/cs',
	}
})
module.exports = r('cs!ometajs')
