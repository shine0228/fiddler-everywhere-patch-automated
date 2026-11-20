const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require(process.argv[2] ? path.resolve(process.argv[2]) : 'jsdom');
const source = fs.readFileSync(path.join(__dirname, 'translate.js'), 'utf8');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function idle(window) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    await delay(20);
    const stats = window.__fiddlerTranslation.stats;
    if (!stats.pendingRoots && !stats.pendingBatches && !stats.scheduled) return;
  }
  throw new Error('Translation work did not settle; a feedback loop may exist');
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<nav><button id="live">Live Traffic</button><span id="heading" title="Request">Headers</span><input id="input" placeholder="Request" value="original value"></nav><section id="data"></section>', {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  const { document } = window;
  let aggregateReads = 0;
  let protectedReads = 0;
  let protectedWrites = 0;
  const textContent = Object.getOwnPropertyDescriptor(window.Node.prototype, 'textContent');
  Object.defineProperty(window.Element.prototype, 'textContent', {
    get() { aggregateReads++; throw new Error('Aggregate element textContent read'); },
    set(value) { textContent.set.call(this, value); },
  });
  const nativeData = Object.getOwnPropertyDescriptor(window.CharacterData.prototype, 'data');
  const protectedTexts = [];
  function protect(text) {
    protectedTexts.push(text);
    Object.defineProperty(text, 'data', {
      get() { protectedReads++; return nativeData.get.call(this); },
      set(value) { protectedWrites++; throw new Error('Captured request data was modified'); },
    });
    return text;
  }
  const dataRoot = document.getElementById('data');
  for (const tag of ['app-content-viewer', 'app-body-editor', 'app-hex-viewer', 'pre', 'code', 'ngx-monaco-editor']) {
    const element = document.createElement(tag);
    element.append(protect(document.createTextNode('Headers')));
    dataRoot.append(element);
  }
  const editor = document.createElement('div');
  editor.className = 'monaco-editor';
  editor.append(protect(document.createTextNode('{"Body":"Response","value":"' + 'x'.repeat(1024 * 1024) + '"}')));
  dataRoot.append(editor);
  const grid = document.createElement('div');
  grid.className = 'k-grid-content';
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 3000; index++) {
    const cell = document.createElement('span');
    cell.append(protect(document.createTextNode('Request')));
    fragment.append(cell);
  }
  grid.append(fragment);
  dataRoot.append(grid);
  const before = protectedTexts.map(text => nativeData.get.call(text));
  let clicks = 0;
  document.getElementById('live').addEventListener('click', () => clicks++);
  window.eval(source);
  await idle(window);
  assert.strictEqual(document.getElementById('live').firstChild.data, '实时流量');
  assert.strictEqual(document.getElementById('heading').firstChild.data, '请求头');
  assert.strictEqual(document.getElementById('heading').getAttribute('title'), '请求');
  assert.strictEqual(document.getElementById('input').getAttribute('placeholder'), '请求');
  assert.strictEqual(document.getElementById('input').value, 'original value');
  document.getElementById('live').click();
  assert.strictEqual(clicks, 1, 'Button listeners must survive translation');
  assert.deepStrictEqual(protectedTexts.map(text => nativeData.get.call(text)), before);
  assert.strictEqual(protectedReads, 0, 'Payload text must not even be read by translation');
  assert.strictEqual(protectedWrites, 0);
  assert.strictEqual(aggregateReads, 0);
  const initialNodes = window.__fiddlerTranslation.stats.processedNodes;
  for (const text of protectedTexts) nativeData.set.call(text, 'Response');
  await idle(window);
  assert.strictEqual(window.__fiddlerTranslation.stats.processedNodes, initialNodes, 'Traffic-only changes must not trigger DOM scans');
  assert.strictEqual(protectedReads, 0);
  document.getElementById('heading').firstChild.data = 'Response';
  await idle(window);
  assert.strictEqual(document.getElementById('heading').firstChild.data, '响应');
  window.__fiddlerTranslation.setLanguage('en');
  assert.strictEqual(document.getElementById('live').firstChild.data, 'Live Traffic');
  assert.strictEqual(document.getElementById('heading').firstChild.data, 'Response');
  const stopped = window.__fiddlerTranslation.stats;
  document.getElementById('heading').firstChild.data = 'Save';
  await delay(60);
  assert.deepStrictEqual(window.__fiddlerTranslation.stats, stopped, 'English mode must disconnect its observer');
  window.__fiddlerTranslation.setLanguage('zhCn');
  await idle(window);
  assert.strictEqual(document.getElementById('heading').firstChild.data, '保存');
  const gui = document.createElement('section');
  for (let index = 0; index < 240; index++) {
    const label = document.createElement('span');
    label.append(document.createTextNode('Settings'));
    gui.append(label);
  }
  let timerRan = false;
  setTimeout(() => { timerRan = true; }, 0);
  document.body.append(gui);
  await delay(5);
  assert(timerRan, 'GUI updates must yield to other tasks');
  await idle(window);
  assert([...gui.children].every(element => element.firstChild.data === '设置'));
  const populated = window.__fiddlerTranslation.stats.trackedLabels;
  gui.remove();
  await idle(window);
  assert(window.__fiddlerTranslation.stats.trackedLabels < populated, 'Removed UI labels must be released');
  assert(window.__fiddlerTranslation.stats.maxNodesInFrame <= 200, 'Frame work must be bounded');
  assert(window.__fiddlerTranslation.stats.frames > 1);
  assert.deepStrictEqual(errors, []);
  console.log(JSON.stringify({ uiLabels: 'passed', payloadUnchanged: 'passed', payloadReads: protectedReads,
    aggregateReads, testedTrafficNodes: protectedTexts.length, englishObserverDisconnected: 'passed',
    boundedFrames: 'passed', stats: window.__fiddlerTranslation.stats }));
  window.__fiddlerTranslation.stop();
  dom.window.close();
  if (process.argv[3]) {
    const baseline = new JSDOM('<body><button>Live Traffic</button></body>', { runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
    Object.defineProperty(baseline.window.Element.prototype, 'textContent', { get() { throw new Error('Aggregate element textContent read'); } });
    assert.throws(() => baseline.window.eval(fs.readFileSync(path.resolve(process.argv[3]), 'utf8')), /Aggregate element textContent read/);
    baseline.window.close();
    console.log('The same regression fixture rejects the previous translation implementation.');
  }
})().catch(error => { console.error(error.stack); process.exit(1); });
