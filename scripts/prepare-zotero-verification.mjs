// Creates a fresh isolated profile. Does not launch Zotero or touch its normal profile.
import { zipSync, unzipSync } from 'fflate';
import { mkdir, readFile, writeFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { makeDictionary } from '../tests/fixtures.mjs';
import { makeStarDict, dictzip } from '../tests/format-fixtures.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.argv[2]) throw new Error('Pass an explicit fresh verification directory.');
const base = path.resolve(process.argv[2]), profile = path.join(base, 'profile'), data = path.join(base, 'data');
try { await access(path.join(data, 'zotero.sqlite')); throw new Error('Use a fresh verification directory; a library already exists here.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(path.join(profile, 'extensions'), { recursive: true }); await mkdir(data, { recursive: true });
const manifest = JSON.parse(await readFile(path.join(root, 'addon/manifest.json'), 'utf8'));
const dictFolder = path.join(base, 'dictionaries'); await mkdir(dictFolder, { recursive: true });
await writeFile(path.join(dictFolder, 'A.mdx'), makeDictionary([
  ['research', '<h2>research</h2><p>Research definition A</p><a href="entry://network">network</a><a href="sound://gb.wav">UK</a><a href="sound://us.wav">US</a>'],
  ['network', '<h2>network</h2><p>Network definition</p>'], ['study', '<p>Study definition</p>'], ['run', '<p>Run definition</p>'],
  ...Array.from({ length: 13 }, (_, index) => ['bulk', `<p>Bulk definition ${index + 1}</p>`]),
]));
await writeFile(path.join(dictFolder, 'B.mdx'), makeDictionary([['research', '<p>Research definition B</p>'], ['gradient', '<p>Gradient definition</p>']]));
const wav = Buffer.alloc(44 + 1600); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(1600, 40);
await writeFile(path.join(dictFolder, 'gb.wav'), wav); await writeFile(path.join(dictFolder, 'us.wav'), wav);
const formatsFolder = path.join(base, 'formats'); await mkdir(formatsFolder, { recursive: true });
for (const [file, bytes] of Object.entries(makeStarDict(path.join(formatsFolder, 'C-StarDict'), [['research', '<p>StarDict research definition</p>'], ['study', '<p>StarDict study definition</p>']], { compressedIndex: true, randomAccess: true, synonyms: [['studies', 1]] }))) await writeFile(file, bytes);
const dsl = '#NAME "DSL test"\n#INDEX_LANGUAGE "English"\n#CONTENTS_LANGUAGE "English"\nresearch\n  [b]DSL research definition[/b] [ref]network[/ref] [s]gb.wav[/s]\nnetwork\n  DSL network definition\n';
await writeFile(path.join(formatsFolder, 'D-DSL.dsl.dz'), dictzip(Buffer.from(dsl)));
await mkdir(path.join(formatsFolder, 'D-DSL.dsl.files'), { recursive: true }); await writeFile(path.join(formatsFolder, 'D-DSL.dsl.files', 'gb.wav'), wav);
const packageArgument = process.argv.find(arg => arg.startsWith('--package='))?.slice('--package='.length);
let testPackage, packagedFiles;
if (packageArgument) {
  const packagePath = path.resolve(packageArgument), packageBytes = await readFile(packagePath);
  testPackage = { path: packagePath, sha256: createHash('sha256').update(packageBytes).digest('hex') };
  const packaged = unzipSync(packageBytes);
  if (!packaged['manifest.json'] || !packaged['content/plugin.js']) throw new Error('The specified test package is missing addon files.');
  const packagedManifest = JSON.parse(new TextDecoder().decode(packaged['manifest.json']));
  if (packagedManifest.version !== manifest.version) throw new Error('The specified package version does not match the workspace manifest.');
  testPackage.pluginSha256 = createHash('sha256').update(packaged['content/plugin.js']).digest('hex');
  packagedFiles = packaged;
}
const config = {
  version: manifest.version, liveEdgeProbe: process.argv.includes('--network'),
  livePublicOnlineProbes: process.argv.includes('--public-online-probes'), testPackage,
  publicQuery: process.argv.find(arg => arg.startsWith('--public-query='))?.slice('--public-query='.length) || 'hello',
  googleQuery: process.argv.find(arg => arg.startsWith('--google-query='))?.slice('--google-query='.length) || 'hello',
  liveGoogleDiagnostic: process.argv.includes('--google-diagnostic'),
  dictFolder, formatsFolder, dataPath: data, pdfPath: path.join(base, 'sample.pdf'),
  reportPath: path.join(base, 'report.json'), preferencesXML: await readFile(path.join(root, 'addon/content/preferences.xhtml'), 'utf8'),
};
const files = {};
async function walk(dir, prefix = '') {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), name + '/');
    else files[name] = new Uint8Array(await readFile(path.join(dir, entry.name)));
  }
}
if (packagedFiles) Object.assign(files, packagedFiles);
else await walk(path.join(root, 'addon'));
// Instrument only this isolated test copy, never the distributable package.
let probeBundle = new TextDecoder().decode(files['content/plugin.js']);
probeBundle = probeBundle.replace('const origin = down;', 'Zotero.__localQueryTrace?.push({ stage: "up", down: !!down, request }); const origin = down;')
  .replace('if (stopped || ticket !== request || !enabled()) return;', 'Zotero.__localQueryTrace?.push({ stage: "wait", ticket, request, stopped }); if (stopped || ticket !== request || !enabled()) return;')
  .replace('if (word) void show(word,', 'Zotero.__localQueryTrace?.push({ stage: "word", word }); if (word) void show(word,');
probeBundle = probeBundle.replace('if (disposed || drag || event.target !== header2', 'Zotero.__localQueryTrace?.push({ stage: "drag-start", same: event.target === header2, nodeSame: header2.isSameNode(event.target), target: event.target.localName, button: event.button, primary: event.isPrimary, x: event.clientX, y: event.clientY }); if (disposed || drag || event.target !== header2')
  .replace('if (!drag || event.pointerId !== drag.pointerId ||', 'Zotero.__localQueryTrace?.push({ stage: "drag-move", drag: !!drag, pointer: event.pointerId, expected: drag?.pointerId, x: event.clientX, y: event.clientY }); if (!drag || event.pointerId !== drag.pointerId ||');
files['content/plugin.js'] = new TextEncoder().encode(probeBundle);
const bootstrap = new TextDecoder().decode(files['bootstrap.js']).replace('await Zotero.LocalMDXClick.start();',
  'await Zotero.LocalMDXClick.start();\n  Services.scriptloader.loadSubScript(rootURI + "integration.js", pluginScope);\n  pluginScope.runZoteroVerification(' + JSON.stringify(config) + ');');
files['bootstrap.js'] = new TextEncoder().encode(bootstrap);
files['integration.js'] = new Uint8Array(await readFile(path.join(root, 'tests/zotero-integration.js')));
await writeFile(path.join(profile, 'extensions', manifest.applications.zotero.id + '.xpi'), zipSync(files));
const prefs = {
  'extensions.zotero.dataDir': data, 'extensions.zotero.useDataDir': true,
  'extensions.zotero.firstRun2': false, 'extensions.zotero.firstRunGuidance': false,
  'extensions.zotero.automaticScraperUpdates': false,
  'extensions.zoteroWinWordIntegration.skipInstallation': true, 'extensions.zoteroOpenOfficeIntegration.skipInstallation': true,
  'extensions.autoDisableScopes': 0, 'extensions.enabledScopes': 15, 'extensions.startupScanScopes': 15,
  'toolkit.telemetry.enabled': false, 'datareporting.healthreport.uploadEnabled': false,
};
await writeFile(path.join(profile, 'user.js'), Object.entries(prefs).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
const text = 'BT /F1 20 Tf 72 720 Td (research sample) Tj ET';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`];
let pdf = '%PDF-1.4\n', offsets = [0];
for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile(config.pdfPath, pdf); const { preferencesXML, ...paths } = config; console.log(JSON.stringify({ profile, ...paths }));
