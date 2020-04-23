// @ts-check
const { parse } = require('@textlint/markdown-to-ast')
const debug = require('debug')('@cypress/fiddle')

/**
 * Finds optional fiddle name from the comment line
 * `<!-- fiddle my name -->` returns "my name".
 */
const findFiddleName = commentLine => {
  debug('finding fiddle name from line: "%s"', commentLine)
  const matches = /fiddle(?:\.only|\.skip|\.export)? (.+)-->/.exec(commentLine)
  if (matches && matches.length) {
    const testTitle = matches[1].trim()
    debug('test title: "%s"', testTitle)
    return testTitle
  } else {
    debug('could not fiddle name from line "%s"', commentLine)
  }
}

const isFiddleOnly = (line) => line.startsWith('<!-- fiddle.only ')
const isFiddleSkip = (line) => line.startsWith('<!-- fiddle.skip ')
const isFiddleExport = (line) => line.startsWith('<!-- fiddle.export ')

const isFiddleMarkup = (s) => s && s.startsWith('<!-- fiddle-markup')

const extractFiddleMarkup = (s) => {
  s = s.replace('<!-- fiddle-markup', '').replace('-->', '').trim()
  return s
}

/**
 * Checks if the given line starts with "<!-- fiddle" or one of its variations.
 */
const isFiddleStartLine = (line) => {
  return line.startsWith('<!-- fiddle ') || isFiddleOnly(line) || isFiddleSkip(line) || isFiddleExport(line)
}

function extractFiddles (md) {
  const lines = md.split('\n')
  const fiddles = []

  let pageTitle
  const titleLine = lines.find(line => line.startsWith('# '))
  if (titleLine) {
    const matches = /^# (.+)$/.exec(titleLine)
    if (matches && matches.length) {
      pageTitle = matches[1].trim()
      debug('page title "%s"', pageTitle)
    }
  }

  let start = 0
  let startLine
  do {
    debug('start with %d', start)
    start = lines.findIndex(
      (line, k) => k >= start && isFiddleStartLine(line)
    )
    if (start === -1) {
      break
    }

    startLine = lines[start]
    const defaultFiddleName = `fiddle at line ${start + 1}`
    const testName = findFiddleName(startLine) || defaultFiddleName

    // allow ending fiddle with both comment lines
    let end = lines.indexOf('<!-- fiddle-end -->', start)
    if (end === -1) {
      end = lines.indexOf('<!-- fiddle.end -->', start)
    }
    if (end === -1) {
      console.error('could not find where fiddle "%s" ends', testName)
      console.error('did you forget "<!-- fiddle-end -->"?')
      break
    }

    const fiddle = lines.slice(start + 1, end).join('\n')

    fiddles.push({
      name: testName,
      fiddle,
      only: isFiddleOnly(startLine),
      skip: isFiddleSkip(startLine),
      export: isFiddleExport(startLine)
    })

    start = end + 1
  } while (true)

  debug('found %d fiddles', fiddles.length)
  debug(fiddles)
  // list of fiddles converted into JavaScript
  const testFiddles = []

  const isHtmlCodeBlock = n => n.type === 'CodeBlock' && n.lang === 'html'
  const isLiveHtml = n => n.type === 'Html'
  const isJavaScript = n =>
    n.type === 'CodeBlock' && (n.lang === 'js' || n.lang === 'javascript')

  fiddles.forEach(fiddle => {
    const ast = parse(fiddle.fiddle)
    // console.log('markdown fiddle AST')
    // console.log(ast)
    const htmlCodeBlockMaybe = ast.children.find(s => isHtmlCodeBlock(s))
    const htmlLiveBlockMaybe = ast.children.find(s => isLiveHtml(s) && !isFiddleMarkup(s.value))
    const htmlMarkup = ast.children.find(s => isFiddleMarkup(s.value))

    // console.log('found html block?', htmlMaybe)

    // a single fiddle can have multiple JS blocks
    // we want to find them all and merge into a single test
    const jsMaybe = ast.children.filter(isJavaScript)

    if (jsMaybe.length) {
      const testCode = jsMaybe.map(b => b.value).join('\n')

      const htmlNode = htmlLiveBlockMaybe || htmlCodeBlockMaybe
      const commonHtml = htmlMarkup ? extractFiddleMarkup(htmlMarkup.value) : null

      testFiddles.push({
        parentSuite: [{
          name: fiddle.name,
          test: testCode,
          html: htmlNode ? htmlNode.value : null,
          commonHtml,
          only: fiddle.only,
          skip: fiddle.skip,
          export: fiddle.export
        }]
      })
    }
  })

  // console.log(testFiddles)
  debug('Found fiddles: %d', testFiddles.length)

  const createTests = pageTitle ? {
    [pageTitle]: testFiddles
  } : testFiddles

  return createTests
}

module.exports = {
  extractFiddles
}
