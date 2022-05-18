const fsp = require('fs/promises');
const path = require('path');
const { Command } = require('commander');
const ejs = require('ejs');
const MarkdownIt = require('markdown-it');
const frontMatter = require('front-matter');

const DEF_CONFIG_FILE = './config.js';
const DEF_CONFIG = {
  baseDir: '.',
  srcDir: 'src', // absolute or relative to baseDir
  outDir: 'out', // absolute or relative to baseDir
  assetDir: 'asset', // absolute or relative to srcDir
  pageDir: 'page', // absolute or relative to srcDir
  layoutDir: 'layout', // absolute or relative to srcDir
  site: {
    url: 'https://day1co.github.io',
    title: 'DAY1 COMPANY Tech Blog',
    description: 'Development for Life Changing Education',
    image: '/favicon.png',
  },
};

function log(...args) {
  console.log(...args);
}

async function mkdirp(dir) {
  try {
    return await fsp.mkdir(dir, { recrusive: true });
  } catch(e) {
  }
}

if (require.main === module) {
  main(process.argv).then(console.info).catch(console.error);
}

async function main(args) {
  const program = new Command();

  program
    .option('-c, --config <string>', 'path to config file');

  program
    .command('build')
    .action(async () => build(await initContext(program.opts.config)));

  program
    .command('watch')
    .action(async () => watch(await initContext(program.opts.config)));

  await program.parseAsync(args);
}

async function initContext(configFile) {
  const config = await loadConfig(configFile);

  const srcDir = path.resolve(config.baseDir, config.srcDir);
  const outDir = path.resolve(config.baseDir, config.outDir);
  const assetDir = path.resolve(srcDir, config.assetDir);
  const pageDir = path.resolve(srcDir, config.pageDir);
  const layoutDir = path.resolve(srcDir, config.layoutDir);

  return { ...config, srcDir, outDir, assetDir, pageDir, layoutDir };
}

async function loadConfig(configFile) {
  log(`loadConfig: ${configFile}`);
  try {
    return require(configFile);
  } catch(e) {
    return DEF_CONFIG;
  }
}

async function build(context) {
  const { srcDir, outDir, assetDir, pageDir } = context;

  log(`build: ${srcDir} -> ${outDir}`);

  await cleanOutput(outDir);
  await copyAssets(assetDir, outDir);
  await renderPages(pageDir, outDir, context);
}

async function watch(context) {
  const { srcDir } = context;

  log(`watch: ${srcDir}`);
  const watcher = await fsp.watch(srcDir, { recursive: true });
  for await (const event of watcher) {
    log('\twatch: ', event);
    // TODO: process the modified file only
    await build(context);
  }
}

async function cleanOutput(outDir) {
  log(`clean out: ${outDir}`);
  //await fsp.rm(outDir, { recursive: true });
  mkdirp(outDir);
}

async function copyAssets(assetDir, outDir) {
  log(`copy assets: ${assetDir} -> ${outDir}`);
  await fsp.cp(assetDir, outDir, { recursive: true });
}

async function renderPages(pageDir, outDir, context) {
  log(`renderPages: ${pageDir} -> ${outDir}`);
  const pageFiles = await collectFiles(pageDir);
  for (const pageFile of pageFiles) {
    const page = await renderPage(pageFile);

    const layoutFile = path.format({ dir: context.layoutDir, name: page.layout ?? 'default', ext: '.ejs' });
    const layoutHtml = await fsp.readFile(layoutFile, 'utf8');

    const { dir, name, ext } = path.parse(pageFile);
    const pageOutDir = path.join(outDir, dir.substring(pageDir.length));
    const pageOutFile = path.format({
      dir: pageOutDir,
      name,
      ext: '.html'
    });
    log(`\t${layoutFile} -> ${pageOutFile}`);

    const pageUrlPath = path.relative(outDir, (name === 'index') ? pageOutDir : pageOutFile);
    page.url = `${context.site.url}/${pageUrlPath}`;

    const html = ejs.render(layoutHtml, { ...context, page });

    await mkdirp(pageOutDir);
    await fsp.writeFile(pageOutFile, html, 'utf8');
  }
}

async function renderPage(pageFile) {
  const ext = path.extname(pageFile);
  log(`renderPage: ${pageFile}`);
  const content = await fsp.readFile(pageFile, 'utf8');
  switch (ext) {
    case '.ejs':
    case '.html':
    case '.htm':
      return renderEjsPage(content);
    case '.md':
    case '.markdown':
      return renderMarkdownPage(content);
  }
  return {};
}

async function renderEjsPage(content) {
  return { main: ejs.render(content) };
}

async function renderMarkdownPage(content) {
  const { body, attributes } = frontMatter(content);
  const md = new MarkdownIt();
  return { ...attributes, main: md.render(body) };
}

async function collectFiles(parent) {
  const result = [];
  const dir = await fsp.opendir(parent);
  for await (const dirent of dir) {
    const child = path.join(parent, dirent.name);
    if (dirent.isDirectory()) {
      result.push(...await collectFiles(child));
    } else {
      result.push(child);
    }
  }
  return result;
}

module.exports = { main };
