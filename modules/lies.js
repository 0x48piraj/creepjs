import { hashMini } from './crypto.js'
import { captureError, attempt, caniuse } from './captureErrors.js'

// Collect lies detected
const createlieRecords = () => {
	const records = []
  	return {
		getRecords: () => records,
		documentLie: (name, lieResult, lieTypes) => {
			return records.push({ name, lieTypes, hash: lieResult, lie: hashMini(lieTypes) })
		}
	}
}

const lieRecords = createlieRecords()
const { documentLie } = lieRecords

const ghost = () => `
	height: 100vh;
	width: 100vw;
	position: absolute;
	left:-10000px;
	visibility: hidden;
`
const getRandomValues = () => {
	const id = [...crypto.getRandomValues(new Uint32Array(10))]
		.map(n => n.toString(36)).join('')
	return id
}

const getPhantomIframe = () => {
	try {
		const numberOfIframes = window.length
		const frag = new DocumentFragment()
		const div = document.createElement('div')
		const id = getRandomValues()
		div.setAttribute('id', id)
		frag.appendChild(div)
		div.innerHTML = `<div style="${ghost()}"><iframe></iframe></div>`
		document.body.appendChild(frag)
		const iframeWindow = window[numberOfIframes]
		return { iframeWindow, div }
	}
	catch (error) {
		captureError(error, 'client blocked phantom iframe')
		return { iframeWindow: window, div: undefined }
	}
}
const { iframeWindow: phantomDarkness, div: parentPhantom } = getPhantomIframe()

const getDragonIframe = ({ numberOfNests, kill = false, context = window }) => {
	try {
		let parent, total = numberOfNests
		return (function getIframeWindow(win, {
			previous = context
		} = {}) {
			if (!win) {
				if (kill) {
					parent.parentNode.removeChild(parent)
				}
				console.log(`\ndragon fire is valid up to ${total - numberOfNests} fiery flames`)
				return { iframeWindow: previous, parent }
			}
			const numberOfIframes = win.length
			const div = win.document.createElement('div')
			win.document.body.appendChild(div)
			div.innerHTML = '<iframe></iframe>'
			const iframeWindow = win[numberOfIframes]
			if (total == numberOfNests) {
				parent = div
				parent.setAttribute('style', 'display:none')
			}
			numberOfNests--
			if (!numberOfNests) {
				if (kill) {
					parent.parentNode.removeChild(parent)
				}
				return { iframeWindow, parent }
			}
			return getIframeWindow(iframeWindow, {
				previous: win
			})
		})(context)
	}
	catch (error) {
		captureError(error, 'client blocked dragon iframe')
		return { iframeWindow: window, parent: undefined }
	}
}

const { iframeWindow: dragonFire, parent: parentDragon } = getDragonIframe({ numberOfNests: 2 })

const { iframeWindow: dragonOfDeath } = getDragonIframe({ numberOfNests: 4, kill: true})

// detect and fingerprint Function API lies
const native = (result, str, willHaveBlanks = false) => {
	const chrome = `function ${str}() { [native code] }`
	const chromeGet = `function get ${str}() { [native code] }`
	const firefox = `function ${str}() {\n    [native code]\n}`
	const chromeBlank = `function () { [native code] }`
	const firefoxBlank = `function () {\n    [native code]\n}`
	return (
		result == chrome ||
		result == chromeGet ||
		result == firefox || (
			willHaveBlanks && (result == chromeBlank || result == firefoxBlank)
		)
	)
}

const testLookupGetter = (proto, name) => {
	if (proto.__lookupGetter__(name)) {
		return {
			[`Expected __lookupGetter__ to return undefined`]: true
		}
	}
	return false
}

const testLength = (apiFunction, name) => {
	const apiLen = {
		createElement: [true, 1],
		createElementNS: [true, 2],
		toBlob: [true, 1],
		getImageData: [true, 4],
		measureText: [true, 1],
		toDataURL: [true, 0],
		getContext: [true, 1],
		getParameter: [true, 1],
		getExtension: [true, 1],
		getSupportedExtensions: [true, 0],
		getParameter: [true, 1],
		getExtension: [true, 1],
		getSupportedExtensions: [true, 0],
		getClientRects: [true, 0],
		getChannelData: [true, 1],
		copyFromChannel: [true, 2],
		getTimezoneOffset: [true, 0]
	}
	if (apiLen[name] && apiLen[name][0] && apiFunction.length != apiLen[name][1]) {
		return {
			[`Expected length ${apiLen[name][1]} and got ${apiFunction.length}`]: true
		}
	}
	return false
}

const testEntries = apiFunction => {
	const objectFail = {
		entries: 0,
		keys: 0,
		values: 0
	}
	let totalFail = 0
	const objEntriesLen = Object.entries(apiFunction).length
	const objKeysLen = Object.keys(apiFunction).length
	const objKeysValues = Object.values(apiFunction).length
	if (!!objEntriesLen) {
		totalFail++
		objectFail.entries = objEntriesLen
	}
	if (!!objKeysLen) {
		totalFail++
		objectFail.keys = objKeysLen
	}
	if (!!objKeysValues) {
		totalFail++
		objectFail.values = objKeysValues
	}
	if (totalFail) {
		return {
			[`Expected entries, keys, values [0, 0, 0] and got [${objectFail.entries}, ${objectFail.keys}, ${objectFail.values}]`]: true
		}
	}
	return false
}

const testPrototype = apiFunction => {
	if ('prototype' in apiFunction) {
		return {
			[`Unexpected 'prototype' in function`]: true
		}
	} 
	return false
}

const testNew = apiFunction => {
	try {
		new apiFunction
		return {
			['Expected new to throw an Error']: true
		}
	}
	catch (error) {
		// Native throws TypeError
		if (error.constructor.name != 'TypeError') {
			return {
				['Expected new to throw a TypeError']: true
			}
		}
		return false
	}
}

const testClassExtends = apiFunction => {
	try { 
		class Fake extends apiFunction { }
		return {
			['Expected class extends to throw an Error']: true
		}
	}
	catch (error) {
		// Native throws error
		if (error.constructor.name != 'TypeError') {
			return {
				['Expected class extends to throw a TypeError']: true
			}
		}
		else if (!/not a constructor/i.test(error.message)) {
			return {
				['Expected class extends to throw TypeError "not a constructor"']: true
			}
		}
		return false
	}
}

const testSetPrototypeNull = apiFunction => {
	const nativeProto = Object.getPrototypeOf(apiFunction)
	try { 
		Object.setPrototypeOf(apiFunction, null)+''
		Object.setPrototypeOf(apiFunction, nativeProto)
		return {
			['Expected set prototype null to throw an error']: true
		}
	}
	catch (error) {
		// Native throws error
		Object.setPrototypeOf(apiFunction, nativeProto)
		return false
	}
}

const testName = (apiFunction, name) => {
	const { name: apiName } = apiFunction
	if (apiName != '' && apiName != name) {
		return {
			[`Expected name "${name}" and got "${apiName}"`]: true
		}
	}
	return false
}

const testToString = (apiFunction, fnToStr, phantomDarkness) => {
	const { toString: apiToString } = apiFunction
	if (apiToString+'' !== fnToStr || apiToString.toString+'' !== fnToStr) {
		return {
			[`Expected toString to match ${phantomDarkness ? 'iframe.' : ''}Function.toString`]: true
		}
	}
	return false
}

const testOwnProperty = apiFunction => {
	const notOwnProperties = []
	if (apiFunction.hasOwnProperty('arguments')) {
		notOwnProperties.push('arguments')
	}
	if (apiFunction.hasOwnProperty('caller')) {
		notOwnProperties.push('caller')
	}
	if (apiFunction.hasOwnProperty('prototype')) {
		notOwnProperties.push('prototype')
	}
	if (apiFunction.hasOwnProperty('toString')) {
		notOwnProperties.push('toString')
	}
	if (!!notOwnProperties.length) {
		return {
			[`Unexpected own property: ${notOwnProperties.join(', ')}`]: true
		}
	}
	return false
}

const testOwnPropertyDescriptor = apiFunction => {
	const notDescriptors = []
	if (!!Object.getOwnPropertyDescriptor(apiFunction, 'arguments') ||
		!!Reflect.getOwnPropertyDescriptor(apiFunction, 'arguments')) {
		notDescriptors.push('arguments')
	}
	if (!!Object.getOwnPropertyDescriptor(apiFunction, 'caller') ||
		!!Reflect.getOwnPropertyDescriptor(apiFunction, 'caller')) {
		notDescriptors.push('caller')
	}
	if (!!Object.getOwnPropertyDescriptor(apiFunction, 'prototype') ||
		!!Reflect.getOwnPropertyDescriptor(apiFunction, 'prototype')) {
		notDescriptors.push('prototype')
	}
	if (!!Object.getOwnPropertyDescriptor(apiFunction, 'toString') ||
		!!Reflect.getOwnPropertyDescriptor(apiFunction, 'toString')) {
		notDescriptors.push('toString')
	}
	if (!!notDescriptors.length) {
		return {
			[`Unexpected descriptor: ${notDescriptors.join(', ')}`]: true
		}
	}
	return
}

const testDescriptorKeys = apiFunction => {
	const descriptorKeys = Object.keys(Object.getOwnPropertyDescriptors(apiFunction))
	if (''+descriptorKeys != 'length,name' && ''+descriptorKeys != 'name,length') {
		return {
			['Expected own property descriptor keys [length, name]']: true
		}
	}
	return false
}

const testOwnPropertyNames = apiFunction => {
	const ownPropertyNames = Object.getOwnPropertyNames(apiFunction)
	if (''+ownPropertyNames != 'length,name' && ''+ownPropertyNames != 'name,length') {
		return {
			['Expected own property names [length, name]']: true
		}
	}
	return false
}

const testOwnKeys = apiFunction => {
	const ownKeys = Reflect.ownKeys(apiFunction)
	if (''+ownKeys != 'length,name' && ''+ownKeys != 'name,length') {
		return {
			['Expected own keys [length, name]']: true
		}
	}
	return false
}

const testSpread = apiFunction => {
	const ownPropLen = Object.getOwnPropertyNames({...apiFunction}).length
	if (ownPropLen) {
		return {
			[`Expected 0 own property names in spread and got ${ownPropLen}`]: true
		}
	}
	return false
}

const testDescriptor = (proto, name) => {
	const descriptor = Object.getOwnPropertyDescriptor(proto, name)
	const ownPropLen = Object.getOwnPropertyNames(descriptor).length
	const ownKeysLen = Reflect.ownKeys(descriptor).length
	const keysLen = Object.keys(descriptor).length
	if (ownPropLen != keysLen || ownPropLen != ownKeysLen) {
		return {
			['Expected keys and own property names to match in length']: true
		}
	}
	return false
}

const testGetToString = (proto, name) => {
	try {
		Object.getOwnPropertyDescriptor(proto, name).get.toString()
		Reflect.getOwnPropertyDescriptor(proto, name).get.toString()
		return {
			['Expected descriptor.get.toString() to throw an error']: true
		}
	}
	catch (error) {
		// Native throws error
		return false
	}
}

const testIllegal = (api, name) => {
	let illegalCount = 0
	const illegal = [
		'',
		'is',
		'call',
		'seal',
		'keys',
		'bind',
		'apply',
		'assign',
		'freeze',
		'values',
		'entries',
		'toString',
		'isFrozen',
		'isSealed',
		'constructor',
		'isExtensible',
		'getPrototypeOf',
		'preventExtensions',
		'propertyIsEnumerable',
		'getOwnPropertySymbols',
		'getOwnPropertyDescriptors'
	]
	try {
		api[name]
		illegalCount++
	}
	catch (error) {
		// Native throws error
	}
	illegal.forEach((prop, index) => {
		try {
			!prop ? Object(api[name]) : Object[prop](api[name])
			illegalCount++
		}
		catch (error) {
			// Native throws error
		}
	})
	if (illegalCount) {
		const total = illegal.length+1
		return {
			[`Expected illegal invocation error: ${total-illegalCount} of ${total} passed`]: true
		}
	}
	return false
}

const testValue = (obj, name) => {
	try {
		Object.getOwnPropertyDescriptor(obj, name).value
		Reflect.getOwnPropertyDescriptor(obj, name).value
		return {
			['Expected descriptor.value to throw an error']: true
		}
	}
	catch (error) {
		// Native throws error
		return false
	}
}

let counter = 0
const hasLiedAPI = (api, name, obj) => {
	counter++
	const fnToStr = (
		phantomDarkness ? 
		phantomDarkness.Function.prototype.toString.call(Function.prototype.toString) : // aggressive test
		Function.prototype.toString+''
	)

	let willHaveBlanks = false
	try {
		willHaveBlanks = obj && (obj+'' == '[object Navigator]' || obj+'' == '[object Document]')
	}
	catch (error) { }

	if (typeof api == 'function') {
		const proto = obj
		const apiFunction = api
		try {
			const testResults = new Set(
				[
					testLookupGetter(proto, name),
					testLength(apiFunction, name),
					testEntries(apiFunction),
					testGetToString(proto, name),
					testSpread(apiFunction),
					testSetPrototypeNull(apiFunction),

					// common tests
					testPrototype(apiFunction),
					testNew(apiFunction),
					testClassExtends(apiFunction),
					testName(apiFunction, name),
					testToString(apiFunction, fnToStr, phantomDarkness),
					testOwnProperty(apiFunction),
					testOwnPropertyDescriptor(apiFunction),
					testDescriptorKeys(apiFunction),
					testOwnPropertyNames(apiFunction),
					testOwnKeys(apiFunction),
					testDescriptor(proto, name)
				]
			)
			testResults.delete(false)
			testResults.delete(undefined)
			const lies = [...testResults]

			// collect string conversion result
			const result = (
				phantomDarkness ? 
				phantomDarkness.Function.prototype.toString.call(apiFunction) :
				'' + apiFunction
			)
			
			// fingerprint result if it does not match native code
			let fingerprint = ''
			if (!native(result, name, willHaveBlanks)) {
				fingerprint = result
			}
			
			return {
				lie: lies.length || fingerprint ? { lies, fingerprint } : false 
			}
		}
		catch (error) {
			captureError(error)
			return false
		}
	}

	if (typeof api == 'object' && caniuse(() => obj[name]) != undefined) {
			
		try {
			const proto = api
			const apiFunction = Object.getOwnPropertyDescriptor(api, name).get
			const testResults = new Set(
				[
					testIllegal(api, name),
					testValue(obj, name),
					
					// common tests
					testPrototype(apiFunction),
					testNew(apiFunction),
					testClassExtends(apiFunction),
					testName(apiFunction, `get ${name}`),
					testToString(apiFunction, fnToStr, phantomDarkness),
					testOwnProperty(apiFunction),
					testOwnPropertyDescriptor(apiFunction),
					testDescriptorKeys(apiFunction),
					testOwnPropertyNames(apiFunction),
					testOwnKeys(apiFunction),
					testDescriptor(proto, name)
				]
			)
			testResults.delete(false)
			testResults.delete(undefined)
			const lies = [...testResults]
			// collect string conversion result
			const result = (
				phantomDarkness ? 
				phantomDarkness.Function.prototype.toString.call(apiFunction) :
				'' + apiFunction
			)

			let objlookupGetter, apiProtoLookupGetter, result2, result3
			if (obj) {
				objlookupGetter = obj.__lookupGetter__(name)
				apiProtoLookupGetter = api.__lookupGetter__(name)
				const iframeResult = (
					typeof objlookupGetter != 'function' ? undefined : 
					attempt(() => phantomDarkness.Function.prototype.toString.call(objlookupGetter))
				)
				result2 = (
					iframeResult ? 
					iframeResult :
					'' + objlookupGetter
				)
				result3 = '' + apiProtoLookupGetter
			}

			// fingerprint result if it does not match native code
			let fingerprint = ''
			if (!native(result, name, willHaveBlanks)) {
				fingerprint = result
			}
			else if (obj && !native(result2, name, willHaveBlanks)) {
				fingerprint = result2
			}
			else if (obj && !native(result3, name, willHaveBlanks)) {
				fingerprint = result3 != 'undefined' ? result3 : ''
			}

			return {
				lie: lies.length || fingerprint ? { lies, fingerprint } : false
			}
		}
		catch (error) {
			captureError(error)
			return false
		}
	}

	return false
}

// deep search lies
const getMethods = (obj, ignore) => {
	if (!obj) {
		return []
	}
	return Object.getOwnPropertyNames(obj).filter(item => {
		if (ignore[item]) {
			// validate critical methods elsewhere
			return false
		}
		try {
			return typeof obj[item] === 'function'
		}
		catch (error) {
			return false
		}
	})
}
const getValues = (obj, ignore) => {
	if (!obj) {
		return []
	}
	return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(item => {
		if (ignore[item]) {
			// validate critical methods elsewhere
			return false
		}
		try {
			return (
				typeof obj[item] == 'string' ||
				typeof obj[item] == 'number' ||
				!obj[item]
			)
		}
		catch (error) {
			return false
		}
	})
}
const intlConstructors = {
	'Collator': !0,
	'DateTimeFormat': !0,
	'DisplayNames': !0,
	'ListFormat': !0,
	'NumberFormat': !0,
	'PluralRules': !0,
	'RelativeTimeFormat': !0
}

const createLieProps = () => {
	const props = {}
  	return {
		getProps: () => props,
		searchLies: (obj, ignoreProps, { logToConsole = false, proto = null } = {}) => {
			if (!obj) {
				return
			}
			let methods
			const isMath = (obj+'' == '[object Math]')
			const isTypeofObject = typeof obj == 'object'
			if (isMath) {
				methods = getMethods(obj, ignoreProps)
			}
			else if (isTypeofObject) {
				methods = getValues(obj, ignoreProps)
			}
			else {
				methods = getMethods(obj.prototype, ignoreProps)
			}
			return methods.forEach(name => {
				let domManipLie
				if (isMath) {
					domManipLie = hasLiedAPI(obj[name], name, obj).lie
					if (domManipLie) {
						const apiName = `Math.${name}`
						props[apiName] = true
						documentLie(apiName, undefined, domManipLie)
					}
				}
				else if (isTypeofObject) {
					domManipLie = hasLiedAPI(proto, name, obj).lie
					if (domManipLie) {
						const objName = /\s(.+)\]/g.exec(proto)[1]
						const apiName = `${objName}.${name}`
						props[apiName] = true
						documentLie(apiName, undefined, domManipLie)
					}
				}
				else {
					domManipLie = hasLiedAPI(obj.prototype[name], name, obj.prototype).lie
					if (domManipLie) {
						const objName = /\s(.+)\(\)/g.exec(obj)[1]
						const apiName = `${intlConstructors[objName] ? 'Intl.' : ''}${objName}.${name}`
						props[apiName] = true
						documentLie(apiName, undefined, domManipLie)
					}
				}
				if (logToConsole) {
					console.log(name, domManipLie)
				}	
			})
		}
	}
}

const lieProps = createLieProps()
const { searchLies } = lieProps

const start = performance.now()
searchLies(Node, {
	constructor: !0,
	appendChild: !0 // opera fix
})
searchLies(Element, {
	constructor: !0,
	querySelector: !0, // opera fix
	setAttribute: !0 // opera fix
})
searchLies(HTMLElement, {
	constructor: !0,
	requestFullscreen: !0 // in FF mobile, this does not appear native 
})
searchLies(HTMLCanvasElement, {
	constructor: !0
})
searchLies(Navigator, {
	constructor: !0
})
searchLies(navigator, {
	constructor: !0
}, { logToConsole: false, proto: Navigator.prototype })
searchLies(Screen, {
	constructor: !0
})
searchLies(screen, {
	constructor: !0
}, { logToConsole: false, proto: Screen.prototype })
searchLies(Date, {
	constructor: !0,
	toGMTString: !0
})
searchLies(Intl.DateTimeFormat, {
	constructor: !0
})
searchLies(Intl.RelativeTimeFormat, {
	constructor: !0
})
searchLies(caniuse(() => AnalyserNode), {
	constructor: !0
})
searchLies(caniuse(() => AudioBuffer), {
	constructor: !0
})
searchLies(SVGTextContentElement, {
	constructor: !0
})
searchLies(CanvasRenderingContext2D, {
	constructor: !0
})
searchLies(caniuse(() => OffscreenCanvasRenderingContext2D), {
	constructor: !0
})
searchLies(caniuse(() => WebGLRenderingContext), {
	constructor: !0,
	makeXRCompatible: !0, // ignore
})
searchLies(caniuse(() => WebGL2RenderingContext), {
	constructor: !0,
	makeXRCompatible: !0, // ignore
})
searchLies(Math, {
	constructor: !0
})
searchLies(PluginArray, {
	constructor: !0
})
searchLies(Plugin, {
	constructor: !0
})
searchLies(Document, {
	constructor: !0,
	createElement: !0, // opera fix
	createTextNode: !0, // opera fix
	querySelector: !0 // opera fix
})

console.log(`${counter} API properties analyzed in ${(performance.now() - start).toFixed(2)}ms (${Object.keys(lieProps.getProps()).length} corrupted)`)

const getPluginLies = (plugins, mimeTypes) => {
	const lies = [] // collect lie types
	const pluginsOwnPropertyNames = Object.getOwnPropertyNames(plugins).filter(name => isNaN(+name))
	const mimeTypesOwnPropertyNames = Object.getOwnPropertyNames(mimeTypes).filter(name => isNaN(+name))
	const pluginsArray = plugins

	// cast to array
	plugins = [...plugins]
	mimeTypes = [...mimeTypes]

	// get intitial trusted mimeType names
	const trustedMimeTypes = new Set(mimeTypesOwnPropertyNames)

	// get initial trusted plugin names
	const excludeDuplicates = arr => [...new Set(arr)]
	const mimeTypeEnabledPlugins = excludeDuplicates(
		mimeTypes.map(mimeType => mimeType.enabledPlugin)
	)
	const trustedPluginNames = new Set(pluginsOwnPropertyNames)
	const mimeTypeEnabledPluginsNames = mimeTypeEnabledPlugins.map(plugin => plugin.name)
	const trustedPluginNamesArray = [...trustedPluginNames]
	trustedPluginNamesArray.forEach(name => {
		const validName = new Set(mimeTypeEnabledPluginsNames).has(name)
		if (!validName) {
			trustedPluginNames.delete(name)
		}
	})

	// 1. Expect plugin name to be in plugins own property names
	plugins.forEach(plugin => {
		if (!trustedPluginNames.has(plugin.name)) {
			lies.push('missing plugin name')
		}
	})

	// 2. Expect MimeType Plugins to match Plugins
	const getPluginPropertyValues = plugin => {
		return [
			plugin.description,
			plugin.filename,
			plugin.length,
			plugin.name
		]
	}
	const pluginList = plugins.map(getPluginPropertyValues).sort()
	const enabledpluginList = mimeTypeEnabledPlugins.map(getPluginPropertyValues).sort()
	const mismatchingPlugins = '' + pluginList != '' + enabledpluginList
	if (mismatchingPlugins) {
		lies.push('mismatching plugins')
	}

	// 3. Expect MimeType object in plugins
	const invalidPlugins = plugins.filter(plugin => {
		try {
			const validMimeType = Object.getPrototypeOf(plugin[0]).constructor.name == 'MimeType'
			if (!validMimeType) {
				trustedPluginNames.delete(plugin.name)
			}
			return !validMimeType
		} catch (error) {
			trustedPluginNames.delete(plugin.name)
			return true // sign of tampering
		}
	})
	if (invalidPlugins.length) {
		lies.push('missing mimetype')
	}

	// 4. Expect valid MimeType(s) in plugin
	const pluginMimeTypes = plugins
		.map(plugin => Object.values(plugin))
		.flat()
	const pluginMimeTypesNames = pluginMimeTypes.map(mimetype => mimetype.type)
	const trustedMimeTypesArray = [...trustedMimeTypes]
	pluginMimeTypesNames.forEach(name => {
		const validName = trustedMimeTypes.has(name)
		if (!validName) {
			trustedMimeTypes.delete(name)
		}
	})

	plugins.forEach(plugin => {
		const pluginMimeTypes = Object.values(plugin).map(mimetype => mimetype.type)
		return pluginMimeTypes.forEach(mimetype => {
			if (!trustedMimeTypes.has(mimetype)) {
				lies.push('invalid mimetype')
				return trustedPluginNames.delete(plugin.name)
			}
		})
	})

	return {
		validPlugins: plugins.filter(plugin => trustedPluginNames.has(plugin.name)),
		validMimeTypes: mimeTypes.filter(mimeType => trustedMimeTypes.has(mimeType.type)),
		lies: [...new Set(lies)] // remove duplicates
	}
}

const getLies = imports => {

	const {
		require: {
			lieRecords
		}
	} = imports

	const records = lieRecords.getRecords()
	return new Promise(async resolve => {
		let totalLies = 0
		records.forEach(lie => {
			if (!!lie.lieTypes.fingerprint) {
				totalLies++
			}
			if (!!lie.lieTypes.lies) {
				totalLies += lie.lieTypes.lies.length
			}
		})
		const data = records
			.map(lie => ({ name: lie.name, lieTypes: lie.lieTypes }))
			.sort((a, b) => (a.name > b.name) ? 1 : -1)
		return resolve({ data, totalLies })
	})
}

export { documentLie, phantomDarkness, parentPhantom, lieProps, lieRecords, getLies, dragonFire, parentDragon, dragonOfDeath, getPluginLies }