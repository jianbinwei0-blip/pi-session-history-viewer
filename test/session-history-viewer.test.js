const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { Window } = require('happy-dom');

const extensionPath = path.resolve(__dirname, '..', 'extensions', 'session-history-viewer.js');

function createPiTuiStubs() {
  class Text {
    constructor(text = '') {
      this.text = String(text);
    }
    setText(text) {
      this.text = String(text);
    }
    render() {
      return [this.text];
    }
  }
  class Input {
    constructor() {
      this.value = '';
      this.focused = false;
      this.onSubmit = null;
      this.onEscape = null;
    }
    getValue() {
      return this.value;
    }
    handleInput(data) {
      if (data === '\r' || data === '\n' || data === 'enter') {
        if (this.onSubmit) this.onSubmit();
        return;
      }
      if (data === 'escape') {
        if (this.onEscape) this.onEscape();
        return;
      }
      if (data === '\b' || data === '\x7f' || data === 'backspace') {
        this.value = this.value.slice(0, -1);
        return;
      }
      if (typeof data === 'string' && data.length === 1) {
        this.value += data;
      }
    }
    render() {
      return [this.value];
    }
  }
  class Container {
    constructor() {
      this.children = [];
    }
    addChild(child) {
      this.children.push(child);
    }
    invalidate() {}
    render(width) {
      return this.children.flatMap((child) => {
        if (!child || typeof child.render !== 'function') return [''];
        const rendered = child.render(width);
        return Array.isArray(rendered) ? rendered : [String(rendered)];
      });
    }
  }
  class SelectList {
    constructor(items, _height, _theme) {
      this.items = items;
      this.selectedIndex = items.length ? 0 : -1;
      this.onSelect = null;
      this.onCancel = null;
      this.onSelectionChange = null;
    }
    getSelectedItem() {
      return this.selectedIndex >= 0 ? this.items[this.selectedIndex] : null;
    }
    invalidate() {}
    handleInput(data) {
      const previous = this.selectedIndex;
      if ((data === 'up' || data === 'pageUp') && this.items.length) this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      if ((data === 'down' || data === 'pageDown') && this.items.length) this.selectedIndex = Math.min(this.items.length - 1, Math.max(0, this.selectedIndex + 1));
      if (data === 'enter' && this.onSelect && this.getSelectedItem()) this.onSelect(this.getSelectedItem());
      if (data === 'escape' && this.onCancel) this.onCancel();
      if (previous !== this.selectedIndex && this.onSelectionChange) this.onSelectionChange(this.getSelectedItem());
    }
    render() {
      if (!this.items.length) return ['(no matches)'];
      return this.items.map((item, index) => `${index === this.selectedIndex ? '>' : ' '} ${item.label}`);
    }
  }
  return {
    Text,
    Input,
    Container,
    SelectList,
    Key: {
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      pageUp: 'pageUp',
      pageDown: 'pageDown',
      home: 'home',
      end: 'end',
      escape: 'escape',
      enter: 'enter'
    },
    matchesKey: (data, key) => data === key,
    truncateToWidth: (value) => String(value),
    wrapTextWithAnsi: (text, width) => {
      const input = String(text ?? '');
      if (!input) return [''];
      const parts = [];
      for (let index = 0; index < input.length; index += Math.max(1, width)) {
        parts.push(input.slice(index, index + Math.max(1, width)));
      }
      return parts;
    }
  };
}

function loadModule(overrides = {}) {
  delete require.cache[extensionPath];
  const state = {
    piAgent: {
      parseSessionEntries: () => [],
      CURRENT_SESSION_VERSION: 999,
      migrateSessionEntries: () => {},
      SessionManager: {},
      Extension: class {},
      getAgentDir: () => os.tmpdir(),
      DynamicBorder: class {
        constructor() {}
      }
    },
    piTui: createPiTuiStubs(),
    childProcess: {
      spawn: () => ({ unref() {} })
    }
  };
  if (overrides.piAgent) Object.assign(state.piAgent, overrides.piAgent);
  if (overrides.piTui) Object.assign(state.piTui, overrides.piTui);
  if (overrides.childProcess) Object.assign(state.childProcess, overrides.childProcess);
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@mariozechner/pi-coding-agent') return state.piAgent;
    if (request === '@mariozechner/pi-tui') return state.piTui;
    if (request === 'node:child_process') return state.childProcess;
    return originalLoad.apply(this, arguments);
  };
  try {
    const loaded = require(extensionPath);
    return { ...loaded, helpers: loaded.__sessionHistoryBenchmarkHelpers, stubs: state };
  } finally {
    Module._load = originalLoad;
  }
}

const { helpers } = loadModule();

function createSampleSession() {
  const timestamps = [
    '2026-04-07T10:00:00.000Z',
    '2026-04-07T10:00:05.000Z',
    '2026-04-07T10:00:06.000Z',
    '2026-04-07T10:00:07.000Z',
    '2026-04-07T10:00:10.000Z',
    '2026-04-07T10:01:00.000Z',
    '2026-04-07T10:01:05.000Z',
    '2026-04-07T10:01:06.000Z',
    '2026-04-07T10:01:08.000Z'
  ];
  const entries = [
    {
      type: 'message',
      id: 'u1',
      parentId: null,
      timestamp: timestamps[0],
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Need help debugging the session history viewer.' }]
      }
    },
    {
      type: 'message',
      id: 'a1',
      parentId: 'u1',
      timestamp: timestamps[1],
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'sonnet',
        content: [{ type: 'text', text: 'Let\'s inspect the renderer before making changes.' }]
      }
    },
    {
      type: 'message',
      id: 't1',
      parentId: 'a1',
      timestamp: timestamps[2],
      message: {
        role: 'toolResult',
        toolName: 'search_files',
        toolCallId: 'call-1',
        content: [{ type: 'text', text: 'Found viewer rendering code in extensions/session-history-viewer.js.' }]
      }
    },
    {
      type: 'message',
      id: 'b1',
      parentId: 't1',
      timestamp: timestamps[3],
      message: {
        role: 'bashExecution',
        command: 'npm test',
        output: 'ok\nall passing',
        exitCode: 0,
        cancelled: false,
        truncated: false
      }
    },
    {
      type: 'compaction',
      id: 's1',
      parentId: 'b1',
      timestamp: timestamps[4],
      summary: 'Investigated the viewer and identified likely rendering issues.'
    },
    {
      type: 'message',
      id: 'u2',
      parentId: 's1',
      timestamp: timestamps[5],
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Please make it faster and keep the overview first.' }]
      }
    },
    {
      type: 'message',
      id: 'a2',
      parentId: 'u2',
      timestamp: timestamps[6],
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'sonnet',
        content: [{ type: 'text', text: 'I removed the heavy raw payload and kept the overview visible.' }]
      }
    },
    {
      type: 'message',
      id: 'a-alt',
      parentId: 'u1',
      timestamp: timestamps[7],
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'haiku',
        content: [{ type: 'text', text: 'Alternate branch reply that should disappear in current path view.' }]
      }
    },
    {
      type: 'custom',
      id: 'e1',
      parentId: 'a2',
      timestamp: timestamps[8],
      customType: 'note',
      data: { goal: 'Finalize sidebar state after render', phase: 'done', detail: 'Background bookkeeping entry.' }
    }
  ];
  return {
    id: 'session-test',
    path: '/tmp/session-test.jsonl',
    cwd: '/tmp',
    created: timestamps[0],
    modified: timestamps[8],
    messageCount: 8,
    firstMessage: 'Need help debugging the session history viewer.',
    sessionName: 'Session history regression test',
    entries,
    branchEntries: entries.filter((entry) => entry.id !== 'a-alt'),
    rawText: '{"type":"session","id":"session-test"}\n{"type":"message","id":"u1"}',
    rawLineCount: 2
  };
}

function extractViewerPieces(html) {
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const bodyMatch = html.match(/<body>([\s\S]*?)<script/);
  assert.ok(bodyMatch, 'expected HTML body content before the script');
  return { bodyMarkup: bodyMatch[1], scripts };
}

async function bootViewer(options = {}) {
  const session = options.session || createSampleSession();
  const html = helpers.buildHistoryHtml(session);
  const { bodyMarkup, scripts } = extractViewerPieces(html);
  const window = new Window({ url: options.url || 'file:///tmp/session-history-viewer.html' });
  const scrollCalls = [];
  window.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.history.replaceState = () => {};
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView(optionsArg) {
    scrollCalls.push({
      id: this.getAttribute?.('data-transcript-id') || this.getAttribute?.('data-id') || this.id || this.tagName,
      options: optionsArg || null
    });
  };
  if (typeof options.setupWindow === 'function') options.setupWindow(window);
  window.document.body.innerHTML = bodyMarkup;
  for (const script of scripts) {
    window.eval(script);
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { html, session, window, document: window.document, scrollCalls };
}

function buttonByText(document, text) {
  return [...document.querySelectorAll('button')].find((button) => button.textContent.includes(text));
}

test('HTML viewer renders overview, prompt, sidebar previews, and transcript bodies without raw payload mode', async () => {
  const { html, document, window } = await bootViewer();

  assert.doesNotMatch(html, /rawTextData/);
  const modeButtons = [...document.querySelectorAll('#modeButtons button')].map((button) => button.textContent);
  assert.deepEqual(modeButtons, ['📜 All entries', '⑂ Current branch']);
  const sessionCardText = document.getElementById('sessionCard').textContent;
  assert.ok(sessionCardText.includes('Conversation overview'));
  assert.ok(sessionCardText.includes('Need help debugging the session history viewer.'));
  assert.equal(document.getElementById('promptCard').style.display, 'none');
  assert.ok(document.getElementById('detailCard').textContent.includes('Need help debugging the session history viewer.'));
  assert.ok(document.getElementById('detailCard').textContent.includes('Let\'s inspect the renderer before making changes.'));

  const sidebarEntries = [...document.querySelectorAll('#entryList [data-id]')].map((button) => button.textContent);
  assert.ok(sidebarEntries.some((text) => text.includes('Need help debugging the session history viewer.')));
  assert.ok(sidebarEntries.some((text) => text.includes('Let\'s inspect the renderer before making changes.')));
  assert.equal(document.body.textContent.includes('Conversation viewer error'), false);

  window.close();
});

test('HTML viewer preserves lowercase s characters in the conversation overview summary', async () => {
  const session = createSampleSession();
  session.firstMessage = 'based on the notion page "Genesis Phase 1 — Technical Architecture", how should I start to implement it? assume it is a greenfield project';
  session.entries = session.entries.map((entry) => {
    if (entry?.type === 'message' && entry.message?.role === 'user' && entry.id === 'u1') {
      return {
        ...entry,
        message: {
          ...entry.message,
          content: [{ type: 'text', text: session.firstMessage }]
        }
      };
    }
    return entry;
  });

  const { document, window } = await bootViewer({ session });
  const overviewText = document.querySelector('.friendly-summary').textContent;
  assert.ok(overviewText.includes(session.firstMessage));
  assert.ok(overviewText.includes('Genesis Phase 1'));
  assert.ok(overviewText.includes('should I start'));
  assert.ok(overviewText.includes('assume it is'));

  window.close();
});

test('generated inline viewer script preserves escaped regex and newline sequences', () => {
  const html = helpers.buildHistoryHtml(createSampleSession());
  const { scripts } = extractViewerPieces(html);
  const inlineScript = scripts.join('\n');

  assert.ok(inlineScript.includes("replace(/\\s+/g, ' ').trim()"));
  assert.ok(inlineScript.includes("replace(/\\r/g, '').split('\\n')"));
  assert.equal(inlineScript.includes("replace(/s+/g, ' ').trim()"), false);
});

test('search filters the sidebar using serialized display text', async () => {
  const { document, window } = await bootViewer();

  const searchEl = document.getElementById('search');
  searchEl.value = 'faster';
  searchEl.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  const sidebarEntries = [...document.querySelectorAll('#entryList [data-id]')].map((button) => button.textContent);
  assert.equal(sidebarEntries.length, 1);
  assert.ok(sidebarEntries[0].includes('Please make it faster and keep the overview first.'));

  window.close();
});

test('current path mode hides entries outside the active branch', async () => {
  const { document, window } = await bootViewer();

  assert.ok(document.getElementById('detailCard').textContent.includes('Alternate branch reply that should disappear in current path view.'));
  const branchButton = buttonByText(document, 'Current branch');
  assert.ok(branchButton, 'expected Current branch mode button');
  branchButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const detailText = document.getElementById('detailCard').textContent;
  assert.equal(detailText.includes('Alternate branch reply that should disappear in current path view.'), false);
  assert.ok(detailText.includes('I removed the heavy raw payload and kept the overview visible.'));

  window.close();
});

test('background activity previews and transcript bodies prefer a goal-like summary instead of raw JSON braces', async () => {
  const { document, window } = await bootViewer();

  const backgroundButton = buttonByText(document, 'Background');
  assert.ok(backgroundButton, 'expected Background role chip');
  backgroundButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const sidebarButtons = [...document.querySelectorAll('#entryList [data-id]')];
  const sidebarEntries = sidebarButtons.map((button) => button.textContent);
  assert.ok(sidebarEntries.some((text) => text.includes('Finalize sidebar state after render')));
  assert.equal(sidebarEntries.some((text) => /^\s*\{\s*$/.test(text)), false);

  const backgroundEntry = sidebarButtons.find((button) => button.textContent.includes('Finalize sidebar state after render'));
  assert.ok(backgroundEntry, 'expected summarized background entry');
  backgroundEntry.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const detailText = document.getElementById('detailCard').textContent;
  assert.ok(detailText.includes('Finalize sidebar state after render'));
  assert.equal(detailText.includes('Background bookkeeping entry.'), false);

  window.close();
});

test('advanced details toggle reveals technical metadata such as tools and models', async () => {
  const { document, window } = await bootViewer();

  assert.equal(document.getElementById('toolsCard').style.display, 'none');
  const advancedButton = document.getElementById('advancedToggle');
  assert.ok(advancedButton, 'expected advanced details toggle');
  advancedButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const toolsText = document.getElementById('toolsCard').textContent;
  const sessionText = document.getElementById('sessionCard').textContent;
  assert.ok(toolsText.includes('Technical details'));
  assert.ok(toolsText.includes('search_files'));
  assert.ok(toolsText.includes('anthropic/sonnet'));
  assert.ok(sessionText.includes('/tmp/session-test.jsonl'));
  assert.equal(sessionText.includes('Models:'), false);

  window.close();
});

test('prompt card stays hidden when the opening prompt is already visible in the transcript', async () => {
  const { document, window } = await bootViewer();

  assert.equal(document.getElementById('promptCard').style.display, 'none');
  const toolsButton = buttonByText(document, 'Tool activity');
  assert.ok(toolsButton, 'expected Tool activity role chip');
  toolsButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(document.getElementById('promptCard').style.display, 'none');

  window.close();
});

test('single-line transcript previews are not duplicated above identical body text', async () => {
  const session = createSampleSession();
  session.entries = [
    {
      type: 'message',
      id: 'u1',
      parentId: null,
      timestamp: '2026-04-07T10:00:00.000Z',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Show me the latest task updates.' }]
      }
    },
    {
      type: 'message',
      id: 'a1',
      parentId: 'u1',
      timestamp: '2026-04-07T10:00:05.000Z',
      message: {
        role: 'assistant',
        provider: 'anthropic',
        model: 'sonnet',
        content: [{ type: 'toolCall', name: 'TaskUpdate' }]
      }
    }
  ];
  session.branchEntries = session.entries;
  session.firstMessage = 'Show me the latest task updates.';
  const { document, window } = await bootViewer({ session });

  const assistantButton = [...document.querySelectorAll('#entryList [data-id]')].find((button) => button.getAttribute('data-id') === 'a1');
  assert.ok(assistantButton, 'expected assistant entry in sidebar');
  assistantButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  const transcriptEntry = document.querySelector('[data-transcript-id="a1"]');
  assert.ok(transcriptEntry, 'expected selected transcript entry');
  const previewLine = transcriptEntry.querySelector('.transcript-entry-meta');
  assert.equal(previewLine, null);
  const bodyText = transcriptEntry.querySelector('pre').textContent;
  assert.equal(bodyText, '[Tool call] TaskUpdate');

  window.close();
});

test('initial load does not scroll transcript into view unless a hash target is present', async () => {
  const noHash = await bootViewer({ url: 'file:///tmp/session-history-viewer.html' });
  const noHashTranscriptJumps = noHash.scrollCalls.filter((call) => call.options && call.options.block === 'start');
  assert.equal(noHashTranscriptJumps.length, 0);
  noHash.window.close();

  const withHash = await bootViewer({ url: 'file:///tmp/session-history-viewer.html#a2' });
  const hashTranscriptJumps = withHash.scrollCalls.filter((call) => call.options && call.options.block === 'start');
  assert.ok(hashTranscriptJumps.length >= 1);
  assert.ok(hashTranscriptJumps.some((call) => call.id === 'a2'));
  withHash.window.close();
});

test('role filter chips show the expected subsets of session entries', async () => {
  const { document, window } = await bootViewer();
  const cases = [
    ['Main conversation', 8],
    ['Everything', 9],
    ['You', 2],
    ['Pi', 3],
    ['Tool activity', 2],
    ['Summaries', 1],
    ['Background', 1]
  ];

  for (const [label, expectedCount] of cases) {
    const chip = buttonByText(document, label);
    assert.ok(chip, `expected role chip ${label}`);
    chip.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(document.querySelectorAll('#entryList [data-id]').length, expectedCount, `unexpected entry count for ${label}`);
  }

  window.close();
});

test('legend toggle shows and hides the color guide', async () => {
  const { document, window } = await bootViewer();
  assert.equal(document.getElementById('sessionCard').textContent.includes('Tool activity'), false);

  document.getElementById('legendToggle').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterOpen = document.getElementById('sessionCard').textContent;
  assert.ok(afterOpen.includes('You'));
  assert.ok(afterOpen.includes('Pi'));
  assert.ok(afterOpen.includes('Tool activity'));

  document.getElementById('legendToggle').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(document.getElementById('sessionCard').textContent.includes('Tool activity'), false);

  window.close();
});

test('empty sessions render a stable empty-state viewer', async () => {
  const emptySession = {
    id: 'empty-session',
    path: '/tmp/empty-session.jsonl',
    cwd: '/tmp',
    created: '',
    modified: '',
    messageCount: 0,
    firstMessage: '',
    sessionName: '',
    entries: [],
    branchEntries: [],
    rawText: '',
    rawLineCount: 0
  };
  const { document, window } = await bootViewer({ session: emptySession });

  assert.ok(document.getElementById('sessionCard').textContent.includes('Visible right now:0 items'));
  assert.equal(document.getElementById('promptCard').style.display, 'none');
  assert.ok(document.getElementById('entryList').textContent.includes('Nothing matched that search'));
  assert.ok(document.getElementById('detailCard').textContent.includes('Nothing matched the current search or filter'));
  assert.equal(document.body.textContent.includes('Conversation viewer error'), false);

  window.close();
});

test('dangerous HTML-like content is escaped and malformed entries do not break rendering', async () => {
  const riskyText = 'Danger </script><script>window.injected = 1</script><b>bold</b>';
  const malformedSession = {
    id: 'unsafe-session',
    path: '/tmp/unsafe-session.jsonl',
    cwd: '/tmp',
    created: '2026-04-07T10:00:00.000Z',
    modified: '2026-04-07T10:01:00.000Z',
    messageCount: 4,
    firstMessage: riskyText,
    sessionName: 'Unsafe content test',
    entries: [
      {
        type: 'message',
        id: 'u1',
        parentId: null,
        timestamp: '2026-04-07T10:00:00.000Z',
        message: { role: 'user', content: [{ type: 'text', text: riskyText }] }
      },
      {
        type: 'message',
        id: 'a1',
        parentId: 'u1',
        timestamp: '2026-04-07T10:00:05.000Z',
        message: { role: 'assistant', content: [{ type: 'toolCall', name: 'bash' }] }
      },
      {
        type: 'custom',
        id: 'c1',
        parentId: 'a1',
        timestamp: '2026-04-07T10:00:06.000Z',
        customType: 'state',
        data: {}
      },
      {
        type: 'message',
        id: 'broken',
        parentId: 'c1',
        message: { role: 'assistant' }
      }
    ],
    branchEntries: [],
    rawText: '{"type":"session"}',
    rawLineCount: 1
  };
  malformedSession.branchEntries = malformedSession.entries;
  const { html, document, window } = await bootViewer({ session: malformedSession });

  assert.doesNotMatch(html, /<script>window\.injected = 1<\/script>/);
  assert.equal(window.injected, undefined);
  assert.ok(document.getElementById('detailCard').textContent.includes('Danger </script><script>window.injected = 1</script><b>bold</b>'));
  assert.ok(document.getElementById('entryList').textContent.includes('[Tool call] bash'));
  assert.equal(document.body.textContent.includes('Conversation viewer error'), false);

  window.close();
});

test('assistant step controls can collapse individual groups and collapse or restore most steps globally', async () => {
  const { document, window } = await bootViewer();
  const assistantGroups = () => [...document.querySelectorAll('.transcript-group.assistantFlow')];
  const collapsedCount = () => assistantGroups().filter((group) => group.classList.contains('collapsed')).length;

  assert.ok(assistantGroups().length >= 2, 'expected multiple assistant groups in sample session');
  const firstGroupToggle = document.querySelector('[data-toggle-group="1"]');
  assert.ok(firstGroupToggle, 'expected per-group assistant toggle');
  firstGroupToggle.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(collapsedCount() >= 1);

  document.getElementById('assistantGroupsToggle').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(collapsedCount() >= 2);

  document.getElementById('assistantGroupsToggle').click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(collapsedCount(), 0);

  window.close();
});

test('keyboard shortcuts focus search, move selection, and switch between conversation modes', async () => {
  const { document, window, scrollCalls } = await bootViewer();
  const searchEl = document.getElementById('search');
  let focused = false;
  let blurred = false;
  searchEl.focus = () => { focused = true; };
  searchEl.select = () => {};
  searchEl.blur = () => { blurred = true; };

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/' }));
  assert.equal(focused, true);

  const startCallsBeforeDown = scrollCalls.filter((call) => call.options && call.options.block === 'start').length;
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const startCallsAfterDown = scrollCalls.filter((call) => call.options && call.options.block === 'start');
  assert.ok(startCallsAfterDown.length > startCallsBeforeDown);
  assert.equal(startCallsAfterDown.at(-1).id, 'a1');

  const startCallsBeforeUp = startCallsAfterDown.length;
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const startCallsAfterUp = scrollCalls.filter((call) => call.options && call.options.block === 'start');
  assert.ok(startCallsAfterUp.length > startCallsBeforeUp);
  assert.equal(startCallsAfterUp.at(-1).id, 'u1');

  searchEl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(blurred, true);

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '2' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(buttonByText(document, 'Current branch').classList.contains('active'), true);
  assert.equal(document.getElementById('detailCard').textContent.includes('Alternate branch reply that should disappear in current path view.'), false);

  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1' }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(buttonByText(document, 'All entries').classList.contains('active'), true);
  assert.equal(document.getElementById('detailCard').textContent.includes('Alternate branch reply that should disappear in current path view.'), true);

  window.close();
});

test('hashchange scrolls to a valid target and ignores invalid hashes without crashing', async () => {
  const { document, window, scrollCalls } = await bootViewer();
  const startCallsBefore = scrollCalls.filter((call) => call.options && call.options.block === 'start').length;

  window.location.hash = '#u2';
  window.dispatchEvent(new window.Event('hashchange'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  const afterValid = scrollCalls.filter((call) => call.options && call.options.block === 'start');
  assert.ok(afterValid.length > startCallsBefore);
  assert.equal(afterValid.at(-1).id, 'u2');

  window.location.hash = '#does-not-exist';
  window.dispatchEvent(new window.Event('hashchange'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(document.body.textContent.includes('Conversation viewer error'), false);

  window.close();
});

test('save snapshot exports an HTML file for the current filtered view', async () => {
  let exportedBlob = null;
  let clickedDownload = null;
  const { document, window } = await bootViewer({
    setupWindow(currentWindow) {
      currentWindow.URL.createObjectURL = (blob) => {
        exportedBlob = blob;
        return 'blob:test-snapshot';
      };
      currentWindow.URL.revokeObjectURL = () => {};
      currentWindow.HTMLAnchorElement.prototype.click = function click() {
        clickedDownload = { href: this.href, download: this.download };
      };
    }
  });

  const backgroundButton = buttonByText(document, 'Background');
  backgroundButton.click();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const searchEl = document.getElementById('search');
  searchEl.value = 'sidebar';
  searchEl.dispatchEvent(new window.Event('input', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  document.getElementById('exportSnapshotButton').click();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.ok(exportedBlob, 'expected snapshot blob to be created');
  assert.deepEqual(clickedDownload, {
    href: 'blob:test-snapshot',
    download: 'pi-session-history-snapshot-session-test.html'
  });
  const snapshotHtml = await exportedBlob.text();
  assert.match(snapshotHtml, /Conversation Snapshot — Session history regression test/);
  assert.match(snapshotHtml, /<p class="meta">All entries • Jump list filtered by Background • Search: sidebar<\/p>/);
  assert.match(snapshotHtml, /Jump list filtered by Background • Search: sidebar/);
  assert.match(snapshotHtml, /Finalize sidebar state after render/);

  window.close();
});

test('loadSession migrates older session files and derives the active branch from the latest leaf', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-load-'));
  const sessionPath = path.join(tempDir, 'example.jsonl');
  const rawText = '{"type":"session"}\n{"type":"message"}\n{"type":"custom"}';
  fs.writeFileSync(sessionPath, rawText, 'utf8');
  const parsedEntries = [
    { type: 'session', id: 'header-id', cwd: '/repo', timestamp: '2026-04-07T10:00:00.000Z', version: 1 },
    { type: 'message', id: 'u1', parentId: null, timestamp: '2026-04-07T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } },
    { type: 'session_info', id: 'meta1', parentId: 'u1', timestamp: '2026-04-07T10:00:02.000Z', name: 'Named session' },
    { type: 'message', id: 'a1', parentId: 'meta1', timestamp: '2026-04-07T10:00:03.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } },
    { type: 'message', id: 'branch-elsewhere', parentId: 'u1', timestamp: '2026-04-07T10:00:04.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Side branch' }] } }
  ];
  let migrated = null;
  const { helpers: localHelpers } = loadModule({
    piAgent: {
      CURRENT_SESSION_VERSION: 5,
      parseSessionEntries: () => parsedEntries,
      migrateSessionEntries: (entries) => { migrated = entries; }
    }
  });

  const loaded = localHelpers.loadSession(sessionPath, { modified: '2026-04-07T10:10:00.000Z', firstMessage: 'fallback first message' });
  assert.equal(loaded.id, 'header-id');
  assert.equal(loaded.cwd, '/repo');
  assert.equal(loaded.sessionName, 'Named session');
  assert.equal(loaded.rawText, rawText);
  assert.equal(loaded.rawLineCount, parsedEntries.length);
  assert.deepEqual(loaded.branchEntries.map((entry) => entry.id), ['u1', 'branch-elsewhere']);
  assert.equal(migrated, parsedEntries);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('loadSession falls back to basename and raw line counting when no session header exists', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-load-'));
  const sessionPath = path.join(tempDir, 'no-header.jsonl');
  const rawText = '{"type":"message"}\n{"type":"message"}\n';
  fs.writeFileSync(sessionPath, rawText, 'utf8');
  const parsedEntries = [
    { type: 'message', id: 'u1', parentId: null, timestamp: '2026-04-07T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } },
    { type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-04-07T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] } }
  ];
  const { helpers: localHelpers } = loadModule({
    piAgent: {
      parseSessionEntries: () => parsedEntries
    }
  });

  const loaded = localHelpers.loadSession(sessionPath, { created: '2026-04-07T11:00:00.000Z', modified: '2026-04-07T12:00:00.000Z', firstMessage: 'Fallback hello' });
  assert.equal(loaded.id, 'no-header');
  assert.equal(loaded.created, '2026-04-07T11:00:00.000Z');
  assert.equal(loaded.modified, '2026-04-07T12:00:00.000Z');
  assert.equal(loaded.firstMessage, 'Fallback hello');
  assert.equal(loaded.rawLineCount, 2);
  assert.deepEqual(loaded.branchEntries.map((entry) => entry.id), ['u1', 'a1']);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('writeHtmlViewer writes a standalone HTML file without embedding the removed raw payload block', () => {
  const outPath = helpers.writeHtmlViewer(createSampleSession());
  const html = fs.readFileSync(outPath, 'utf8');

  assert.ok(fs.existsSync(outPath));
  assert.match(html, /Session Preview — Session history regression test/);
  assert.doesNotMatch(html, /rawTextData/);

  fs.rmSync(outPath, { force: true });
});

test('extension only registers the HTML command, supports completions, and guards non-interactive usage', async () => {
  const registered = new Map();
  const messages = [];
  const { default: registerExtension } = loadModule();
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage(payload, options) {
      messages.push({ payload, options });
    }
  });

  assert.equal(registered.has('session-history'), false);
  assert.deepEqual(registered.get('session-history-html').getArgumentCompletions('p'), [
    { value: 'pick', label: 'pick' }
  ]);
  assert.equal(registered.get('session-history-html').getArgumentCompletions('zzz'), null);

  const ctx = { hasUI: false };
  await registered.get('session-history-html').handler('', ctx);

  assert.deepEqual(messages, [
    {
      payload: { customType: 'session-history-html', content: 'session-history-html requires interactive mode.', display: true },
      options: { triggerTurn: false }
    }
  ]);
});

test('HTML command opens the current session directly without picker or session discovery', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-command-'));
  const sessionPath = path.join(tempDir, 'current.jsonl');
  fs.writeFileSync(sessionPath, '{"type":"message"}', 'utf8');
  const parsedEntries = [
    { type: 'message', id: 'u1', parentId: null, timestamp: '2026-04-07T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } }
  ];
  const spawns = [];
  const notifications = [];
  const registered = new Map();
  const { default: registerExtension } = loadModule({
    piAgent: {
      parseSessionEntries: () => parsedEntries,
      SessionManager: {
        listAll: async () => {
          throw new Error('current should not list all sessions');
        },
        list: async () => {
          throw new Error('current should not list cwd sessions');
        }
      }
    },
    childProcess: {
      spawn(command, args) {
        spawns.push({ command, args });
        return { unref() {} };
      }
    }
  });

  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  let pickerCalls = 0;
  await registered.get('session-history-html').handler('current', {
    hasUI: true,
    cwd: tempDir,
    sessionManager: { getSessionFile: () => sessionPath },
    ui: {
      custom() {
        pickerCalls += 1;
        throw new Error('current should not open the picker');
      },
      notify(message, level) {
        notifications.push({ message, level });
      }
    }
  });

  assert.equal(pickerCalls, 0);
  assert.equal(spawns.length, 1);
  assert.ok(spawns[0].args[0].includes('pi-session-history-'));
  assert.deepEqual(notifications.map((entry) => entry.level), ['info']);
  assert.match(notifications[0].message, /Opened conversation viewer:/);
  fs.rmSync(spawns[0].args[0], { force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('HTML command opens an explicit absolute session path directly without picker or discovery', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-absolute-'));
  const sessionPath = path.join(tempDir, 'explicit.jsonl');
  fs.writeFileSync(sessionPath, '{"type":"message"}', 'utf8');
  const parsedEntries = [
    { type: 'message', id: 'u1', parentId: null, timestamp: '2026-04-07T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Open explicit file' }] } }
  ];
  const spawns = [];
  const notifications = [];
  const registered = new Map();
  const { default: registerExtension } = loadModule({
    piAgent: {
      parseSessionEntries: () => parsedEntries,
      SessionManager: {
        listAll: async () => {
          throw new Error('absolute path should not list all sessions');
        },
        list: async () => {
          throw new Error('absolute path should not list cwd sessions');
        }
      }
    },
    childProcess: {
      spawn(command, args) {
        spawns.push({ command, args });
        return { unref() {} };
      }
    }
  });
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  let pickerCalls = 0;
  await registered.get('session-history-html').handler(sessionPath, {
    hasUI: true,
    cwd: tempDir,
    sessionManager: { getSessionFile: () => path.join(tempDir, 'other.jsonl') },
    ui: {
      custom() {
        pickerCalls += 1;
        throw new Error('absolute path should not open the picker');
      },
      notify(message, level) {
        notifications.push({ message, level });
      }
    }
  });

  assert.equal(pickerCalls, 0);
  assert.equal(spawns.length, 1);
  assert.ok(spawns[0].args[0].includes('pi-session-history-'));
  assert.deepEqual(notifications.map((entry) => entry.level), ['info']);
  fs.rmSync(spawns[0].args[0], { force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('commands report clean errors when the selected session file is missing or loading fails', async () => {
  const notifications = [];
  const registered = new Map();
  const { default: registerExtension } = loadModule({
    piAgent: {
      SessionManager: {
        listAll: async () => [],
        list: async () => []
      },
      parseSessionEntries: () => {
        throw new Error('parse failed');
      }
    }
  });
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  await registered.get('session-history-html').handler('current', {
    hasUI: true,
    cwd: '/tmp',
    sessionManager: { getSessionFile: () => '/tmp/does-not-exist.jsonl' },
    ui: { notify(message, level) { notifications.push({ message, level }); } }
  });
  await registered.get('session-history-html').handler('/tmp/also-missing.jsonl', {
    hasUI: true,
    cwd: '/tmp',
    sessionManager: { getSessionFile: () => null },
    ui: { notify(message, level) { notifications.push({ message, level }); } }
  });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-error-'));
  const sessionPath = path.join(tempDir, 'broken.jsonl');
  fs.writeFileSync(sessionPath, '{"type":"message"}', 'utf8');
  await registered.get('session-history-html').handler(sessionPath, {
    hasUI: true,
    cwd: tempDir,
    sessionManager: { getSessionFile: () => null },
    ui: { notify(message, level) { notifications.push({ message, level }); } }
  });

  assert.deepEqual(notifications.map((entry) => entry.level), ['error', 'info', 'error']);
  assert.match(notifications[0].message, /Session file not found/);
  assert.match(notifications[1].message, /No session selected|Session file not found/);
  assert.match(notifications[2].message, /parse failed/);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('HTML command uses lightweight summaries for cwd and pick while scoping session choices correctly', async () => {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-agent-'));
  const cwd = '/Users/example/project';
  const otherCwd = '/Users/example/other-project';
  const sessionDirName = '--Users-example-project--';
  const otherSessionDirName = '--Users-example-other-project--';
  const sessionsDir = path.join(agentDir, 'sessions', sessionDirName);
  const otherSessionsDir = path.join(agentDir, 'sessions', otherSessionDirName);
  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(otherSessionsDir, { recursive: true });
  const firstPath = path.join(sessionsDir, 'first.jsonl');
  const secondPath = path.join(sessionsDir, 'second.jsonl');
  const outsidePath = path.join(otherSessionsDir, 'outside.jsonl');
  fs.writeFileSync(firstPath, [
    JSON.stringify({ type: 'session', id: 'first', cwd, timestamp: '2026-04-07T10:00:00.000Z' }),
    JSON.stringify({ type: 'session_info', name: 'Older session' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'older first prompt' }] } })
  ].join('\n'), 'utf8');
  fs.writeFileSync(secondPath, [
    JSON.stringify({ type: 'session', id: 'second', cwd, timestamp: '2026-04-07T11:00:00.000Z' }),
    JSON.stringify({ type: 'session_info', name: 'Newer session' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'newer first prompt' }] } }),
    JSON.stringify({ type: 'compaction', summary: 'better summary text' })
  ].join('\n'), 'utf8');
  fs.writeFileSync(outsidePath, [
    JSON.stringify({ type: 'session', id: 'outside', cwd: otherCwd, timestamp: '2026-04-07T12:00:00.000Z' }),
    JSON.stringify({ type: 'session_info', name: 'Outside workspace' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'outside workspace prompt' }] } })
  ].join('\n'), 'utf8');
  const parseSessionEntries = (rawText) => rawText.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const registered = new Map();
  const notifications = [];
  const pickerSnapshots = [];
  const spawns = [];
  const { default: registerExtension } = loadModule({
    piAgent: {
      getAgentDir: () => agentDir,
      parseSessionEntries,
      SessionManager: {
        listAll: async () => {
          throw new Error('lightweight HTML picker should not call SessionManager.listAll');
        },
        list: async () => {
          throw new Error('lightweight HTML picker should not call SessionManager.list');
        }
      }
    },
    childProcess: {
      spawn(command, args) {
        spawns.push({ command, args });
        return { unref() {} };
      }
    }
  });
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  const ctx = {
    hasUI: true,
    cwd,
    sessionManager: { getSessionFile: () => null },
    ui: {
      custom(factory) {
        const picker = factory(createFakeTui(), createFakeTheme(), null, () => {});
        pickerSnapshots.push({
          title: picker.title.text,
          values: picker.items.map((item) => item.value),
          labels: picker.items.map((item) => item.label),
          descriptions: picker.items.map((item) => item.description)
        });
        const choice = pickerSnapshots.length === 1 ? secondPath : outsidePath;
        return Promise.resolve(choice);
      },
      notify(message, level) {
        notifications.push({ message, level });
      }
    }
  };

  await registered.get('session-history-html').handler('cwd', ctx);
  await registered.get('session-history-html').handler('pick', ctx);

  assert.equal(pickerSnapshots.length, 2);
  assert.match(pickerSnapshots[0].title, /Choose a conversation \(2\)/);
  assert.deepEqual(new Set(pickerSnapshots[0].values), new Set([secondPath, firstPath]));
  assert.ok(pickerSnapshots[0].descriptions.every((text) => /message|prompt|summary/i.test(text)));
  assert.equal(pickerSnapshots[0].values.includes(outsidePath), false);
  assert.deepEqual(new Set(pickerSnapshots[1].values), new Set([outsidePath, secondPath, firstPath]));
  assert.match(pickerSnapshots[1].title, /Choose a conversation \(3\)/);
  assert.equal(spawns.length, 2);
  assert.deepEqual(notifications.map((entry) => entry.level), ['info', 'info']);
  for (const spawnCall of spawns) fs.rmSync(spawnCall.args[0], { force: true });
  fs.rmSync(agentDir, { recursive: true, force: true });
});

test('HTML command uses the correct platform opener on macOS, Linux, and Windows', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-platform-'));
  const sessionPath = path.join(tempDir, 'current.jsonl');
  fs.writeFileSync(sessionPath, '{"type":"message"}', 'utf8');
  const parsedEntries = [
    { type: 'message', id: 'u1', parentId: null, timestamp: '2026-04-07T10:00:01.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Hi' }] } }
  ];
  const originalPlatform = process.platform;
  const cases = [
    ['darwin', 'open'],
    ['linux', 'xdg-open'],
    ['win32', 'cmd']
  ];

  try {
    for (const [platform, expectedCommand] of cases) {
      const spawns = [];
      const registered = new Map();
      Object.defineProperty(process, 'platform', { value: platform, configurable: true });
      const { default: registerExtension } = loadModule({
        piAgent: {
          parseSessionEntries: () => parsedEntries
        },
        childProcess: {
          spawn(command, args) {
            spawns.push({ command, args });
            return { unref() {} };
          }
        }
      });
      registerExtension({
        registerCommand(name, spec) {
          registered.set(name, spec);
        },
        sendMessage() {}
      });
      await registered.get('session-history-html').handler('current', {
        hasUI: true,
        cwd: tempDir,
        sessionManager: { getSessionFile: () => sessionPath },
        ui: { notify() {} }
      });
      assert.equal(spawns[0].command, expectedCommand);
      if (platform === 'win32') assert.deepEqual(spawns[0].args.slice(0, 3), ['/c', 'start', '']);
      fs.rmSync(spawns[0].args.at(-1), { force: true });
    }
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('large sessions still generate and boot the HTML viewer without fatal errors', async () => {
  const entries = [];
  let parentId = null;
  for (let index = 0; index < 220; index += 1) {
    const userId = `u${index}`;
    const assistantId = `a${index}`;
    entries.push({
      type: 'message',
      id: userId,
      parentId,
      timestamp: `2026-04-07T10:${String(Math.floor(index / 6)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
      message: { role: 'user', content: [{ type: 'text', text: `User question ${index}` }] }
    });
    entries.push({
      type: 'message',
      id: assistantId,
      parentId: userId,
      timestamp: `2026-04-07T10:${String(Math.floor(index / 6)).padStart(2, '0')}:${String((index + 1) % 60).padStart(2, '0')}.000Z`,
      message: { role: 'assistant', content: [{ type: 'text', text: `Assistant response ${index}` }] }
    });
    parentId = assistantId;
  }
  const largeSession = {
    id: 'large-session',
    path: '/tmp/large-session.jsonl',
    cwd: '/tmp',
    created: '2026-04-07T10:00:00.000Z',
    modified: '2026-04-07T12:00:00.000Z',
    messageCount: entries.length,
    firstMessage: 'User question 0',
    sessionName: 'Large smoke test',
    entries,
    branchEntries: entries,
    rawText: '',
    rawLineCount: entries.length + 1
  };

  const { html, document, window } = await bootViewer({ session: largeSession });
  assert.ok(html.length > 10000);
  assert.equal(document.body.textContent.includes('Conversation viewer error'), false);
  assert.ok(document.querySelectorAll('#entryList [data-id]').length > 100);
  assert.ok(document.getElementById('detailCard').textContent.includes('Assistant response 219'));
  window.close();
});

function createFakeTheme() {
  return {
    fg(_name, text) { return String(text); },
    bold(text) { return String(text); }
  };
}

function createFakeTui() {
  return {
    terminal: { rows: 24, columns: 80 },
    renderRequests: 0,
    requestRender() {
      this.renderRequests += 1;
    }
  };
}

test('session picker filters items, updates preview text, and supports submit and cancel', async () => {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-picker-'));
  const cwd = '/Users/example/picker-project';
  const sessionDirName = '--Users-example-picker-project--';
  const sessionsDir = path.join(agentDir, 'sessions', sessionDirName);
  fs.mkdirSync(sessionsDir, { recursive: true });
  const alphaPath = path.join(sessionsDir, 'alpha.jsonl');
  const betaPath = path.join(sessionsDir, 'beta.jsonl');
  fs.writeFileSync(alphaPath, [
    JSON.stringify({ type: 'session', id: 'alpha', cwd, timestamp: '2026-04-07T09:00:00.000Z' }),
    JSON.stringify({ type: 'session_info', name: 'Alpha session' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'first alpha prompt' }] } })
  ].join('\n'), 'utf8');
  fs.writeFileSync(betaPath, [
    JSON.stringify({ type: 'session', id: 'beta', cwd, timestamp: '2026-04-07T10:00:00.000Z' }),
    JSON.stringify({ type: 'session_info', name: 'Beta session' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'second beta prompt' }] } }),
    JSON.stringify({ type: 'compaction', summary: 'beta summary text' })
  ].join('\n'), 'utf8');
  const parseSessionEntries = (rawText) => rawText.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const registered = new Map();
  let picker = null;
  let initialPreview = '';
  let resolvedValue = undefined;
  const { default: registerExtension } = loadModule({
    piAgent: {
      getAgentDir: () => agentDir,
      parseSessionEntries,
      SessionManager: {
        listAll: async () => [],
        list: async () => []
      }
    }
  });
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  await registered.get('session-history-html').handler('pick', {
    hasUI: true,
    cwd,
    sessionManager: { getSessionFile: () => null },
    ui: {
      custom(factory) {
        picker = factory(createFakeTui(), createFakeTheme(), null, (value) => {
          resolvedValue = value;
        });
        initialPreview = picker.previewLine.text;
        picker.handleInput('a');
        picker.handleInput('l');
        picker.handleInput('p');
        picker.handleInput('h');
        picker.handleInput('a');
        picker.handleInput('enter');
        return Promise.resolve(resolvedValue);
      },
      notify() {}
    }
  });

  assert.ok(picker, 'expected picker component');
  assert.match(initialPreview, /1 message|2 messages/);
  assert.match(initialPreview, /Alpha session|Beta session|first alpha prompt|second beta prompt/);
  assert.doesNotMatch(initialPreview, /beta summary text/);
  assert.match(picker.previewLine.text, /1 message/);
  assert.match(picker.previewLine.text, /Alpha session|first alpha prompt/);
  const renderedPicker = picker.render(120);
  const listLineIndex = renderedPicker.findIndex((line) => line.includes('Alpha session') || line.includes('Beta session'));
  const previewLineIndex = renderedPicker.findIndex((line) => line.includes('Selected:'));
  assert.ok(listLineIndex >= 0, 'expected picker list row in rendered output');
  assert.ok(previewLineIndex > listLineIndex, 'expected selected preview to render below the session list');
  assert.equal(resolvedValue, alphaPath);

  let cancelValue = 'not-cancelled';
  await registered.get('session-history-html').handler('pick', {
    hasUI: true,
    cwd,
    sessionManager: { getSessionFile: () => null },
    ui: {
      custom(factory) {
        const secondPicker = factory(createFakeTui(), createFakeTheme(), null, (value) => {
          cancelValue = value;
        });
        secondPicker.handleInput('escape');
        return Promise.resolve(cancelValue);
      },
      notify() {}
    }
  });
  assert.equal(cancelValue, null);

  fs.rmSync(agentDir, { recursive: true, force: true });
});

test('session picker prefers the first user prompt over verbose technical summaries', async () => {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-picker-summary-'));
  const cwd = '/Users/example/picker-summary-project';
  const sessionDirName = '--Users-example-picker-summary-project--';
  const sessionsDir = path.join(agentDir, 'sessions', sessionDirName);
  fs.mkdirSync(sessionsDir, { recursive: true });
  const sessionPath = path.join(sessionsDir, 'verbose.jsonl');
  fs.writeFileSync(sessionPath, [
    JSON.stringify({ type: 'session', id: 'verbose', cwd, timestamp: '2026-04-07T10:00:00.000Z' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Please help me fix the session picker preview.' }] } }),
    JSON.stringify({ type: 'compaction', summary: '## Goal - Improve /session-history-html load time. - Do not cheat on benchmarks. - Keep the picker non-technical and user-friendly.' })
  ].join('\n'), 'utf8');

  let picker = null;
  const { default: registerExtension } = loadModule({
    piAgent: {
      getAgentDir: () => agentDir,
      parseSessionEntries: (rawText) => rawText.split('\n').filter(Boolean).map((line) => JSON.parse(line)),
      SessionManager: {
        listAll: async () => [],
        list: async () => []
      }
    }
  });
  const registered = new Map();
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  await registered.get('session-history-html').handler('pick', {
    hasUI: true,
    cwd,
    sessionManager: { getSessionFile: () => null },
    ui: {
      custom(factory) {
        picker = factory(createFakeTui(), createFakeTheme(), null, () => {});
        return Promise.resolve(null);
      },
      notify() {}
    }
  });

  assert.ok(picker, 'expected picker component');
  const selectedItem = picker.selectList.getSelectedItem();
  assert.match(selectedItem.description, /Please help me fix the session picker preview/);
  assert.doesNotMatch(selectedItem.description, /Do not cheat on benchmarks/);
  assert.match(selectedItem.previewText, /Please help me fix the session picker preview/);
  assert.doesNotMatch(selectedItem.previewText, /Do not cheat on benchmarks/);

  fs.rmSync(agentDir, { recursive: true, force: true });
});

test('session picker message counts only top-level message entries', async () => {
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-session-history-picker-count-'));
  const cwd = '/Users/example/picker-count-project';
  const sessionDirName = '--Users-example-picker-count-project--';
  const sessionsDir = path.join(agentDir, 'sessions', sessionDirName);
  fs.mkdirSync(sessionsDir, { recursive: true });
  const sessionPath = path.join(sessionsDir, 'count.jsonl');
  fs.writeFileSync(sessionPath, [
    JSON.stringify({ type: 'session', id: 'count', cwd, timestamp: '2026-04-07T10:00:00.000Z' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'Please inspect this literal: {"type":"message","fake":true}' }] } }),
    JSON.stringify({ type: 'custom', data: { note: 'Another embedded snippet: {"type":"message"}' } }),
    JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } })
  ].join('\n'), 'utf8');

  let picker = null;
  const { default: registerExtension } = loadModule({
    piAgent: {
      getAgentDir: () => agentDir,
      parseSessionEntries: (rawText) => rawText.split('\n').filter(Boolean).map((line) => JSON.parse(line)),
      SessionManager: {
        listAll: async () => [],
        list: async () => []
      }
    }
  });
  const registered = new Map();
  registerExtension({
    registerCommand(name, spec) {
      registered.set(name, spec);
    },
    sendMessage() {}
  });

  await registered.get('session-history-html').handler('pick', {
    hasUI: true,
    cwd,
    sessionManager: { getSessionFile: () => null },
    ui: {
      custom(factory) {
        picker = factory(createFakeTui(), createFakeTheme(), null, () => {});
        return Promise.resolve(null);
      },
      notify() {}
    }
  });

  assert.ok(picker, 'expected picker component');
  const selectedItem = picker.selectList.getSelectedItem();
  assert.match(selectedItem.description, /2 messages/);
  assert.match(selectedItem.previewText, /2 messages/);

  fs.rmSync(agentDir, { recursive: true, force: true });
});
