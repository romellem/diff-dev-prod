const { html: htmlBeautify } = require('js-beautify');
const { minify: htmlMinify } = require('html-minifier');
const { sortAttributesOnDomTreeInPlace, walkTheDOM } = require('./sort-attributes-on-dom.js');
const { JSDOM } = require('jsdom');

/**
 * This is the main function that allows us to compare our different HTML sources.
 * Here, we:
 *
 * - Minify HTML (e.g. remove all HTML comments)
 * - Sort attributes on all Elements
 * - Beautify HTML
 * - Removing all leading indentation
 *
 * Optionally, we can also:
 *
 * - Empty the contents of any element that matches a selector. For example, you
 *   can pass in 'head' to empty the head tag
 * - Sort Elements within `<head>` tag
 *
 * We then return the new string. By doing this against a local HTML file
 * and a file we pull from a server (e.g., from a file served up in a CMS),
 * we can detect _useful_ differences between our code and the production code.
 *
 * @param {String} html_str
 * @param {Object} [opt]
 * @param {Boolean} [opt.reorder_head_tags=false]
 * @param {Boolean} [opt.tidy_on_bad_html=false]
 * @param {Boolean} [opt.quiet=false]
 * @param {Object} [opt.clean_config]
 * @param {Array<Object>} [opt.clean_config.elements]
 * @param {Array<Object>} [opt.clean_config.attributes]
 * @param {String} [opt.clean_config.elements.0.selector]
 * @param {Boolean} [opt.clean_config.elements.0.empty=true]
 * @param {Boolean} [opt.clean_config.elements.0.remove]
 * @param {String} [opt.clean_config.elements.0.contains]
 * @param {String} [opt.clean_config.elements.0.containsRegex]
 * @param {String} [opt.clean_config.elements.0.containsRegexFlags]
 * @param {String} [opt.clean_config.elements.0.replacement]
 * @param {String} [opt.clean_config.attributes.0.attribute]
 * @param {String} [opt.clean_config.attributes.0.selector]
 * @param {Boolean} [opt.clean_config.attributes.0.empty]
 * @param {Boolean} [opt.clean_config.attributes.0.remove=true]
 * @param {String} [opt.clean_config.attributes.0.contains]
 * @param {String} [opt.clean_config.attributes.0.containsRegex]
 * @param {String} [opt.clean_config.attributes.0.containsRegexFlags]
 * @param {String} [opt.clean_config.attributes.0.replacement]
 * @returns {String} Returns our cleaned HTML
 */
const prepareHtmlForUsefulComparisons = (
	html_str,
	{ reorder_head_tags = false, tidy_on_bad_html = false, quiet = false, clean_config = {} } = {}
) => {
	const loud = !quiet;
	const HTML_MINIFY_CONFIG = {
		removeComments: true,
		collapseWhitespace: true,
		decodeEntities: true,
		collapseInlineTagWhitespace: true,
	};
	const HTML_BEAUTIFY_CONFIG = {
		content_unformatted: ['script', 'pre'],
		indent_size: 1,
		sep: '\n',
		wrap_line_length: 0,
	};

	let minified_html;
	try {
		minified_html = htmlMinify(html_str, HTML_MINIFY_CONFIG);
	} catch (e) {
		/**
		 * If we fail to minify our HTML, its probably because we have malformed
		 * HTML. So, if we fail, then optionally try to "tidy" up our "tag soup"
		 * we passed in in the same way your browser might by parsing our HTML
		 * string with JSDOM and outputting its resulting `outerHTML`.
		 *
		 * The reason why we don't do this by default is it is probably
		 * more useful to know if a build is outputting malformed HTML
		 * that is getting cleaned up by a CMS or your browser than having
		 * this get silently fixed.
		 */
		if (tidy_on_bad_html) {
			let temp_dom = new JSDOM(html_str);
			minified_html = htmlMinify(
				temp_dom.window.document.documentElement.outerHTML,
				HTML_MINIFY_CONFIG
			);
		} else {
			throw e;
		}
	}

	let dom = new JSDOM(minified_html);
	let { document } = dom.window;

	// Prune (via removal or emptying the contents) of any matching element
	if (clean_config) {
		if (clean_config.elements && Array.isArray(clean_config.elements)) {
			for (let element_to_clean of clean_config.elements) {
				try {
					let {
						selector,
						contains,
						containsRegex,
						containsRegexFlags,
						remove,
						empty = true,
						replacement,
					} = element_to_clean;

					if (!selector) {
						continue;
					}

					let elements = document.querySelectorAll(selector);
					for (let element of elements) {
						let re;
						if (containsRegex && typeof containsRegex === 'string') {
							try {
								if (containsRegexFlags && typeof containsRegexFlags === 'string') {
									re = new RegExp(containsRegex, containsRegexFlags);
								} else {
									re = new RegExp(containsRegex);
								}
							} catch (err) {
								loud && console.warn(`Invalid regular expression`);
								loud &&
									console.warn(
										`new RegExp(${JSON.stringify(
											containsRegex
										)}, ${JSON.stringify(containsRegexFlags)})`
									);
							}
						}
						let contains_string_match = Boolean(
							contains &&
								typeof contains === 'string' &&
								element.innerHTML.includes(contains)
						);
						let contains_regex_match = Boolean(re && re.test(element.innerHTML));

						/**
						 * If we passed `contains` or `containsRegex`, then check if we got a match,
						 * and skip this iteration if we did not.
						 */
						if ((contains && !contains_string_match) || (re && !contains_regex_match)) {
							continue;
						}

						// We found a matching element! Prune it
						if (remove) {
							// `remove` overrides `empty` if both are set
							element.parentNode.removeChild(element);
						} else if (empty) {
							element.innerHTML = '';
							if (replacement) {
								// Always replace with HTML comment
								let comment = document.createComment(` ${replacement} `);
								element.appendChild(comment);
							}
						}
					}
				} catch (e) {
					let error =
						'Invalid `element_to_clean` passed: ' + JSON.stringify(element_to_clean);
					throw error;
				}
			}
		}
		if (clean_config.attributes && Array.isArray(clean_config.attributes)) {
			for (let attribute_to_clean of clean_config.attributes) {
				try {
					let {
						attribute,
						selector = '*',
						contains,
						containsRegex,
						containsRegexFlags,
						remove = true,
						empty,
						replacement,
					} = attribute_to_clean;

					if (!attribute) {
						continue;
					}

					// @todo should I use `walkTheDOM` if I don't have a selector?
					let elements = document.querySelectorAll(selector);
					for (let element of elements) {
						if (element.hasAttribute && !element.hasAttribute(attribute)) {
							continue;
						}

						// We have the attribute, should it be filtered based on its value?
						let attribute_value = element.getAttribute(attribute);
						attribute_value = attribute_value && attribute_value.toString();
						let re;
						if (containsRegex && typeof containsRegex === 'string') {
							try {
								if (containsRegexFlags && typeof containsRegexFlags === 'string') {
									re = new RegExp(containsRegex, containsRegexFlags);
								} else {
									re = new RegExp(containsRegex);
								}
							} catch (err) {
								loud && console.warn(`Invalid regular expression`);
								loud &&
									console.warn(
										`new RegExp(${JSON.stringify(
											containsRegex
										)}, ${JSON.stringify(containsRegexFlags)})`
									);
							}
						}
						let contains_string_match = Boolean(
							contains &&
								typeof contains === 'string' &&
								attribute_value.includes(contains)
						);
						let contains_regex_match = Boolean(re && re.test(attribute_value));

						/**
						 * If we passed `contains` or `containsRegex`, then check if we got a match,
						 * and skip this iteration if we did not.
						 */
						if ((contains && !contains_string_match) || (re && !contains_regex_match)) {
							continue;
						}

						// We found a matching attribute! Prune it
						if (empty) {
							// `empty` overrides `remove` if both are set
							if (replacement) {
								element.setAttribute(attribute, replacement);
							} else {
								element.setAttribute(attribute, '');
							}
						} else if (remove) {
							element.removeAttribute(attribute);
						}
					}
				} catch (e) {
					let error =
						'Invalid `attribute_to_clean` passed: ' +
						JSON.stringify(attribute_to_clean);
					throw error;
				}
			}
		}
	}

	if (reorder_head_tags) {
		let head_children = [...document.head.children];

		// @link https://htmlhead.dev/#elements
		const head_sort_order = ['TITLE', 'META', 'BASE', 'LINK', 'STYLE', 'SCRIPT', 'NOSCRIPT'];
		head_children.sort((a, b) => {
			let a_comparison = head_sort_order.indexOf(a.tagName);
			let b_comparison = head_sort_order.indexOf(b.tagName);

			// Warn if we have a weird HEAD child tag. Shouldn't happen
			if (a_comparison === -1)
				loud && console.warn(`Unknown tag type in HEAD: ${a.tagName}. `, a.outerHTML);
			if (b_comparison === -1)
				loud && !console.warn(`Unknown tag type in HEAD: ${b.tagName}. `, b.outerHTML);

			if (a_comparison === b_comparison) {
				// Text sort
				return String(a.outerHTML).localeCompare(String(b.outerHTML));
			} else {
				// Numerical sort
				return a_comparison - b_comparison;
			}
		});

		let sorted_head_html = head_children.map((ele) => ele.outerHTML).join('\n');

		document.head.innerHTML = sorted_head_html;
	}

	/**
	 * Sort all element attributes in alphabetical order.
	 * This is useful because, comparing
	 * `<a href="#" class="link">` and `<a class="link" href="#">`
	 * and flagging that as a difference isn't actually useful.
	 */
	sortAttributesOnDomTreeInPlace(dom);

	// Minify again (unclear if this is needed or not)
	// @note, preserve comment in case they were added via a `clean_config` replacement
	minified_html = htmlMinify(
		document.documentElement.outerHTML,
		Object.assign({}, HTML_MINIFY_CONFIG, {
			removeComments: false,
		})
	);

	formatted_html = htmlBeautify(minified_html, HTML_BEAUTIFY_CONFIG);

	// Remove all indentation
	formatted_html = formatted_html.replace(/^\s*/gm, '');

	return formatted_html;
};

module.exports = {
	prepareHtmlForUsefulComparisons,
};
