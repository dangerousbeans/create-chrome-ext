#!/usr/bin/env node

// @ts-check
import * as fs from 'fs'
import * as path from 'path'
import minimist from 'minimist'
import prompts from 'prompts'
import mustache from 'mustache'
import { fileURLToPath } from 'url'
import { blue, lightBlue, yellow, cyan, magenta, green, red, reset } from 'kolorist'

const argv = minimist(process.argv.slice(2), { string: ['_'] })
const cwd = process.cwd()

const Boilerplates = [
  {
    name: 'lit',
    color: lightBlue,
    variants: [
      {
        name: 'lit-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'lit-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
  {
    name: 'preact',
    color: magenta,
    variants: [
      {
        name: 'preact-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'preact-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
  {
    name: 'react',
    color: cyan,
    variants: [
      {
        name: 'react-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'react-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
  {
    name: 'svelte',
    color: red,
    variants: [
      {
        name: 'svelte-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'svelte-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
  {
    name: 'vanilla',
    color: yellow,
    variants: [
      {
        name: 'vanilla-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'vanilla-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
  {
    name: 'vue',
    color: green,
    variants: [
      {
        name: 'vue-js',
        display: 'JavaScript',
        color: yellow,
      },
      {
        name: 'vue-ts',
        display: 'TypeScript',
        color: blue,
      },
    ],
  },
]

const TEMPLATES = Boilerplates.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name],
).reduce((a, b) => a.concat(b), [])

const renameFiles = {}

// @ts-ignore
Date.prototype.format = function (fmt) {
  const o = {
    'M+': this.getMonth() + 1,
    'd+': this.getDate(),
  }
  if (/(y+)/.test(fmt))
    fmt = fmt.replace(RegExp.$1, (this.getFullYear() + '').substr(4 - RegExp.$1.length))
  for (var k in o)
    if (new RegExp('(' + k + ')').test(fmt))
      fmt = fmt.replace(
        RegExp.$1,
        RegExp.$1.length == 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length),
      )
  return fmt
}

async function init() {
  let targetDir = formatTargetDir(argv._[0]) ?? ''
  let author = '**'
  let template = argv.template || argv.t

  const defaultTargetDir = 'vite-project'
  const getProjectName = () => (targetDir === '.' ? path.basename(path.resolve()) : targetDir)

  let result = {}

  try {
    result = await prompts(
      [
        {
          type: targetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir
          },
        },
        {
          type: () => (!fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'confirm'),
          name: 'overwrite',
          message: () =>
            (targetDir === '.' ? 'Current directory' : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        {
          type: targetDir ? null : 'text',
          name: 'author',
          message: reset('Author:'),
          initial: 'no one',
          onState: (state) => {
            author = formatTargetDir(state.value) || 'no one'
          },
        },
        {
          type: (_, opts = {}) => {
            if (opts.overwrite === false) {
              throw new Error(red('✖') + ' Operation cancelled')
            }
            return null
          },
          name: 'overwriteChecker',
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: reset('Package name:'),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) => isValidPackageName(dir) || 'Invalid package.json name',
        },
        {
          type: template && TEMPLATES.includes(template) ? null : 'select',
          name: 'framework',
          message:
            typeof template === 'string' && !TEMPLATES.includes(template)
              ? reset(`"${template}" isn't a valid template. Please choose from below: `)
              : reset('Framework:'),
          initial: 0,
          choices: Boilerplates.map((framework) => {
            const frameworkColor = framework.color
            return {
              title: frameworkColor(framework.name),
              value: framework,
            }
          }),
        },
        {
          type: (framework) => (framework && framework.variants ? 'select' : null),
          name: 'variant',
          message: reset('Language:'),
          // @ts-ignore
          choices: (framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color
              return {
                title: variantColor(variant.name),
                value: variant.name,
              }
            }),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled')
        },
      },
    )
  } catch (cancelled) {
    console.log(cancelled.message)
    return
  }

  // user choice associated with prompts
  const { framework, overwrite, packageName, variant } = result

  const root = path.join(cwd, targetDir)

  if (overwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true })
  }

  // determine template
  template = variant || framework || template

  console.log(`\nScaffolding project in ${root}...`)

  // template boilerplate
  const templateDir = path.resolve(fileURLToPath(import.meta.url), '..', `template-${template}`)

  // mustache
  const mustacheDir = path.resolve(fileURLToPath(import.meta.url), '..', 'mustache')

  const opts = {
    name: packageName || getProjectName(),
    author: author || '*',
    //@ts-ignore
    now: new Date().format('yyyy.MM.dd'),
    //@ts-ignore
    nowYear: new Date().format('yyyy'),
  }

  const write = (file, content) => {
    const targetPath = renameFiles[file]
      ? path.join(root, renameFiles[file])
      : path.join(root, file)
    if (content) {
      fs.writeFileSync(targetPath, content)
    } else if (/\.mustache$/gi.test(file)) {
      copy(path.join(mustacheDir, file), targetPath, opts)
    } else {
      copy(path.join(templateDir, file), targetPath)
    }
  }

  const files = fs.readdirSync(templateDir)
  for (const file of files.filter((f) => f !== 'package.json')) {
    write(file)
  }

  const mFiles = fs.readdirSync(mustacheDir)
  for (const file of mFiles) {
    write(file)
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'))

  pkg.name = packageName || getProjectName()
  pkg.author = author || '*'

  write('package.json', JSON.stringify(pkg, null, 2))

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm'

  console.log(`\nDone. Now run:\n`)
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`)
  }
  switch (pkgManager) {
    case 'yarn':
      console.log('  yarn')
      console.log('  yarn dev')
      break
    default:
      console.log(`  ${pkgManager} install`)
      console.log(`  ${pkgManager} run dev`)
      break
  }
  console.log()
}

/**
 * @param {string | undefined} targetDir
 */
function formatTargetDir(targetDir) {
  return targetDir?.trim().replace(/\/+$/g, '')
}

function copy(src, dest, opts = {}) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else if (/\.mustache$/gi.test(src)) {
    let stemp = fs.readFileSync(src, { encoding: 'utf8' })
    let result = mustache.render(stemp, opts)
    dest = dest.replace(/\.mustache$/gi, '')
    fs.writeFileSync(dest, result, { encoding: 'utf-8' })
  } else {
    fs.copyFileSync(src, dest)
  }
}

/**
 * @param {string} projectName
 */
function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(projectName)
}

/**
 * @param {string} projectName
 */
function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 */
function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file)
    const destFile = path.resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

/**
 * @param {string} path
 */
function isEmpty(path) {
  const files = fs.readdirSync(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

/**
 * @param {string} dir
 */
function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
  }
}

/**
 * @param {string | undefined} userAgent process.env.npm_config_user_agent
 * @returns object | undefined
 */
function pkgFromUserAgent(userAgent) {
  if (!userAgent) return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

init().catch((e) => {
  console.error(e)
})
