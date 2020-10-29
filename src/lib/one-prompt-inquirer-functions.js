const inquirer = require('inquirer');

/**
 * @returns {Function<Promise<Any>>} - Returns the user's selection to an inquirer prompt (not wrapped in an Object).
 */
const makeOnePromptFunction = (type) => (message, questionObj = {}) => {
	let name = questionObj.name == null ? 'question' : questionObj.name;

	// Destructure the answer out of the response
	return inquirer
		.prompt(Object.assign({ message, type, name }, questionObj))
		.then((answer) => answer[name]);
};

const input = makeOnePromptFunction('input');
const confirm = makeOnePromptFunction('confirm');
const list = makeOnePromptFunction('list');

module.exports = {
	makeOnePromptFunction,
	input,
	confirm,
	list,
};
