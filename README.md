# Diff Dev Prod

Imagine the following scenario:

You are hired to build a simple static website, possibly using a
[static site generator](https://www.netlify.com/blog/2020/04/14/what-is-a-static-site-generator-and-3-ways-to-find-the-best-one/).

However, the site is going to be hosted within some enterprise CMS,
which was never intended to host static HTML.

So after creating your built files, you have to manually enter the
information into the CMS, usually by copying and pasting small
snippets of HTML into CMS components.

While this technically works as a way to host a website, the big
problem with this setup (besides being cumbersome) is that the your
[source of truth](https://en.wikipedia.org/wiki/Single_source_of_truth)
is actually the CMS and **not** your source code, meaning it is possible
to have your source code become out of sync with the CMS.

Once they become out of sync, determining _what_ is different can be difficult
for a variety of reasons:

- The CMS may insert various markup elements (e.g. HTML Comments, extraneous wrapper elements)
- The CMS may mangle or adjust your HTML
- You may not have a clean way to grab all the HTML from the CMS to start a comparison in the first place

Enter `diff-dev-prod`, or **ddp** for short. **ddp** helps you determine what
the _useful_ differences are between your development source code and the
deployed production code.

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
    - [Non-Interactive Mode Usage](#non-interactive-mode-usage)
    - [Interactive Mode Usage](#interactive-mode-usage)
- [Clean Configuration](#clean-configuration)
    - [Clean Configuration - JSON Structure](#clean-configuration---json-structure)
    - [Clean Configuration - Inline JSON](#clean-configuration---inline-json)
    - [Clean Configuration - File Path](#clean-configuration---file-path)
    - [Clean Configuration - Piped in via `stdin`](#clean-configuration---piped-in-via-stdin)
    - [Clean Configuration - Motiviation / Example Scenario](#clean-configuration---motiviation--example-scenario)
- [Example Output](#example-output)

## Requirements

*  [GNU diff](https://www.gnu.org/software/diffutils/)

This comes pre-installed with macOS and probably most linux/unix flavors.

> To check this, run `diff -v` in your terminal. If you get a _"command not found: diff"_ error, you'll need to install `diff`.
>
> For example, on macOS, you can install this via [homebrew](https://brew.sh/):
>
>     brew install diffutils
>

## Installation

To install the CLI globally, simply use `npm` or `yarn` via its respectful _global_
flag:

```shell
npm install --global @designory/diff-dev-prod
# or
yarn global add @designory/diff-dev-prod
```

Alternatively, **ddp** can be run via [`npx`](https://github.com/npm/npx) or
[`yarn dlx`](https://yarnpkg.com/cli/dlx/) if you are using Yarn v2. Note that you'll need to pass
in the full package name of `@designory/diff-dev-prod` when using `npx` or `yarn dlx`:

```shell
npx @designory/diff-dev-prod http://example.com
# or
yarn dlx @designory/diff-dev-prod http://example.com
```

## Usage

**ddp** can be run in two modes: _interactive_ and _non-interactive_ mode. As the name implies, when
in interactive mode, you can select the options you have not explicitly passed in.

By default, the program runs in non-interactive mode. To run the program in interactive mode, simply
pass in the `-i` or `--interactive` flag.

Run `ddp --help` to view more information.

### Non-Interactive Mode Usage

Copy a folder of your entire site and paste it in the current working
directory. Then, run the following:

```shell
$ ddp http://example.com
```

This will compare your build against `http://example.com`.

### Interactive Mode Usage

Let's say you have a website `http://example.com` and its contents
should match up with a folder named _build/_ that looks like this:

```text
build/
├── about/
│   └── index.html
├── contact/
│   └── index.html
└── index.html
```

After executing `ddp --interactive`, you might answer the prompts as:

```text
$ ddp --interactive

? Enter the full root domain: https://example.com
? Enter the build folder path: build
? Enter the name of the output file: example.com.diff.html
? Select certain elements to clean: No
? Select certain attributes to clean: No

Requesting the following URLS:
http://example.com/
http://example.com/about/
http://example.com/contact/

Fetched 3 / 3
Done fetching URLs!
Preparing local files...
Preparing remote files...
Preparing to compute differences...
Computing differences...
Done computing all differences!
Written to example.com.diff.html
```

This creates your report in _example.com.diff.html_, ready to view the useful differences!

## Clean Configuration

One of the most useful parts of **ddp** is the ability to _clean_ the HTML before computing the
differences.

HTML can be cleaned in two ways: by changing some _elements_, or by changing some _attributes_ on an
element.

When in _interactive_ mode, you will be prompted for the configuration on how to clean the document.
Otherwise, you must pass in a JSON configuration via the `-c` or `--clean-config` flag.

When using the `--clean-config` flag, the JSON can be passed in via three ways:
[inline JSON](#clean-configuration-flag---inline-json), [a file path](#clean-configuration---file-path),
or [piped in via `stdin`](#clean-configuration---piped-in-via-stdin).

Whichever way you pass in this configuration, it must be valid JSON and have a [specific structure](#clean-configuration---json-structure).

### Clean Configuration - JSON Structure

When setting the clean config via JSON, the structure of the JSON should be a plain Object (`{}`), with
two root keys: `"elements"` and `"attributes"`. The values of each are an Array of plain Objects,
detailed below:

```
{
    // An array of objects that configure which elements should be cleaned
    "elements": [
        {
            // A valid DOM selector for your element. This is required.
            "selector": "String",

            // After the elements have been selected, they can be filtered by
            // its contents for a simple string match.
            "contains": "String",

            // After the elements have been selected, they can be filtered by
            // checking its contents for a regular expression match.
            // Note that this regular expression should **not** contain starting
            // and ending slashes, and all backslashes should be escaped.
            // @example `"containsRegex": "jQuery v\\d+"`
            "containsRegex": "String",

            // When using the 'containsRegex' key, optional flags can be set via
            // the "containsRegexFlags" key.
            // @example `"containsRegexFlags": "i"`
            "containsRegexFlags": "String",

            // Enter true or false to flag whether the element should be removed
            // or not. If used with 'replacement', the entire element is replaced
            // with the passed HTML. This overrides 'empty' if both are set.
            "remove": true | false,

            // Enter true or false to flag whether the element should be emptied
            // or not (that is, have its contents removed). If used with
            // 'replacement', the element's contents are replaced with the
            // passed HTML. This is overridden by 'remove' if both are set.
            // If 'empty' or 'remove' are not set, the default action is to
            // empty the element.
            "empty": true | false,

            // If 'empty' or 'remove' are set, this value will be used to
            // replace the element or the element's contents. This value
            // will always be housed in an HTML comment.
            "replacement": "String",
        }
    ],

    // An array of objects that configure which attributes should be cleaned
    "attributes": [
        {
            // The attribute name to clean (e.g. "id"). This is required.
            "attribute": "String",

            // An optional selector, so this attribute will only be searched for
            // on this matching element.
            "selector": "String",

            // After the attribute has been selected, it can be filtered by
            // its value for a simple string match.
            "contains": "String",

            // After the attribute has been selected, it can be filtered by
            // checking its value for a regular expression match.
            // Note that this regular expression should **not** contain starting
            // and ending slashes, and all backslashes should be escaped.
            // @example `"containsRegex": "internal_id_\\d+"`
            "containsRegex": "String",

            // When using the 'containsRegex' key, optional flags can be set via
            // the "containsRegexFlags" key.
            // @example `"containsRegexFlags": "i"`
            "containsRegexFlags": "String",

            // Enter true or false to flag whether the attribute should be removed
            // or not. This is overridden by 'empty' if both are set. If 'empty'
            // or 'remove' are not set, the default action is to remove the attribute.
            "remove": true | false,

            // Enter true or false to flag whether the attribute should be emptied
            // or not (that is, have its value removed). If used with
            // 'replacement', the attribute's value is replaced with the
            // passed string. This overrides 'remove' if both are set.
            "empty": true | false,

            // If 'empty' is set, this value will be used to replace the attribute's value
            "replacement": "String",
        }
    ]
}
```

### Clean Configuration - Inline JSON

If the clean configuriation is a JSON string, it is loaded directly.

```shell
ddp -c='{ "elements": [{ "selector": "head" }] }' http://example.com
```

Make sure any backslashes are escaped accordingly:

```shell
ddp -c='{ "elements": [{ "selector": "script", "containsRegex": "jQuery v\\d" }] }' http://example.com
```

### Clean Configuration - File Path

If the clean configuration is a file, it is loaded and parsed as JSON.

```
// clean-config.json
{
    "elements": [
        { "selector": "head" }
    ]
}
```

```shell
$ ddp -c=clean-config.json http://example.com
```

### Clean Configuration - Piped in via `stdin`

If the clean configuration is set to `stdin`, then the piped input will be parsed as JSON.

```
// clean-config.json
{
    "elements": [
        { "selector": "head" }
    ]
}
```

```shell
$ cat clean-config.json | ddp -c=stdin http://example.com
```

### Clean Configuration - Motiviation / Example Scenario

Let's imagine your production site includes some analytics script tag at the bottom of the page.
This tag is managed outside the static HTML you have built, and is injected at runtime by the
production site.

When you are trying to determine the development vs. production differences, you already know that
this script tag will be flagged as a difference. However, since the production site has a different
mechanism for injecting the tag, this isn't a _useful_ difference, and should be ignored.

To address this, we can _clean_ both our local and production HTML before we compare the two.

Let's say your development HTML file looks like this at the end:

```html
<!-- Local development HTML file -->
<body>
  ...
  <footer>Copyright 2020</footer>
</body>
```

And your production HTML file looks like this:

```html
<!-- Remove production HTML file -->
<body>
  ...
  <footer>Copyright 2020</footer>
  <script>(function reportAnalytics() { /* ... */ })()</script>
</body>
```

To prevent that script tag from being shown as a difference, you'd use the following clean configuration:

```
// clean-config.json
{
    "elements": [
        {
            "selector": "script",
            "contains": "reportAnalytics",
            "remove": true
        }
    ]
}
```

Before starting the comparsion, _both_ the local and remote HTML files will search for `<script>`
tags that contain the string `"reportAnalytics"` and remove it. Since your local HTML file does
not contain this tag, nothing changes. However, the HTML file for the remote production site _will_
have this removed, thus allowing a more useful comparison.

## Example Output

The output will be an HTML file that uses [diff2html](https://www.npmjs.com/package/diff2html)
under the hood.

Open this file in your favorite browser to view the report.

The red (`-`) lines indicate what your _local_ development build files show,
and the green (`+`) lines indicate what your _remote_ production pages show.

![Animation of example output](https://raw.githubusercontent.com/Designory/diff-dev-prod/main/docs/example-diff.gif)

## License

[MIT](./LICENSE)

## Author

[Matt Wade](https://github.com/romellem/)
