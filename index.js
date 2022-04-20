const fsp = require('fs/promises');
const path = require('path');
const ejs = require('ejs');
const marked = require('marked');
const frontMatter = require('front-matter');

const DEF_CONFIG_FILE = './config.js';
const DEF_CONFIG = {
  baseDir: '.',
  srcDir: 'src',
  outDir: 'out',
  assetDir: 'asset',
  pageDir: 'page',
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
  const config = await loadConfig();
  await generate(config);
}

async function loadConfig(configFile) {
  try {
    return require(configFile);
  } catch(e) {
    return DEF_CONFIG;
  }
}

async function generate(config) {
  const srcDir = path.resolve(config.baseDir, config.srcDir);
  const outDir = path.resolve(config.baseDir, config.outDir);

  log(`generate: ${srcDir} -> ${outDir}`);

  await cleanOutput(outDir);

  const assetDir = path.resolve(srcDir, config.assetDir);
  await copyAssets(assetDir, outDir);

  const pageDir = path.resolve(srcDir, config.pageDir);
  await renderPages(pageDir, outDir);
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

async function renderPages(pageDir, outDir) {
  log(`renderPages: ${pageDir} -> ${outDir}`);
  const pageFiles = await collectFiles(pageDir);
  for (const pageFile of pageFiles) {
    const page = await renderPage(pageFile);

    const layoutFile = `src/layout/${page.layout ?? 'default'}.ejs`;
    const layoutHtml = await fsp.readFile(layoutFile, 'utf8');

    const { dir, name, ext } = path.parse(pageFile);
    const pageOutDir = path.join(outDir, dir.substring(pageDir.length));
    const pageOutFile = path.format({
      dir: pageOutDir,
      name,
      ext: '.html'
    });
    log(`\t+ ${layoutFile} -> ${pageOutFile}`);

    const html = ejs.render(layoutHtml, { page });

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
  return { ...attributes, main: marked.parse(body) };
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
