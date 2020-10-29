/**
 * @param {String} opt.diff
 * @param {String} opt.title
 * @param {Date} opt.date
 * @returns {String}
 */
const createHtmlDiff = ({ diff, title = '', date = new Date() } = {}) => {
	return /* html */ `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>HTML Diffs - ${title}</title>

		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.9.0/styles/github.min.css">
		<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />

		<script src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.9.0/highlight.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.9.0/languages/scala.min.js"></script>

		<style>
			html {
				font-family: sans-serif;
			}

			/* Wrap toggle */
			.toggle-word-wrap .d2h-code-line-ctn {
				white-space: pre-wrap !important;
			}
			.toggle-word-wrap .toggle-word-wrap__button::after {
				content: " →";
			}
			.toggle-word-wrap__wrapper {
				margin-bottom: 1em;
			}
			.toggle-word-wrap__button {
				cursor: pointer;
			}
			.toggle-word-wrap__button::after {
				content: " ↪";
			}

			/* Collapse file */
			.d2h-file-header {
				cursor: pointer;
				padding-right: 35px;
				position: relative;
			}
			@supports (position: sticky) {
				.d2h-file-header {
					position: sticky;
					top: 0;
					z-index: 9;
				}
			}
			.d2h-file-header::after {
				content: '';
				width: 8px;
				height: 8px;
				border-bottom: 2px solid grey;
				border-right: 2px solid grey;
				position: absolute;
				right: 16px;
				top: calc(50% - 4px);
				transform: rotate(45deg);
			}
			.chevron-down.d2h-file-header::after {
				transform: rotate(45deg);
			}
			.chevron-up.d2h-file-header::after {
				transform: rotate(-135deg);
			}

			/* Other */
			.diff-title {
				text-align: center;
				margin-bottom: 1rem;
			}
			.diff-explanation {
				text-align: left;
			}
			.diff-explanation .local {
				color: red;
			}
			.diff-explanation .remote {
				color: green;
			}

			.diff-date {
				margin-bottom: 2rem;
			}

		</style>
	</head>
	<body>
		<h1 class="diff-title">${title}</h1>
		<div class="diff-explanation">
			<p>The diff colors represent:</p>
			<ul>
				<li class="local">Local is <b>RED</b> (-)</li>
				<li class="remote">Remote is <b>GREEN</b> (+)</li>
			</ul>
		</div>

		<p class="diff-date">Created: <strong>${date.toLocaleDateString()}, ${date.toLocaleTimeString()}</strong></p>

		<div class="toggle-word-wrap__wrapper">
			<button class="toggle-word-wrap__button">Toggle Word Wrap</button>
		</div>

		<div id="diff">${diff}</div>

		<script>
		(function(){
			// Initialize UI
			var diff_wrapper = document.querySelector('#diff');
			var diff2htmlUi = new Diff2HtmlUI(diff_wrapper);
			diff2htmlUi.fileListToggle(true);

			// Allows to files to be "collapsable" 
			var headers = document.querySelectorAll('.d2h-file-header');

			headers.forEach(function(header) {
				header.addEventListener('click', function(e) {
					var sibling = header.parentNode.querySelector('.d2h-file-diff');
					if (sibling.style.display) {
						// Expand section
						header.style.fontStyle = '';
						header.classList.remove('chevron-up');
						sibling.style.display = '';
					} else {
						// Collapse section
						var requires_scroll = sibling.getBoundingClientRect().top < 0;

						header.style.fontStyle = 'italic';
						header.classList.add('chevron-up');
						sibling.style.display = 'none';

						/**
						 * When collapsing a section, if we've scrolled part-way through,
						 * meaning the "sticky" header has been "activated," then a better
						 * UX means to scroll back up, otherwise you lose your context.
						 * However, if you are collapsing a section that isn't "sticky"
						 * yet, we _don't_ want to do this. This check handles that.
						 */
						if (requires_scroll) {
							header.scrollIntoView();
						}
					}
				})
			});

			// "Toggle" button
			var toggle_button = document.querySelector('.toggle-word-wrap__button');
			toggle_button.addEventListener('click', function(e) {
				document.body.classList.toggle('toggle-word-wrap');
			});
		})();
		</script>
	</body>
	</html>`;
};

module.exports = createHtmlDiff;
