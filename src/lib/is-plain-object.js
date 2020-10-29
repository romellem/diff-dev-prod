/**
 * Returns whether the param is a plain JS object.
 * Of course this isn't fool proof, but tends to work for most inputs.
 * @param {Any} obj
 * @returns {Boolean}
 * @see https://stackoverflow.com/a/38555871
 */
function isPlainObject(obj) {
	return (
		typeof obj === 'object' &&
		obj !== null &&
		obj.constructor === Object &&
		Object.prototype.toString.call(obj) === '[object Object]'
	);
}

module.exports = isPlainObject;
