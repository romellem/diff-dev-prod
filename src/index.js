const path = require('path');
const util = require('util');
const chalk = require('chalk');
const { Command, flags } = require('@oclif/command');
const Diff2html = require('diff2html');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const glob = require('globby');
const { spawn } = require('child-process-promise');
const createHtmlDiff = require('./lib/html-diff-template');
const hasBin = require('./lib/has-bin');
const isPlainObject = require('./lib/is-plain-object');
const { input, confirm, list } = require('./lib/one-prompt-inquirer-functions');
const { prepareHtmlForUsefulComparisons } = require('./lib/prepare-html-for-useful-comparisons');
const readStdin = require('./lib/read-stdin-stream');

const CACHE_DIRECTORY = '.ddp-cache';
const LOCAL_DIRECTORY = 'local';
const REMOTE_DIRECTORY = 'remote';

const DIFF_EXECUTABLE = 'diff';

class DiffDevProdCommand extends Command {
	async run() {
		// Grabbed piped-in string first, even if we don't use it
		const piped_in_string = await readStdin();

		if (!hasBin(DIFF_EXECUTABLE)) {
			this.error(
				`This tool requires "${DIFF_EXECUTABLE}" be installed and available in your path.`,
				{
					exit: 2,
					suggestions: ['brew install diffutils  # if on macOS'],
				}
			);
		}
		const { flags, args } = this.parse(DiffDevProdCommand);
		let { domain: root_domain } = args;

		let {
			interactive,
			['build-dir']: build_directory,
			output: output_filename,
			['clean-config']: clean_config,
			quiet,
		} = flags;
		let loud = !quiet;

		if (!root_domain) {
			if (interactive) {
				root_domain = await input(
					`Enter the full root domain (e.g. https://example.com):`,
					{
						validate(v) {
							if (v) {
								return true;
							} else {
								return 'You must enter a value for the root domain.';
							}
						},
					}
				);
			} else {
				this.error(
					chalk.red(`No domain argument passed. Run 'ddp -h' to view help information.`)
				);
			}
		}

		// Massage the root_domain, removing trailing slashes and append protocol if needed
		root_domain = String(root_domain).trim();
		if (/\/$/.test(root_domain)) {
			// Removing trailing slash(es)
			root_domain = root_domain.replace(/\/+$/, '');
		}
		if (/^https?:\/\//i.test(root_domain) === false) {
			root_domain = `https://${root_domain}`;
		}
		loud && this.log(`Using domain ${chalk.magenta(root_domain)}\n`);

		let parsed_domain = new URL(root_domain);
		let domain_without_subdomain = parsed_domain.hostname.split('.').slice(-2).join('.');

		const default_build_directory = 'build';
		const default_output_filename = `${domain_without_subdomain}.diff.html`;

		// Prompt or use defaults for build directory / output filename depending on `interactive` flag.
		if (!build_directory) {
			build_directory = interactive
				? await input(`Enter the build folder path:`, { default: default_build_directory })
				: default_build_directory;
		}
		if (!output_filename) {
			output_filename = interactive
				? await input(`Enter the name of the output file:`, {
						default: default_output_filename,
				  })
				: default_output_filename;
		}

		if (!(await fs.exists(build_directory))) {
			this.error(`The directory "${chalk.yellow(build_directory)}" does not exist, exiting.`);
		}

		/**
		 * Resolve clean_config, since we support different ways of passing this in:
		 * - When value is 'stdin', read from piped in stdin
		 * - Filename
		 * - Inline JSON
		 */
		if (clean_config) {
			let original_clean_config = clean_config;
			if (clean_config === 'stdin') {
				clean_config = piped_in_string;
				try {
					clean_config = JSON.parse(clean_config);
				} catch (e) {
					this.error(`The piped input from stdin was not valid JSON.`, {
						code: e.toString(),
					});
				}
			} else if (await fs.exists(clean_config)) {
				clean_config = await fs.readFile(original_clean_config);
				try {
					clean_config = JSON.parse(clean_config);
				} catch (e) {
					this.error(
						`The file "${chalk.yellow(
							clean_config_filename
						)}" does not contain valid JSON.`,
						{ code: e.toString() }
					);
				}
			} else {
				// Assume it is inline JSON
				try {
					clean_config = JSON.parse(clean_config);
				} catch (e) {
					this.error(`The "clean-config" flag is not valid JSON.`, {
						code: e.toString(),
						suggestions: [
							`If you meant to load a JSON file, confirm that "${original_clean_config}" exists.`,
						],
					});
				}
			}

			if (!isPlainObject(clean_config)) {
				this.error(`The "clean-config" flag must be a plain object.`);
			}

			// Poor man's `_.pick`
			let picked_clean_config = {};
			if (clean_config.elements) {
				picked_clean_config.elements = clean_config.elements;
				if (!Array.isArray(picked_clean_config.elements)) {
					this.error(`The clean-config "elements" key must be an iterable Array.`);
				}
			}
			if (clean_config.attributes) {
				picked_clean_config.attributes = clean_config.attributes;
				if (!Array.isArray(picked_clean_config.attributes)) {
					this.error(`The clean-config "attributes" key must be an iterable Array.`);
				}
			}
			clean_config = picked_clean_config;
		}

		if (!clean_config && interactive) {
			clean_config = { elements: [], attributes: [] };
			let clean_some_elements = await confirm('Select certain elements to clean?', {
				default: false,
			});
			while (clean_some_elements) {
				let empty_selector = await input(
					`Enter the selector of the elements to empty / remove:`,
					{
						validate(v) {
							if (v) {
								return true;
							} else {
								return 'You must enter a value for the selector.';
							}
						},
					}
				);
				let filter_elements = await list(`Filter the elements based on its contents?`, {
					choices: [
						{ name: 'Filter based on simple string matching', value: 'string' },
						{ name: 'Filter based on a regular expression', value: 'regex' },
						{ name: 'Do not filter the elements', value: 'none' },
					],
				});
				let filter_on_contents;
				let filter_on_regex;
				let filter_on_regex_flags;
				if (filter_elements === 'string') {
					filter_on_contents = await input(`Filter the elements based on this string:`);
				} else if (filter_elements === 'regex') {
					filter_on_regex = await input(
						`Enter the regex with no surrounding '/' (e.g. "jQuery v\\d"):`
					);
					filter_on_regex_flags = await input(
						`Enter any optional regular expression flags (e.g. "i"):`
					);
				}

				let remove_or_empty_element = await list(
					`Remove the element entirely, or merely empty its contents?`,
					{
						choices: [
							{ name: 'Remove the element', value: 'remove' },
							{ name: 'Empty its contents', value: 'empty' },
						],
					}
				);

				let replacement_text = await input(
					`Replace the ${
						remove_or_empty_element === 'empty'
							? 'emptied elements contents'
							: 'removed element'
					} with some value? (can be left blank):`
				);

				let element_to_prune = Object.assign(
					{
						selector: empty_selector,
					},
					remove_or_empty_element === 'empty' ? { empty: true } : { remove: true },
					filter_on_contents ? { contains: filter_on_contents } : null,
					filter_on_regex ? { containsRegex: filter_on_regex } : null,
					filter_on_regex_flags ? { containsRegexFlags: filter_on_regex_flags } : null,
					replacement_text ? { replacement: replacement_text } : null
				);

				clean_config.elements.push(element_to_prune);

				clean_some_elements = await confirm('Select more elements to clean?', {
					default: false,
				});
			}

			let clean_some_attributes = await confirm('Select certain attributes to clean?', {
				default: false,
			});
			while (clean_some_attributes) {
				let attribute = await input(`Enter the name of the attribute to clean:`, {
					validate(v) {
						if (v) {
							return true;
						} else {
							return 'You must enter an attribute.';
						}
					},
				});
				let selector = await input(
					`Filter attributes on the following elements based on a DOM selector? (can be left blank):`
				);

				let filter_attributes = await list(`Filter the attributes based on its value?`, {
					choices: [
						{ name: 'Filter based on simple string matching', value: 'string' },
						{ name: 'Filter based on a regular expression', value: 'regex' },
						{ name: 'Do not filter the attributes', value: 'none' },
					],
				});
				let filter_on_contents;
				let filter_on_regex;
				let filter_on_regex_flags;
				if (filter_attributes === 'string') {
					filter_on_contents = await input(`Filter the attributes based on this string:`);
				} else if (filter_attributes === 'regex') {
					filter_on_regex = await input(
						`Filter the attributes based on this regular expression (do not surround with '/'):`
					);
					filter_on_regex_flags = await input(
						`Enter any optional regular expression flags (e.g. "i"):`
					);
				}

				let remove_or_empty_element = await list(
					`Remove the attribute entirely, or merely empty its contents?`,
					{
						choices: [
							{ name: 'Remove the attribute', value: 'remove' },
							{ name: 'Empty its contents', value: 'empty' },
						],
					}
				);

				let replacement_text;
				if (remove_or_empty_element === 'empty') {
					replacement_text = await input(
						`Replace the emptied attribute's value with a replacement? (can be left blank):`
					);
				}

				let attribute_to_prune = Object.assign(
					{ attribute },
					selector ? { selector } : null,
					remove_or_empty_element === 'empty' ? { empty: true } : { remove: true },
					filter_on_contents ? { contains: filter_on_contents } : null,
					filter_on_regex ? { containsRegex: filter_on_regex } : null,
					filter_on_regex_flags ? { containsRegexFlags: filter_on_regex_flags } : null,
					replacement_text ? { replacement: replacement_text } : null
				);
				clean_config.attributes.push(attribute_to_prune);

				clean_some_attributes = await confirm('Select more attributes to clean?', {
					default: false,
				});
			}
		}

		if (loud) {
			// Log out `clean_config` if it's arrays have length
			const html_will_be_cleaned =
				clean_config &&
				((clean_config.elements && clean_config.elements.length > 0) ||
					(clean_config.attributes && clean_config.attributes.length > 0));
			if (html_will_be_cleaned) {
				this.log('Using clean config:');
				this.log(util.inspect(clean_config, { colors: true }));
			} else {
				this.log('No clean config set.');
			}
			this.log();
		}

		let glob_str = path.join(build_directory, '**/*.html');
		// e.g. ['build/dir/file.html', 'build/dir/file2.html', ...]
		let file_paths = await glob(glob_str);

		// e.g. ['dir/file.html', 'dir/file2.html', ...]
		let files_paths_no_build_dir = file_paths.map((file) =>
			path.relative(build_directory, file)
		);
		let relative_urls = file_paths.map((file) => {
			let url = file.replace(new RegExp(`(^${build_directory}|index\.html$)`, 'ig'), '');

			// Poor man's `.replaceAll`
			if (url.includes('\\')) {
				url = url.split('\\').join('/');
			}

			return url;
		});
		let urls = relative_urls.map((url) => `${root_domain}${url}`);

		// Start downloading HTML _and_ reading HTML from disk
		let local_html = file_paths.map((file) => fs.readFile(file, { encoding: 'utf8' }));
		let urls_fetched_count = 0;
		if (loud) {
			this.log(chalk.yellow(`Requesting the following URLS:`));
			for (let url of urls) {
				this.log(chalk.cyan(url));
			}
			this.log();
		}
		let remote_html = urls.map((url) =>
			fetch(url)
				.then((res) => (res.ok ? res.text() : null))
				.then((res) => {
					loud &&
						process.stdout.write(`Fetched ${++urls_fetched_count} / ${urls.length}\r`);
					return res;
				})
				.catch((e) => null)
		);

		local_html = await Promise.all(local_html);
		remote_html = await Promise.all(remote_html);
		loud && this.log(chalk.yellow('\nDone fetching URLs!'));

		// Now that we have both local and remote HTML, prepare it for useful comparisons
		loud && this.log(chalk.yellow('Preparing local files...'));
		let local_prepared_html = local_html.map((html, index) => {
			if (html == null) {
				loud &&
					this.warn(
						chalk.red(
							`Skipping ${chalk.blue(urls[index])} as it didn't return any HTML`
						)
					);
				return null;
			} else {
				let prepared_html;
				try {
					prepared_html = prepareHtmlForUsefulComparisons(html, {
						tidy_on_bad_html: true,
						clean_config,
						quiet,
					});
				} catch (e) {
					this.error(e);
				}
				return prepared_html;
			}
		});

		loud && this.log(chalk.yellow('Preparing remote files...'));
		let remote_prepared_html = remote_html.map((html, index) => {
			if (html == null) {
				loud &&
					this.warn(
						chalk.red(
							`Skipping ${chalk.blue(urls[index])} as it didn't return any HTML`
						)
					);
				return null;
			} else {
				let prepared_html;
				try {
					prepared_html = prepareHtmlForUsefulComparisons(html, {
						tidy_on_bad_html: true,
						clean_config,
						quiet,
					});
				} catch (e) {
					this.error(e);
				}
				return prepared_html;
			}
		});

		// Temporarily write cleaned files to disk so `diff` can recursively compare them
		loud && this.log(chalk.yellow('Computing differences...'));
		await fs.ensureDir(CACHE_DIRECTORY);
		await fs.emptyDir(CACHE_DIRECTORY);

		/**
		 * Probably would be cleaner to "zip" filenames with file contents, but this works too.
		 * This of course relies on the fact that indices across these arrays align.
		 */
		for (let i = 0; i < files_paths_no_build_dir.length; i++) {
			let file_path = files_paths_no_build_dir[i];
			let local_file_html = local_prepared_html[i];
			let remote_file_html = remote_prepared_html[i];

			if (local_file_html == null || remote_file_html == null) {
				continue;
			}

			let local_file_path = path.join(CACHE_DIRECTORY, LOCAL_DIRECTORY, file_path);
			let remote_file_path = path.join(CACHE_DIRECTORY, REMOTE_DIRECTORY, file_path);

			await fs.ensureDir(path.dirname(local_file_path));
			await fs.ensureDir(path.dirname(remote_file_path));

			await fs.writeFile(local_file_path, local_file_html);
			await fs.writeFile(remote_file_path, remote_file_html);
		}

		// Get a unified diff string for these files
		let diff_output;
		try {
			/**
			 * `diff` flags:
			 * -N  treat absent files as empty
			 * -u  output 3 lines of unified context
			 * -r  recursively compare any subdirectories found
			 * -w  ignore all white space
			 */
			diff_output = await spawn(
				DIFF_EXECUTABLE,
				['-Nurw', LOCAL_DIRECTORY, REMOTE_DIRECTORY],
				{
					cwd: CACHE_DIRECTORY,
					capture: ['stdout', 'stderr'],
				}
			)
				.then((output) => output.stdout)
				.catch(async (e) => {
					if (e.code === 1) {
						// `diff` exits with 1 when it finds differences, so we need to catch these
						return e.stdout;
					} else {
						// Clean up cache before exiting
						await fs.remove(CACHE_DIRECTORY);
						this.error(
							`Error in running "${DIFF_EXECUTABLE}" against our two directories`,
							{
								code: e.toString(),
							}
						);
					}
				});
		} catch (e) {
			// Clean up cache before exiting
			await fs.remove(CACHE_DIRECTORY);
			this.error(e);
		} finally {
			await fs.remove(CACHE_DIRECTORY);
		}

		loud && this.log(chalk.green('Done computing all differences!'));
		if (output_filename === 'stdout') {
			this.log(diff_output);
		} else {
			const raw_html_diff = Diff2html.html(diff_output);
			const html_diff = createHtmlDiff({ title: root_domain, diff: raw_html_diff });

			await fs.writeFile(output_filename, html_diff);
			loud && this.log(chalk.green(`Written to ${chalk.blue(output_filename)}`));
		}
		this.exit(0);
	}
}

// prettier-ignore
DiffDevProdCommand.description = `Diff-Dev-Prod: View useful differences between development source code and deployed production code.

Diff-Dev-Prod, or ddp for short, gets most of its "secret sauce" by computing *useful* differences between HTML documents. One way it can determine what differences are useful is by *cleaning* the HTML before starting its comparison.

Besides some default cleaning steps such as removing HTML comments and sorting element attributes, ddp allows you to configure custom rules for cleaning the HTML.

There are two types of cleaning one can do: cleaning ELEMENTS and cleaning ATTRIBUTES. Cleaning and element means either removing the element entirely, or emptying / replacing its contents. Cleaning an attribute also allows you to remove or replace said attribute.

Identifying what elements or attributes to clean can be done through the '--interactive' flag, or by passing in a JSON object to the '--clean-config' flag.

The shape of the clean JSON configuration is as follows:

\`\`\`
{
  ${chalk.gray('// An array of objects that configure which elements should be cleaned')}
  ${chalk.cyan('"elements":')} [
    {
      ${chalk.gray('// A valid DOM selector for your element.')}
      ${chalk.gray('//')} ${chalk.red('@required')}
      ${chalk.magenta('"selector":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// After the elements have been selected, they can be filtered by`)}
      ${chalk.gray(`// their contents for a simple string match.`)}
      ${chalk.magenta('"contains":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// After the elements have been selected, they can be filtered by`)}
      ${chalk.gray(`// checking their contents for a regular expression match.`)}
      ${chalk.gray(`// Note that this regular expression should **not** contain starting`)}
      ${chalk.gray(`// and ending slashes, and all backslashes should be escaped.`)}
      ${chalk.gray(`// @example \`"containsRegex": "jQuery v\\\\d+"\``)}
      ${chalk.magenta('"containsRegex":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// When using the 'containsRegex' key, optional flags can be set via`)}
      ${chalk.gray(`// the "containsRegexFlags" key.`)}
      ${chalk.gray(`// @example \`"containsRegexFlags": "i"\``)}
      ${chalk.magenta('"containsRegexFlags":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// Enter true or false to flag whether the element should be removed`)}
      ${chalk.gray(`// or not. If used with 'replacement', the entire element is replaced`)}
      ${chalk.gray(`// with the passed HTML. This overrides 'empty' if both are set.`)}
      ${chalk.magenta('"remove":')} ${chalk.yellow('true')} | ${chalk.yellow('false')},

      ${chalk.gray(`// Enter true or false to flag whether the element should be emptied`)}
      ${chalk.gray(`// or not (that is, have its contents removed). If used with`)}
      ${chalk.gray(`// 'replacement', the element's contents are replaced with the`)}
      ${chalk.gray(`// passed HTML. This is overridden by 'remove' if both are set.`)}
      ${chalk.gray(`// If 'empty' or 'remove' are not set, the default action is to`)}
      ${chalk.gray(`// empty the element.`)}
      ${chalk.magenta('"empty":')} ${chalk.yellow('true')} | ${chalk.yellow('false')},

      ${chalk.gray(`// If 'empty' or 'remove' are set, this value will be used to`)}
      ${chalk.gray(`// replace the element or the element's contents. This value`)}
      ${chalk.gray(`// will always be housed in an HTML comment.`)}
      ${chalk.magenta('"replacement":')} ${chalk.yellow('"String"')},
    }
  ],

  ${chalk.gray('// An array of objects that configure which attributes should be cleaned')}
  ${chalk.cyan('"attributes":')} [
    {
      ${chalk.gray('// The attribute name to clean (e.g. "id").')}
      ${chalk.gray('//')} ${chalk.red('@required')}
      ${chalk.magenta('"attribute":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// An optional selector, so this attribute will only be searched for`)}
      ${chalk.gray(`// on this matching element.`)}
      ${chalk.magenta('"selector":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// After the attribute has been selected, it can be filtered by`)}
      ${chalk.gray(`// its value for a simple string match.`)}
      ${chalk.magenta('"contains":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// After the attribute has been selected, it can be filtered by`)}
      ${chalk.gray(`// checking its value for a regular expression match.`)}
      ${chalk.gray(`// Note that this regular expression should **not** contain starting`)}
      ${chalk.gray(`// and ending slashes, and all backslashes should be escaped.`)}
      ${chalk.gray(`// @example \`"containsRegex": "internal_id_\\\\d+"\``)}
      ${chalk.magenta('"containsRegex":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// When using the 'containsRegex' key, optional flags can be set via`)}
      ${chalk.gray(`// the "containsRegexFlags" key.`)}
      ${chalk.gray(`// @example \`"containsRegexFlags": "i"\``)}
      ${chalk.magenta('"containsRegexFlags":')} ${chalk.yellow('"String"')},

      ${chalk.gray(`// Enter true or false to flag whether the attribute should be removed`)}
      ${chalk.gray(`// or not. This overrides 'empty' if both are set. If 'empty' or 'remove'`)}
      ${chalk.gray(`// are not set, the default action is to remove the attribute.`)}
      ${chalk.magenta('"remove":')} ${chalk.yellow('true')} | ${chalk.yellow('false')},

      ${chalk.gray(`// Enter true or false to flag whether the attribute should be emptied`)}
      ${chalk.gray(`// or not (that is, have its value removed). If used with`)}
      ${chalk.gray(`// 'replacement', the attribute's value is replaced with the`)}
      ${chalk.gray(`// passed string. This is overridden by 'remove' if both are set.`)}
      ${chalk.magenta('"empty":')} ${chalk.yellow('true')} | ${chalk.yellow('false')},

      ${chalk.gray(`// If 'empty' is set, this value will be used to replace the attribute's value`)}
      ${chalk.magenta('"replacement":')} ${chalk.yellow('"String"')},
    }
  ]
}
\`\`\`
`;

DiffDevProdCommand.usage = `[options] <domain>`;
DiffDevProdCommand.examples = [
	`$ ddp https://example.com`,
	`$ ddp --interactive https://example.com`,
	`$ ddp --clean-config='{ "elements": [{ "selector": "head" }] }' https://example.com`,
	`$ ddp --clean-config='{ "elements": [{ "remove": true, "selector": "script", "containsRegex": "jQuery v\\\\d+", "containsRegexFlags": "i" }] }' https://example.com`,
	`$ ddp --clean-config="clean-config.json" https://example.com`,
	`$ cat clean-config.json | ddp --clean-config=stdin https://example.com`,
	`$ ddp --quiet --output=stdout https://example.com`,
];

DiffDevProdCommand.args = [
	{
		name: 'domain',
		required: false,
		description:
			'The root domain to compare our local HTML against. This argument is optional when in `interactive` mode.',
	},
];

DiffDevProdCommand.flags = {
	'version': flags.version({ char: 'v', description: 'Show CLI version.' }),
	'help': flags.help({ char: 'h', description: 'Show CLI help.' }),
	'interactive': flags.boolean({
		char: 'i',
		description: `When true, will prompt for inputs it has not explicitly received. Defaults to false.`,
		default: false,
	}),
	'build-dir': flags.string({
		char: 'b',
		description: `The directory of your built HTML files. Defaults to "build".`,
	}),
	'output': flags.string({
		char: 'o',
		description: `The filename of the HTML diff report. If "stdout" is passed, the unified diff string is echoed out.`,
	}),
	'clean-config': flags.string({
		char: 'c',
		description: `A JSON string, or a file path to a JSON file, to configure how the HTML should be "cleaned" before it is diff'd. If "stdin" is passed, piped input will be used as the clean config. If invalid JSON is passed, the command exits early. See the DESCRIPTION section for more information on this.`,
	}),
	'quiet': flags.boolean({
		char: 'q',
		description: `When true, suppresses any progress messages that otherwise would be logged out. Defaults to false.`,
		default: false,
	}),
};

module.exports = DiffDevProdCommand;
