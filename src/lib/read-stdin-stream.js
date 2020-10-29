/**
 * Read some data from stdin.
 * @example const pipeString = await readPipe();
 * @returns {Promise<String>}
 * @see https://github.com/hackmdio/hackmd-cli/blob/f477999/src/read-stdin-stream.ts
 * @see https://github.com/hackmdio/hackmd-cli/blob/f477999/src/index.ts#L18
 */
const readStdin = () => {
	return new Promise((resolve) => {
		const stdin = process.openStdin();
		stdin.setEncoding('utf-8');
		let data = '';
		stdin.on('data', (chunk) => {
			data += chunk;
		});
		stdin.on('end', () => {
			resolve(data);
		});
		if (stdin.isTTY) {
			resolve('');
		}
	});
};

module.exports = readStdin;
