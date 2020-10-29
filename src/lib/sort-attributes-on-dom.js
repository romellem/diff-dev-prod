/**
 * Sorts the attributes IN PLACE on our JSDom Object
 */

/**
 * A DOM walker as a generator function. See the below link for the original recursive method.
 * @example for (let node of walkTheDOM(document)) { ... }
 * @link https://www.javascriptcookbook.com/article/traversing-dom-subtrees-with-a-recursive-walk-the-dom-function/
 * @generator
 */
function* walkTheDOM(node) {
	yield node;
	node = node.firstChild;
	while (node) {
		yield* walkTheDOM(node);
		node = node.nextSibling;
	}
}

const getAttributesObjectFromElement = (ele, return_both = false) => {
	let attrs_sorted = ele.getAttributeNames();
	attrs_sorted.sort();

	let attrs_obj = {};
	for (let attr of attrs_sorted) {
		attrs_obj[attr] = ele.getAttribute(attr);
	}

	// Optimization, return both so I don't have to run `getAttributeNames` twice
	if (return_both) {
		return { attrs_obj, attrs_sorted };
	}
	return attrs_obj;
};

const reorderAttributesOnNode = (node) => {
	// `hasAttributes` isn't available on text nodes, comment nodes, etc.
	if (node.hasAttributes && node.hasAttributes()) {
		let { attrs_sorted, attrs_obj } = getAttributesObjectFromElement(node, true);

		// Remove all attributes
		for (let attr of attrs_sorted) {
			node.removeAttribute(attr);
		}

		// Add them back in a sorted manner
		for (let attr of attrs_sorted) {
			let attr_val = attrs_obj[attr];

			node.setAttribute(attr, attr_val);
		}
	}
};

const sortAttributesOnDomTreeInPlace = (jsdom_obj) => {
	for (let node of walkTheDOM(jsdom_obj.window.document.documentElement)) {
		// Update DOM Node in place
		reorderAttributesOnNode(node);
	}

	return jsdom_obj;
};

module.exports = {
	walkTheDOM,
	sortAttributesOnDomTreeInPlace,
};
