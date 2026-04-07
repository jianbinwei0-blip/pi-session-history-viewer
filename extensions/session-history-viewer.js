var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// extensions/session-history-viewer.ts
var session_history_viewer_exports = {};
__export(session_history_viewer_exports, {
  __sessionHistoryBenchmarkHelpers: () => __sessionHistoryBenchmarkHelpers,
  default: () => sessionHistoryViewerExtension
});
module.exports = __toCommonJS(session_history_viewer_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var import_node_child_process = require("node:child_process");
var import_pi_coding_agent = require("@mariozechner/pi-coding-agent");
var import_pi_tui = require("@mariozechner/pi-tui");
var HTML_COMMAND_NAME = "session-history-html";
var HOME = import_node_os.homedir();
var DEFAULT_PICK_LIMIT = 500;
function shorten(text, max = 80) {
  if (!text) return "";
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= max) return single;
  return `${single.slice(0, Math.max(0, max - 1))}\u2026`;
}
function humanPath(input) {
  if (!input) return "(unknown)";
  if (input.startsWith(HOME)) return `~${input.slice(HOME.length)}`;
  return input;
}
function fmtDate(input) {
  if (!input) return "(unknown)";
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) return input;
  return date.toLocaleString();
}
function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2) ?? "null";
  } catch {
    return String(value);
  }
}
function indentBlock(text, prefix = "  ") {
  return text.split(/\r?\n/).map((line) => `${prefix}${line}`);
}
function pushSection(lines, title, value) {
  if (value === void 0) return;
  if (value === null) {
    lines.push(`${title}: null`);
    return;
  }
  const text = typeof value === "string" ? value : safeJson(value);
  const split = text.split(/\r?\n/);
  if (split.length === 1) {
    lines.push(`${title}: ${split[0]}`);
    return;
  }
  lines.push(`${title}:`);
  lines.push(...indentBlock(text));
}
function formatContent(content) {
  if (content === void 0) return ["(no content)"];
  if (content === null) return ["null"];
  if (typeof content === "string") return content.split(/\r?\n/);
  if (!Array.isArray(content)) return safeJson(content).split(/\r?\n/);
  const lines = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      lines.push(String(block));
      continue;
    }
    const candidate = block;
    switch (candidate.type) {
      case "text": {
        const text = typeof candidate.text === "string" ? candidate.text : safeJson(candidate.text);
        lines.push(...text.split(/\r?\n/));
        break;
      }
      case "thinking": {
        lines.push("[thinking]");
        const text = typeof candidate.thinking === "string" ? candidate.thinking : safeJson(candidate.thinking);
        lines.push(...indentBlock(text));
        break;
      }
      case "toolCall": {
        const name = typeof candidate.name === "string" ? candidate.name : "unknown";
        lines.push(`[toolCall] ${name}`);
        if (candidate.arguments !== void 0) {
          lines.push(...indentBlock(safeJson(candidate.arguments)));
        }
        break;
      }
      case "image": {
        const mimeType = typeof candidate.mimeType === "string" ? candidate.mimeType : "unknown";
        lines.push(`[image ${mimeType}]`);
        break;
      }
      default:
        lines.push(...safeJson(block).split(/\r?\n/));
    }
  }
  return lines.length > 0 ? lines : ["(empty)"];
}
function formatMessageEntry(entry) {
  const lines = [];
  const message = entry.message ?? {};
  const role = typeof message.role === "string" ? message.role : "unknown";
  lines.push(`role: ${role}`);
  if (role === "assistant") {
    if (message.provider || message.model) {
      lines.push(`model: ${message.provider ?? "?"}/${message.model ?? "?"}`);
    }
    if (message.stopReason) {
      lines.push(`stopReason: ${message.stopReason}`);
    }
    if (message.errorMessage) {
      lines.push(`errorMessage: ${message.errorMessage}`);
    }
  }
  if (role === "toolResult") {
    lines.push(`tool: ${message.toolName ?? "unknown"} (${message.toolCallId ?? "no-id"})`);
    lines.push(`isError: ${String(Boolean(message.isError))}`);
  }
  if (role === "bashExecution") {
    pushSection(lines, "command", message.command);
    lines.push(`exitCode: ${message.exitCode ?? "(none)"}`);
    lines.push(`cancelled: ${String(Boolean(message.cancelled))}`);
    lines.push(`truncated: ${String(Boolean(message.truncated))}`);
    if (message.fullOutputPath) lines.push(`fullOutputPath: ${message.fullOutputPath}`);
    pushSection(lines, "output", message.output);
    return lines;
  }
  if (role === "branchSummary") {
    if (message.fromId) lines.push(`fromId: ${message.fromId}`);
    pushSection(lines, "summary", message.summary);
    return lines;
  }
  if (role === "compactionSummary") {
    if (message.tokensBefore !== void 0) lines.push(`tokensBefore: ${message.tokensBefore}`);
    pushSection(lines, "summary", message.summary);
    return lines;
  }
  lines.push("content:");
  lines.push(...indentBlock(formatContent(message.content).join("\n")));
  if (message.details !== void 0) {
    pushSection(lines, "details", message.details);
  }
  if (message.usage !== void 0) {
    pushSection(lines, "usage", message.usage);
  }
  return lines;
}
function formatGenericEntry(entry) {
  const type = typeof entry.type === "string" ? entry.type : "unknown";
  if (type === "message") {
    return formatMessageEntry(entry);
  }
  const lines = [];
  switch (type) {
    case "compaction":
      if (entry.firstKeptEntryId) lines.push(`firstKeptEntryId: ${entry.firstKeptEntryId}`);
      if (entry.tokensBefore !== void 0) lines.push(`tokensBefore: ${entry.tokensBefore}`);
      pushSection(lines, "summary", entry.summary);
      if (entry.details !== void 0) pushSection(lines, "details", entry.details);
      break;
    case "branch_summary":
      if (entry.fromId) lines.push(`fromId: ${entry.fromId}`);
      pushSection(lines, "summary", entry.summary);
      if (entry.details !== void 0) pushSection(lines, "details", entry.details);
      break;
    case "model_change":
      lines.push(`provider: ${entry.provider ?? "?"}`);
      lines.push(`modelId: ${entry.modelId ?? "?"}`);
      break;
    case "thinking_level_change":
      lines.push(`thinkingLevel: ${entry.thinkingLevel ?? "?"}`);
      break;
    case "custom":
      lines.push(`customType: ${entry.customType ?? "?"}`);
      if (entry.data !== void 0) pushSection(lines, "data", entry.data);
      break;
    case "custom_message":
      lines.push(`customType: ${entry.customType ?? "?"}`);
      lines.push(`display: ${String(Boolean(entry.display))}`);
      pushSection(lines, "content", entry.content);
      if (entry.details !== void 0) pushSection(lines, "details", entry.details);
      break;
    case "label":
      lines.push(`targetId: ${entry.targetId ?? "?"}`);
      lines.push(`label: ${entry.label ?? "(cleared)"}`);
      break;
    case "session_info":
      lines.push(`name: ${entry.name ?? "(none)"}`);
      break;
    default:
      lines.push(...safeJson(entry).split(/\r?\n/));
  }
  return lines.length > 0 ? lines : ["(no details)"];
}
function normalizeArg(input) {
  return input.trim().toLowerCase();
}
function sortSessions(sessions) {
  return [...sessions].sort((left, right) => {
    const leftTime = new Date(left.modified ?? left.created ?? 0).getTime();
    const rightTime = new Date(right.modified ?? right.created ?? 0).getTime();
    return rightTime - leftTime;
  });
}
function cleanPromptForPicker(text) {
  return String(text || "").replace(/@[A-Za-z]@/g, "").replace(/\s+/g, " ").trim();
}
function sentenceCase(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function compactTopic(text) {
  return cleanPromptForPicker(text).replace(/[.?!:;,]+$/g, "").replace(/\s*\/\s*/g, "/").trim();
}
function deriveSessionTitle(summary) {
  const named = shorten(summary.name || "", 70);
  if (named) return named;
  const prompt = compactTopic(summary.firstMessage || "");
  if (prompt) {
    let match = prompt.match(/^organi[sz]e (?:my )?(.*?)(?:\s+(?:folder|directory))?$/i);
    if (match) {
      const target = compactTopic(match[1]).replace(/\/+$/g, "");
      if (/^downloads?$/i.test(target)) return "Downloads cleanup";
      return `${sentenceCase(target)} cleanup`;
    }
    match = prompt.match(/^(?:research|look into|investigate|find out about|learn about|tell me about|explain|what is|what are|why is|why are|why does|compare)\s+(.+)$/i);
    if (match) {
      return `Research about ${compactTopic(match[1])}`;
    }
    match = prompt.match(/^(?:how do i|how to)\s+(.+)$/i);
    if (match) {
      return `How to ${compactTopic(match[1])}`;
    }
    match = prompt.match(/^(?:fix|debug|improve|optimi[sz]e|clean up)\s+(.+)$/i);
    if (match) {
      return sentenceCase(match[0]);
    }
    return sentenceCase(shorten(prompt, 70));
  }
  const place = import_node_path.basename(summary.cwd || "") || "this workspace";
  return `Notes from ${place}`;
}
function buildSessionItem(summary) {
  const place = import_node_path.basename(summary.cwd || "") || "this workspace";
  const title = deriveSessionTitle(summary);
  const when = fmtDate(summary.modified ?? summary.created);
  const fullSummary = cleanPromptForPicker(summary.summary || "");
  const fullPrompt = cleanPromptForPicker(summary.firstMessage || "");
  const summaryPreview = shorten(fullSummary, 110);
  const promptPreview = shorten(fullPrompt, 110);
  const fallbackDescription = `In ${place}`;
  const hasExplicitName = Boolean(String(summary.name || "").trim());
  const countLabel = Number.isFinite(summary.messageCount) ? `${summary.messageCount} message${summary.messageCount === 1 ? "" : "s"}` : "";
  const baseDescription = promptPreview || summaryPreview || fallbackDescription;
  const description = [countLabel, baseDescription].filter(Boolean).join(" • ");
  const previewText = [countLabel, fullPrompt || fullSummary || fallbackDescription].filter(Boolean).join(" • ");
  return {
    value: summary.path,
    label: hasExplicitName ? `${when} • ${title}` : when,
    description,
    previewText,
    searchText: [
      summary.id,
      summary.path,
      summary.cwd,
      place,
      summary.name,
      summary.summary,
      summary.firstMessage,
      title,
      when,
      fallbackDescription
    ].filter(Boolean).join("\n").toLowerCase()
  };
}
var SessionPickerComponent = class {
  constructor(tui, items, choose, theme, titleText) {
    this.tui = tui;
    this.items = items;
    this.choose = choose;
    this.theme = theme;
    this.title = new import_pi_tui.Text(this.theme.fg("accent", this.theme.bold(titleText)));
    this.filterLabel = new import_pi_tui.Text(this.theme.fg("muted", "Filter:"));
    this.previewLine = new import_pi_tui.Text("");
    this.helpLine = new import_pi_tui.Text("");
    this.filterInput.onSubmit = () => {
      const selected = this.selectList.getSelectedItem();
      this.choose(selected ? selected.value : null);
    };
    this.filterInput.onEscape = () => this.choose(null);
    this.selectList = this.createSelectList(this.items);
    this.listProxy = {
      render: (width) => this.selectList.render(width),
      invalidate: () => this.selectList.invalidate(),
      handleInput: (data) => this.selectList.handleInput(data)
    };
    this.container.addChild(new import_pi_coding_agent.DynamicBorder((s) => this.theme.fg("accent", s)));
    this.container.addChild(this.title);
    this.container.addChild(this.filterLabel);
    this.container.addChild(this.filterInput);
    this.container.addChild(this.listProxy);
    this.container.addChild(this.previewLine);
    this.container.addChild(this.helpLine);
    this.container.addChild(new import_pi_coding_agent.DynamicBorder((s) => this.theme.fg("accent", s)));
    this.refreshText();
  }
  tui;
  items;
  choose;
  theme;
  container = new import_pi_tui.Container();
  title;
  filterLabel;
  filterInput = new import_pi_tui.Input();
  previewLine;
  helpLine;
  selectList;
  listProxy;
  filter = "";
  _focused = false;
  get focused() {
    return this._focused;
  }
  set focused(value) {
    this._focused = value;
    this.filterInput.focused = value;
  }
  invalidate() {
    this.container.invalidate();
    this.refreshText();
  }
  handleInput(data) {
    if ((0, import_pi_tui.matchesKey)(data, import_pi_tui.Key.up) || (0, import_pi_tui.matchesKey)(data, import_pi_tui.Key.down) || (0, import_pi_tui.matchesKey)(data, import_pi_tui.Key.pageUp) || (0, import_pi_tui.matchesKey)(data, import_pi_tui.Key.pageDown)) {
      this.selectList.handleInput(data);
      this.refreshText();
      this.tui.requestRender();
      return;
    }
    if ((0, import_pi_tui.matchesKey)(data, import_pi_tui.Key.escape)) {
      this.choose(null);
      return;
    }
    const before = this.filterInput.getValue();
    this.filterInput.handleInput(data);
    const after = this.filterInput.getValue();
    if (after !== before) {
      this.filter = after;
      this.selectList = this.createSelectList(this.filterItems(this.filter));
      this.refreshText();
      this.tui.requestRender();
      return;
    }
    this.refreshText();
    this.tui.requestRender();
  }
  render(width) {
    return this.container.render(width).map((line) => (0, import_pi_tui.truncateToWidth)(line, width));
  }
  filterItems(filter) {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) return this.items;
    return this.items.filter((item) => item.searchText.includes(normalized));
  }
  createSelectList(items) {
    const selectList = new import_pi_tui.SelectList(items, Math.min(Math.max(items.length, 8), 18), {
      selectedPrefix: (text) => this.theme.fg("accent", text),
      selectedText: (text) => this.theme.fg("accent", text),
      description: (text) => this.theme.fg("muted", text),
      scrollInfo: (text) => this.theme.fg("dim", text),
      noMatch: (text) => this.theme.fg("warning", text)
    });
    selectList.onSelect = (item) => this.choose(item.value);
    selectList.onCancel = () => this.choose(null);
    selectList.onSelectionChange = () => {
      this.refreshText();
      this.tui.requestRender();
    };
    return selectList;
  }
  refreshText() {
    const current = this.selectList.getSelectedItem();
    this.previewLine.setText(
      current ? this.theme.fg("dim", `Selected: ${current.label} \u2022 ${current.previewText ?? current.description ?? ""}`) : this.theme.fg("warning", "Selected: no matching session")
    );
    this.helpLine.setText(
      this.theme.fg("dim", "Search conversations \u2022 \u2191/\u2193 or PgUp/PgDn move \u2022 Enter open \u2022 Esc cancel")
    );
  }
};
async function pickSession(ctx, sessions) {
  const limited = sortSessions(sessions).slice(0, DEFAULT_PICK_LIMIT);
  if (limited.length === 0) return void 0;
  const items = limited.map(buildSessionItem);
  const pickedPath = await ctx.ui.custom(
    (tui, theme, _kb, done) => new SessionPickerComponent(
      tui,
      items,
      (value) => done(value),
      theme,
      `Choose a conversation (${limited.length}${sessions.length > limited.length ? ` of ${sessions.length}` : ""})`
    )
  );
  if (!pickedPath) return void 0;
  return limited.find((session) => session.path === pickedPath);
}
function resolveSessionFromArgs(args, ctx, allSessions) {
  const trimmed = args.trim();
  const normalized = normalizeArg(trimmed);
  if (!trimmed || normalized === "pick") return void 0;
  if (normalized === "current") {
    const sessionPath = ctx.sessionManager.getSessionFile();
    if (!sessionPath) return { path: "", id: "", cwd: ctx.cwd };
    return {
      path: sessionPath,
      id: import_node_path.basename(sessionPath).split("_").pop()?.replace(/\.jsonl$/, "") ?? sessionPath,
      cwd: ctx.cwd
    };
  }
  if (normalized === "here" || normalized === "cwd") {
    return void 0;
  }
  const explicitPath = trimmed.startsWith("~/") ? import_node_path.join(HOME, trimmed.slice(2)) : trimmed;
  if (explicitPath.endsWith(".jsonl") && import_node_fs.existsSync(explicitPath)) {
    return { path: explicitPath, id: import_node_path.basename(explicitPath), cwd: ctx.cwd };
  }
  const match = sortSessions(allSessions).find((session) => {
    const haystack = [
      session.id,
      session.path,
      session.cwd,
      session.name,
      session.firstMessage,
      session.allMessagesText
    ].filter(Boolean).join("\n").toLowerCase();
    return haystack.includes(normalized);
  });
  return match;
}
function getSessionsRootDir() {
  return import_node_path.join((0, import_pi_coding_agent.getAgentDir)(), "sessions");
}
function getSessionDirNameForCwd(cwd) {
  return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}
function extractSummaryTextForPicker(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry.type === "message") {
    const message = entry.message ?? {};
    if (message.role === "branchSummary" || message.role === "compactionSummary") {
      return typeof message.summary === "string" ? message.summary : typeof message.details === "string" ? message.details : "";
    }
    return "";
  }
  if (entry.type === "compaction" || entry.type === "branch_summary") {
    return typeof entry.summary === "string" ? entry.summary : typeof entry.details === "string" ? entry.details : "";
  }
  return "";
}
var PICKER_PREVIEW_MAX_BYTES = 512 * 1024;
var PICKER_MESSAGE_COUNT_OVERLAP = 32;
var PICKER_MESSAGE_LINE_RE = /(?:^|\n)\{"type":"message"(?=,|\})/g;
function countMessageEntriesInChunk(text, limit = text.length) {
  PICKER_MESSAGE_LINE_RE.lastIndex = 0;
  let count = 0;
  let match;
  while ((match = PICKER_MESSAGE_LINE_RE.exec(text)) && match.index < limit) {
    count += 1;
  }
  return count;
}
function updateLightPreviewFromLine(line, state) {
  const trimmed = line.trim();
  if (!trimmed) return;
  let entry;
  try {
    entry = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (!state.header && entry?.type === "session") {
    state.header = entry;
    return;
  }
  if (!state.name && entry?.type === "session_info") {
    state.name = entry.name?.trim() || void 0;
  }
  if (!state.firstMessage && entry?.type === "message" && entry.message?.role === "user") {
    const text = extractTextFromContent(entry.message.content);
    if (text) state.firstMessage = text;
  }
  if (!state.summary) {
    const text = extractSummaryTextForPicker(entry).trim();
    if (text) state.summary = text;
  }
}
function readSessionPreviewLite(sessionPath) {
  let fd;
  let previewBuffered = "";
  let previewBytes = 0;
  let countCarry = "";
  const state = { header: void 0, firstMessage: "", summary: "", name: void 0 };
  let messageCount = 0;
  try {
    fd = import_node_fs.openSync(sessionPath, "r");
    const chunkSize = 64 * 1024;
    let position = 0;
    while (true) {
      const buffer = Buffer.alloc(chunkSize);
      const bytesRead = import_node_fs.readSync(fd, buffer, 0, buffer.length, position);
      if (bytesRead <= 0) break;
      position += bytesRead;
      const chunkText = buffer.toString("utf8", 0, bytesRead);
      const countText = countCarry + chunkText;
      const safeCountLimit = Math.max(0, countText.length - PICKER_MESSAGE_COUNT_OVERLAP);
      messageCount += countMessageEntriesInChunk(countText, safeCountLimit);
      countCarry = countText.slice(safeCountLimit);
      if (previewBytes >= PICKER_PREVIEW_MAX_BYTES) {
        continue;
      }
      const remainingPreviewBytes = PICKER_PREVIEW_MAX_BYTES - previewBytes;
      const previewChunk = chunkText.slice(0, remainingPreviewBytes);
      previewBytes += previewChunk.length;
      previewBuffered += previewChunk;
      const lines = previewBuffered.split("\n");
      previewBuffered = lines.pop() ?? "";
      for (const rawLine of lines) {
        updateLightPreviewFromLine(rawLine, state);
      }
    }
    if (countCarry) {
      messageCount += countMessageEntriesInChunk(countCarry);
    }
    if (previewBuffered.trim()) {
      updateLightPreviewFromLine(previewBuffered, state);
    }
    return state.header ? { header: state.header, firstMessage: state.firstMessage, summary: state.summary, name: state.name, messageCount } : void 0;
  } catch {
    return void 0;
  } finally {
    if (fd !== void 0) {
      try {
        import_node_fs.closeSync(fd);
      } catch {
      }
    }
  }
}
function buildLightSessionSummary(sessionPath) {
  const preview = readSessionPreviewLite(sessionPath);
  if (!preview?.header) return void 0;
  let stats;
  try {
    stats = import_node_fs.statSync(sessionPath);
  } catch {
    return void 0;
  }
  const { header } = preview;
  return {
    path: sessionPath,
    id: typeof header.id === "string" ? header.id : import_node_path.basename(sessionPath, import_node_path.extname(sessionPath)),
    cwd: typeof header.cwd === "string" ? header.cwd : "",
    created: typeof header.timestamp === "string" ? new Date(header.timestamp) : stats.mtime,
    modified: stats.mtime,
    name: preview.name,
    summary: preview.summary,
    firstMessage: preview.firstMessage,
    messageCount: preview.messageCount
  };
}
function listLightSessionsFromDir(sessionDir) {
  if (!import_node_fs.existsSync(sessionDir)) return [];
  let entries;
  try {
    entries = import_node_fs.readdirSync(sessionDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const summary = buildLightSessionSummary(import_node_path.join(sessionDir, entry.name));
    if (summary) sessions.push(summary);
  }
  return sortSessions(sessions);
}
function listAllLightSessions() {
  const sessionsRoot = getSessionsRootDir();
  if (!import_node_fs.existsSync(sessionsRoot)) return [];
  let entries;
  try {
    entries = import_node_fs.readdirSync(sessionsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    sessions.push(...listLightSessionsFromDir(import_node_path.join(sessionsRoot, entry.name)));
  }
  return sortSessions(sessions);
}
function listLightSessionsForCwd(cwd) {
  return listLightSessionsFromDir(import_node_path.join(getSessionsRootDir(), getSessionDirNameForCwd(cwd)));
}
function countJsonlLines(rawText) {
  if (!rawText) return 0;
  let lines = 1;
  for (let index = 0; index < rawText.length; index++) {
    if (rawText.charCodeAt(index) === 10) lines += 1;
  }
  if (rawText.charCodeAt(rawText.length - 1) === 10) lines -= 1;
  return lines;
}
function getSessionNameFromEntries(entries) {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type === "session_info") {
      return entry.name?.trim() || void 0;
    }
  }
  return void 0;
}
function buildSessionEntryIndex(entries) {
  const byId = /* @__PURE__ */ new Map();
  let leafId = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    if (typeof entry.id === "string") {
      byId.set(entry.id, entry);
      leafId = entry.id;
    }
  }
  return { byId, leafId };
}
function buildSessionBranchEntries(byId, leafId) {
  const path = [];
  let current = leafId ? byId.get(leafId) : void 0;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : void 0;
  }
  return path;
}
function loadSession(sessionPath, fallbackSummary) {
  const rawText = import_node_fs.readFileSync(sessionPath, "utf8");
  const fileEntries = (0, import_pi_coding_agent.parseSessionEntries)(rawText);
  const header = fileEntries[0]?.type === "session" ? fileEntries[0] : fileEntries.find((entry) => entry?.type === "session");
  if (header && (header.version ?? 1) < import_pi_coding_agent.CURRENT_SESSION_VERSION) {
    (0, import_pi_coding_agent.migrateSessionEntries)(fileEntries);
  }
  const entries = fileEntries.filter((entry) => entry?.type !== "session");
  const { byId, leafId } = buildSessionEntryIndex(entries);
  const branchEntries = buildSessionBranchEntries(byId, leafId);
  const rawLineCount = header ? fileEntries.length : countJsonlLines(rawText);
  const fallbackId = fallbackSummary?.id ?? import_node_path.basename(sessionPath, import_node_path.extname(sessionPath));
  return {
    path: sessionPath,
    id: typeof header?.id === "string" ? header.id : fallbackId,
    cwd: typeof header?.cwd === "string" ? header.cwd : process.cwd(),
    created: (typeof header?.timestamp === "string" ? header.timestamp : void 0) ?? fallbackSummary?.created,
    modified: fallbackSummary?.modified,
    messageCount: fallbackSummary?.messageCount,
    firstMessage: fallbackSummary?.firstMessage,
    sessionName: getSessionNameFromEntries(entries),
    header,
    entries,
    branchEntries,
    rawText,
    rawLineCount
  };
}
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeHtmlText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
function escapeScriptRawText(text) {
  return text.search(/<\/script/i) === -1 ? text : text.replace(/<\/script/gi, "<\\/script");
}
function buildEntryText(entry) {
  return formatGenericEntry(entry).join("\n");
}
function firstMeaningfulPreviewLine(text) {
  const ignoredPrefixes = ["role:", "model:", "stopReason:", "errorMessage:", "usage:", "details:", "fromId:", "parentId:", "firstKeptEntryId:", "tokensBefore:", "provider:", "modelId:", "thinkingLevel:", "customType:", "display:", "targetId:", "label:", "data:", "content:"];
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).filter((line) => !["{", "}", "[", "]"].includes(line)).filter((line) => !ignoredPrefixes.some((prefix) => line.startsWith(prefix)));
  return lines[0] || "";
}
function toDisplayString(value) {
  if (value === void 0 || value === null) return "";
  if (typeof value === "string") return value.trim();
  return safeJson(value);
}
function preferredSummaryValue(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const candidateKeys = ["summary", "goal", "title", "message", "description", "name", "label", "action"];
  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}
function compactStructuredDisplay(value) {
  const direct = toDisplayString(value);
  if (!direct) return "";
  if (typeof value === "string") return direct;
  return preferredSummaryValue(value) || firstMeaningfulPreviewLine(direct) || direct;
}
function buildHtmlDisplayText(entry) {
  if (entry?.type === "message") {
    const message = entry.message ?? {};
    if (message.role === "user" || message.role === "assistant") {
      return extractDisplayTextFromContent(message.content) || toDisplayString(message.details) || "(empty)";
    }
    if (message.role === "toolResult") {
      return extractTextFromContent(message.content) || toDisplayString(message.details) || "(empty)";
    }
    if (message.role === "bashExecution") {
      return [message.command ? `$ ${message.command}` : "", toDisplayString(message.output)].filter(Boolean).join("\n\n") || "(empty)";
    }
    if (message.role === "branchSummary" || message.role === "compactionSummary") {
      return toDisplayString(message.summary) || "(empty)";
    }
    return extractTextFromContent(message.content) || toDisplayString(message.details) || "(empty)";
  }
  if (entry?.type === "compaction" || entry?.type === "branch_summary") {
    return toDisplayString(entry.summary) || toDisplayString(entry.details) || "(empty)";
  }
  if (entry?.type === "custom_message") {
    return compactStructuredDisplay(entry.content) || compactStructuredDisplay(entry.details) || "(empty)";
  }
  if (entry?.type === "custom") {
    return compactStructuredDisplay(entry.data) || "(empty)";
  }
  if (entry?.type === "label") {
    return `Label: ${entry.label ?? "(cleared)"}`;
  }
  if (entry?.type === "model_change") {
    return `Model changed to ${entry.provider ?? "?"}/${entry.modelId ?? "?"}`;
  }
  if (entry?.type === "thinking_level_change") {
    return `Thinking level: ${entry.thinkingLevel ?? "?"}`;
  }
  return buildEntryText(entry);
}
function buildHtmlPreviewText(entry) {
  const displayText = buildHtmlDisplayText(entry);
  if (entry?.type === "custom") {
    return preferredSummaryValue(entry.data) || firstMeaningfulPreviewLine(displayText) || "(empty)";
  }
  if (entry?.type === "custom_message") {
    return preferredSummaryValue(entry.content) || preferredSummaryValue(entry.details) || firstMeaningfulPreviewLine(displayText) || "(empty)";
  }
  return firstMeaningfulPreviewLine(displayText) || "(empty)";
}
function buildEntryRole(entry) {
  if (entry.type === "message") {
    return String(entry.message?.role ?? "message");
  }
  return String(entry.type ?? "entry");
}
function buildHtmlEntryTuples(entries) {
  const tuples = new Array(entries.length);
  const counts = {
    entries: entries.length,
    user: 0,
    assistant: 0,
    tools: 0,
    summaries: 0
  };
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const type = String(entry.type ?? "unknown");
    const role = buildEntryRole(entry);
    if (role === "user") counts.user += 1;
    if (role === "assistant") counts.assistant += 1;
    if (role === "toolResult" || role === "bashExecution") counts.tools += 1;
    if (["compaction", "branch_summary", "branchSummary", "compactionSummary"].includes(role) || ["compaction", "branch_summary"].includes(type)) {
      counts.summaries += 1;
    }
    tuples[index] = [
      index + 1,
      type,
      role,
      String(entry.id ?? ""),
      entry.parentId == null ? null : String(entry.parentId),
      fmtDate(entry.timestamp),
      buildHtmlDisplayText(entry),
      buildHtmlPreviewText(entry)
    ];
  }
  return { tuples, counts };
}
function extractTextFromContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const chunks = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const candidate = block;
    if (candidate.type === "text" && typeof candidate.text === "string") chunks.push(candidate.text);
  }
  return chunks.join("\n").trim();
}
function extractDisplayTextFromContent(content) {
  const text = extractTextFromContent(content);
  if (text) return text;
  if (!Array.isArray(content)) return "";
  const chunks = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const candidate = block;
    if (candidate.type === "toolCall" && typeof candidate.name === "string") {
      chunks.push(`[Tool call] ${candidate.name}`);
    }
  }
  return chunks.join("\n").trim();
}
function extractFirstUserPrompt(entries) {
  for (const entry of entries) {
    if (entry?.type === "message" && entry.message?.role === "user") {
      const text = extractTextFromContent(entry.message.content);
      if (text) return text;
    }
  }
  return "";
}
function extractObservedTools(entries) {
  const tools = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message ?? {};
    if (message.role === "toolResult" && typeof message.toolName === "string") tools.add(message.toolName);
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (!block || typeof block !== "object") continue;
        const candidate = block;
        if (candidate.type === "toolCall" && typeof candidate.name === "string") tools.add(candidate.name);
      }
    }
  }
  return Array.from(tools).sort((a, b) => a.localeCompare(b));
}
function extractObservedModels(entries) {
  const models = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (entry?.type === "message" && entry.message?.role === "assistant") {
      const provider = entry.message.provider;
      const model = entry.message.model;
      if (typeof provider === "string" && typeof model === "string") models.add(`${provider}/${model}`);
    }
    if (entry?.type === "model_change") {
      const provider = entry.provider;
      const modelId = entry.modelId;
      if (typeof provider === "string" && typeof modelId === "string") models.add(`${provider}/${modelId}`);
    }
  }
  return Array.from(models);
}
function serializeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function buildHistoryHtml(session) {
  const { tuples: allEntryTuples, counts: allCounts } = buildHtmlEntryTuples(session.entries);
  const branchEntryIds = session.branchEntries.map((entry) => String(entry.id ?? ""));
  const observedTools = extractObservedTools(session.entries);
  const observedModels = extractObservedModels(session.entries);
  const firstPrompt = extractFirstUserPrompt(session.entries);
  const counts = {
    all: allCounts,
    branch: { entries: branchEntryIds.length },
    raw: { entries: session.rawLineCount ?? countJsonlLines(session.rawText) }
  };
  const data = {
    session: {
      id: session.id,
      path: session.path,
      cwd: session.cwd,
      created: session.created ? fmtDate(session.created) : "",
      modified: session.modified ? fmtDate(session.modified) : "",
      name: session.sessionName ?? "",
      firstMessage: session.firstMessage ?? "",
      counts,
      observedTools,
      observedModels,
      firstPrompt
    },
    modes: {
      all: allEntryTuples,
      branchIds: branchEntryIds
    }
  };
  const sessionLabel = session.sessionName || shorten(session.firstMessage, 120) || session.id;
  const inlineData = serializeForInlineScript(data);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Session Preview \u2014 ${escapeHtml(sessionLabel)}</title>
<style>
:root {
  color-scheme: dark;
  --bg: #17181f;
  --sidebar: #1b1d24;
  --sidebar-2: #20232b;
  --panel: #20212a;
  --panel-soft: #2a2635;
  --panel-alt: #1f2128;
  --border: #3a3d46;
  --border-soft: #4a4e59;
  --text: #e7e8ec;
  --muted: #999ca7;
  --accent: #73d7ff;
  --accent-soft: rgba(115, 215, 255, 0.14);
  --user: #d8d99c;
  --assistant: #8fd0b9;
  --tool: #8ca0d7;
  --summary: #bb9af7;
  --selected: #252832;
  --code: #171920;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.app { height: 100vh; display: grid; grid-template-columns: 430px minmax(0, 1fr); }
.sidebar {
  border-right: 1px solid var(--border);
  background: linear-gradient(180deg, var(--sidebar), var(--sidebar-2));
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
}
.search-wrap { padding: 16px; border-bottom: 1px solid var(--border); }
.input-label {
  display: block;
  color: #f3f4f8;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}
.input-help {
  color: var(--muted);
  font-size: 12px;
  margin-top: 8px;
}
.search-wrap input {
  width: 100%; border: 1px solid var(--border-soft); border-radius: 10px; background: #171920;
  color: var(--text); padding: 12px 13px; font: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
}
.search-wrap input:focus {
  outline: none;
  border-color: rgba(115,215,255,0.55);
  box-shadow: 0 0 0 3px rgba(115,215,255,0.12);
}
.sidebar-section-title {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 12px 16px 0;
}
.topbar { display: flex; gap: 8px; flex-wrap: wrap; padding: 10px 16px 10px; }
.mode-btn {
  border: 1px solid var(--border-soft); background: rgba(255,255,255,0.03); color: var(--muted);
  border-radius: 999px; padding: 7px 12px; cursor: pointer; font-weight: 600;
}
.mode-btn.active { background: var(--accent-soft); border-color: rgba(115,215,255,0.5); color: #d7fbff; }
.chip-row { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 16px 14px; }
.chip {
  border: 1px solid var(--border-soft); border-radius: 999px; background: rgba(255,255,255,0.02);
  color: var(--muted); padding: 5px 11px; font-size: 12px; cursor: pointer; user-select: none; font-weight: 600;
}
.chip.active { background: rgba(168,224,255,0.18); border-color: #9fe2ff; color: #d8fbff; }
.entry-list { overflow: auto; padding: 8px 0; }
.entry-row { padding: 0 12px; }
.entry-button {
  width: 100%; text-align: left; border: 1px solid transparent; background: transparent; color: inherit;
  border-radius: 10px; padding: 8px 10px; cursor: pointer;
}
.entry-button:hover { background: rgba(255,255,255,0.03); }
.entry-button.selected-target:not(.active) {
  border-color: rgba(115,215,255,0.24);
  box-shadow: inset 0 0 0 1px rgba(115,215,255,0.08);
}
.entry-button.kind-user.active { background: linear-gradient(180deg, rgba(216,217,156,0.18), rgba(37,40,50,0.92)); border-color: rgba(216,217,156,0.35); }
.entry-button.kind-assistantFlow.active { background: linear-gradient(180deg, rgba(143,208,185,0.18), rgba(37,40,50,0.92)); border-color: rgba(143,208,185,0.35); }
.entry-button.kind-summary.active { background: linear-gradient(180deg, rgba(187,154,247,0.18), rgba(37,40,50,0.92)); border-color: rgba(187,154,247,0.35); }
.entry-button.kind-event.active { background: linear-gradient(180deg, rgba(140,160,215,0.18), rgba(37,40,50,0.92)); border-color: rgba(140,160,215,0.35); }
.entry-button.kind-user.selected-target:not(.active) { background: linear-gradient(180deg, rgba(216,217,156,0.08), rgba(37,40,50,0.78)); }
.entry-button.kind-assistantFlow.selected-target:not(.active) { background: linear-gradient(180deg, rgba(143,208,185,0.08), rgba(37,40,50,0.78)); }
.entry-button.kind-summary.selected-target:not(.active) { background: linear-gradient(180deg, rgba(187,154,247,0.08), rgba(37,40,50,0.78)); }
.entry-button.kind-event.selected-target:not(.active) { background: linear-gradient(180deg, rgba(140,160,215,0.08), rgba(37,40,50,0.78)); }
.entry-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry-line.primary { font-size: 13px; display: flex; align-items: center; gap: 10px; }
.entry-line.secondary { color: var(--muted); font-size: 12px; padding-left: 20px; }
.type-block {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 auto;
  background: rgba(255,255,255,0.24);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset;
}
.type-block.large {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}
.type-block.user { background: var(--user); border-radius: 3px; }
.type-block.assistant { background: var(--assistant); border-radius: 999px; }
.type-block.toolResult, .type-block.bashExecution { background: var(--tool); border-radius: 2px; transform: rotate(45deg); }
.type-block.compaction, .type-block.branch_summary, .type-block.branchSummary, .type-block.compactionSummary {
  background: var(--summary); width: 14px; border-radius: 999px;
}
.type-block.jsonl { background: #a0a7b6; border-radius: 999px; }
.type-block.message { background: #7f8ea3; }
.type-block.session, .type-block.model_change, .type-block.thinking_level_change, .type-block.custom {
  background: #6b7280; clip-path: polygon(50% 0%, 100% 100%, 0% 100%); border-radius: 0;
}
.sidebar-footer { color: var(--muted); font-size: 12px; padding: 12px 16px; border-top: 1px solid var(--border); }
.content { overflow-y: auto; overflow-x: hidden; padding: 18px 24px 32px; }
.content-inner { max-width: 980px; margin: 0 auto; }
.card {
  background: linear-gradient(180deg, rgba(40,43,53,0.88), rgba(31,33,40,0.96)); border: 1px solid rgba(255,255,255,0.04); border-radius: 16px;
  padding: 20px 22px; box-shadow: 0 18px 40px rgba(0,0,0,0.18); margin-bottom: 18px;
}
.card.soft { background: linear-gradient(180deg, rgba(50,42,65,0.94), rgba(38,34,50,0.98)); }
.card h2 { margin: 0 0 16px; color: #f2f3f7; font-size: 18px; letter-spacing: -0.01em; }
.session-id { color: var(--accent); font-weight: 800; font-size: 24px; margin-bottom: 10px; letter-spacing: -0.02em; }
.meta-grid { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; font-size: 13px; }
.meta-grid dt { color: var(--muted); font-weight: 600; }
.meta-grid dd { margin: 0; color: var(--text); }
.hint-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
  margin-bottom: 16px; color: #f0e37a; font-weight: 600;
}
.jsonl-badge { color: #dbe7ff; border: 1px solid #6174c6; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.pre-wrap { white-space: pre-wrap; word-break: break-word; }
.detail-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
.pill {
  display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 11px;
  font-weight: 700; letter-spacing: 0.02em; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #d6d8df;
}
pre {
  margin: 0; padding: 16px; background: var(--code); border: 1px solid var(--border); border-radius: 10px;
  color: #d9dde7; overflow-x: hidden; overflow-y: auto; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;
  font: 12.5px/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.detail-meta { color: var(--muted); font-size: 12px; }
.empty { border: 1px dashed var(--border-soft); border-radius: 12px; padding: 28px; color: var(--muted); text-align: center; }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
.tag { border: 1px solid var(--border-soft); border-radius: 999px; padding: 5px 10px; color: var(--text); background: rgba(255,255,255,0.03); font-size: 12px; }
.kbd { border: 1px solid var(--border-soft); border-bottom-width: 2px; border-radius: 6px; padding: 2px 6px; background: rgba(255,255,255,0.04); color: var(--text); font: 11px ui-monospace, monospace; }
.inline-list { display: flex; gap: 8px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin-top: 10px; }
.friendly-summary {
  margin: 14px 0 18px;
  padding: 16px 18px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(115,215,255,0.12), rgba(115,215,255,0.05));
  border: 1px solid rgba(115,215,255,0.18);
  color: #dff8ff;
  font-size: 14px;
  line-height: 1.55;
}
.legend-row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.legend-row.compact { margin-top: 10px; }
.legend-item { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.toggle-link {
  border: 1px solid var(--border-soft);
  background: rgba(255,255,255,0.03);
  color: var(--muted);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
.toggle-link:hover { color: var(--text); border-color: rgba(255,255,255,0.24); }
.transcript-shell { display: grid; gap: 16px; }
.transcript-group {
  display: grid;
  gap: 10px;
}
.transcript-group.user, .transcript-group.assistantFlow, .transcript-group.summary, .transcript-group.event { border-left: none; padding-left: 0; }
.transcript-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.transcript-group-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.transcript-group.collapsed .transcript-list { display: none; }
.transcript-group-title {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}
.transcript-list { display: grid; gap: 12px; align-items: start; }
.transcript-entry {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(23,25,32,0.58);
  padding: 14px 16px;
  max-width: 82%;
  scroll-margin-top: 120px;
}
.transcript-entry.user {
  margin-left: auto;
  border-radius: 18px 18px 8px 18px;
  background: linear-gradient(180deg, rgba(216,217,156,0.12), rgba(42,44,32,0.82));
}
.transcript-entry.assistantFlow {
  margin-right: auto;
  border-radius: 18px 18px 18px 8px;
  background: linear-gradient(180deg, rgba(143,208,185,0.12), rgba(27,39,36,0.86));
}
.transcript-entry.summary {
  margin: 0 auto;
  max-width: 90%;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(187,154,247,0.14), rgba(36,28,48,0.84));
}
.transcript-entry.event {
  margin: 0 auto;
  max-width: 90%;
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(140,160,215,0.10), rgba(25,29,40,0.82));
}
.transcript-entry.assistantFlow.toolish {
  background: linear-gradient(180deg, rgba(140,160,215,0.12), rgba(34, 37, 51, 0.88));
  margin-left: 28px;
  max-width: 74%;
  border-style: dashed;
}
.transcript-entry.active {
  border-color: rgba(115,215,255,0.7);
  box-shadow: 0 0 0 1px rgba(115,215,255,0.2) inset;
}
.transcript-entry.selected-target:not(.active) {
  border-color: rgba(115,215,255,0.28);
  box-shadow: 0 0 0 1px rgba(115,215,255,0.1) inset;
}
.transcript-entry-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.transcript-entry-header > div:first-child {
  min-width: 0;
  flex: 1 1 320px;
}
.transcript-entry-title {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
  overflow-wrap: anywhere;
}
.transcript-entry-meta {
  color: var(--muted);
  font-size: 12px;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.inline-list {
  min-width: 0;
}
.inline-list span {
  overflow-wrap: anywhere;
  word-break: break-word;
}
.transcript-entry-body pre { margin-top: 0; }
.technical-details {
  margin-top: 12px;
}
.technical-details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 10px;
}
.technical-details[open] summary {
  margin-bottom: 10px;
}
@media (max-width: 1100px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { grid-template-rows: auto auto 260px auto; border-right: none; border-bottom: 1px solid var(--border); }
  .transcript-entry, .transcript-entry.user, .transcript-entry.assistantFlow, .transcript-entry.summary, .transcript-entry.event, .transcript-entry.assistantFlow.toolish {
    max-width: 100%;
    margin-left: 0;
    margin-right: 0;
  }
}
</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <div class="search-wrap"><label class="input-label" for="search">Find a moment</label><input id="search" type="search" placeholder="Search this conversation..." autocomplete="off" /><div class="input-help">Search by words you remember from the conversation.</div></div>
    <div>
      <div class="sidebar-section-title">View</div>
      <div class="topbar" id="modeButtons"></div>
      <div class="sidebar-section-title">Focus on</div>
      <div class="chip-row" id="roleChips"></div>
    </div>
    <div class="entry-list" id="entryList"></div>
    <div class="sidebar-footer" id="sidebarFooter"></div>
  </aside>
  <main class="content">
    <div class="content-inner">
      <section class="card" id="sessionCard"></section>
      <section class="card" id="promptCard"></section>
      <section class="card" id="toolsCard"></section>
      <section class="card soft" id="detailCard"></section>
    </div>
  </main>
</div>
<script>
const data = ${inlineData};
const entryTupleFields = ['index', 'type', 'role', 'id', 'parentId', 'timestamp', 'displayText', 'previewText'];
function inflateEntry(tuple) {
  if (!Array.isArray(tuple)) return tuple;
  const entry = {};
  for (let index = 0; index < entryTupleFields.length; index += 1) {
    entry[entryTupleFields[index]] = tuple[index];
  }
  return entry;
}
data.modes.all = (data.modes.all || []).map(inflateEntry);
const allEntriesById = new Map((data.modes.all || []).map((entry) => [entry.id, entry]));
function getRawLinesArray() {
  if (Array.isArray(data.modes.rawLines)) return data.modes.rawLines;
  const text = data.modes.rawText || '';
  data.modes.rawLines = text ? text.split('\\n') : [];
  return data.modes.rawLines;
}
const modeButtonsEl = document.getElementById('modeButtons');
const roleChipsEl = document.getElementById('roleChips');
const searchEl = document.getElementById('search');
const entryListEl = document.getElementById('entryList');
const sessionCardEl = document.getElementById('sessionCard');
const promptCardEl = document.getElementById('promptCard');
const toolsCardEl = document.getElementById('toolsCard');
const detailCardEl = document.getElementById('detailCard');
const sidebarFooterEl = document.getElementById('sidebarFooter');
const contentEl = document.querySelector('.content');

function showFatalError(error) {
  const message = error && error.stack ? error.stack : String(error || 'Unknown viewer error');
  document.body.innerHTML = '<main style="padding:24px; color:#e7e8ec; background:#17181f; font:14px/1.5 ui-sans-serif,system-ui,sans-serif; min-height:100vh;">'
    + '<h1 style="margin:0 0 12px; font-size:18px;">Conversation viewer error</h1>'
    + '<p style="margin:0 0 16px; color:#999ca7;">The conversation viewer could not open correctly. Copy the details below if you want help troubleshooting it.</p>'
    + '<pre style="margin:0; padding:16px; background:#171920; border:1px solid #3a3d46; border-radius:10px; white-space:pre-wrap; word-break:break-word;">' + escapeHtml(message) + '</pre>'
    + '</main>';
}

const modeLabels = { all: '\u{1F4DC} All entries', branch: '\u2442 Current branch' };
const roleConfigs = [
  { key: 'main', label: 'Main conversation' },
  { key: 'all', label: 'Everything' },
  { key: 'user', label: 'You' },
  { key: 'assistant', label: 'Pi' },
  { key: 'tools', label: 'Tool activity' },
  { key: 'summaries', label: 'Summaries' },
  { key: 'events', label: 'Background' },
];
let currentMode = 'all';
let currentRole = 'main';
let selectedId = null;
let currentMomentId = null;
let currentMomentRaf = 0;
let legendExpanded = false;
let showAdvancedDetails = false;
let collapseAssistantGroups = false;
const collapsedAssistantGroupIndexes = new Set();
let hasRenderedInitialTranscript = false;
let transcriptRenderToken = 0;
let transcriptChunkRaf = 0;
const INITIAL_TRANSCRIPT_ENTRY_LIMIT = 80;
const TRANSCRIPT_CHUNK_ENTRY_LIMIT = 180;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function roleClass(role) { return String(role || 'entry').replace(/[^a-zA-Z0-9_-]/g, '_'); }
function entriesForMode() {
  if (currentMode === 'branch') return (data.modes.branchIds || []).map((id) => allEntriesById.get(id)).filter(Boolean);
  if (currentMode === 'raw') {
    if (Array.isArray(data.modes.raw)) return data.modes.raw;
    const lines = getRawLinesArray();
    data.modes.raw = lines.map((line, index) => ({
      index: index + 1,
      type: 'jsonl',
      role: 'jsonl',
      id: 'line-' + (index + 1),
      parentId: null,
      timestamp: '',
      rawLine: index + 1,
      text: line
    }));
    return data.modes.raw;
  }
  return data.modes[currentMode] || [];
}
function entryMatchesRole(entry) {
  if (currentMode === 'raw') return true;
  if (currentRole === 'all') return true;
  if (currentRole === 'main') return ['user', 'assistant', 'toolResult', 'bashExecution', 'compaction', 'branch_summary', 'branchSummary', 'compactionSummary'].includes(entry.role);
  if (currentRole === 'tools') return entry.role === 'toolResult' || entry.role === 'bashExecution';
  if (currentRole === 'summaries') return ['compaction','branch_summary','branchSummary','compactionSummary'].includes(entry.role) || ['compaction','branch_summary'].includes(entry.type);
  if (currentRole === 'events') return !['user', 'assistant', 'toolResult', 'bashExecution', 'compaction', 'branch_summary', 'branchSummary', 'compactionSummary'].includes(entry.role);
  return entry.role === currentRole;
}
function getEntrySearchText(entry) {
  if (typeof entry.searchText === 'string') return entry.searchText;
  entry.searchText = [
    String(entry.type || ''),
    String(entry.role || ''),
    String(entry.id || ''),
    String(entry.parentId || ''),
    String(entry.timestamp || ''),
    String(entryDisplayText(entry) || '')
  ].join('\\n').toLowerCase();
  return entry.searchText;
}
function filteredEntries() {
  const query = searchEl.value.trim().toLowerCase();
  return entriesForMode().filter((entry) => entryMatchesRole(entry) && (!query || getEntrySearchText(entry).includes(query)));
}
function renderEntries() {
  return entriesForMode();
}
function splitEntryText(text) {
  return String(text || '').replace(/\\r/g, '').split('\\n');
}
function extractSectionText(text, label) {
  const lines = splitEntryText(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === label + ':') {
      const collected = [];
      for (let next = index + 1; next < lines.length; next += 1) {
        const candidate = lines[next];
        if (!candidate.trim()) {
          collected.push('');
          continue;
        }
        if (!candidate.startsWith('  ')) break;
        collected.push(candidate.replace(/^  /, ''));
      }
      return collected.join('\\n').trim();
    }
    if (line.startsWith(label + ': ')) return line.slice(label.length + 2).trim();
  }
  return '';
}
function firstMeaningfulLine(text) {
  const ignoredPrefixes = ['role:', 'model:', 'stopReason:', 'errorMessage:', 'usage:', 'details:', 'fromId:', 'parentId:', 'firstKeptEntryId:', 'tokensBefore:', 'provider:', 'modelId:', 'thinkingLevel:', 'customType:', 'display:', 'targetId:', 'label:'];
  const lines = splitEntryText(text)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !ignoredPrefixes.some((prefix) => line.startsWith(prefix)));
  return lines[0] || '';
}
function entryRoleLabel(entry) {
  if (entry.role === 'user') return 'You';
  if (entry.role === 'assistant') return 'Pi';
  if (isToolishEntry(entry)) return 'Tool activity';
  if (isSummaryEntry(entry)) return 'Summary';
  if (entry.role === 'jsonl') return 'Raw data';
  return 'Background';
}
function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2) || 'null';
  } catch {
    return String(value);
  }
}
function toDisplayString(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  return safeJson(value);
}
function preferredSummaryValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const candidateKeys = ['summary', 'goal', 'title', 'message', 'description', 'name', 'label', 'action'];
  for (const key of candidateKeys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
}
function compactStructuredDisplay(value) {
  const direct = toDisplayString(value);
  if (!direct) return '';
  if (typeof value === 'string') return direct;
  return preferredSummaryValue(value) || firstMeaningfulLine(direct) || direct;
}
function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const chunks = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') chunks.push(block.text);
  }
  return chunks.join('\\n').trim();
}
function extractDisplayTextFromContent(content) {
  const text = extractTextFromContent(content);
  if (text) return text;
  if (!Array.isArray(content)) return '';
  const chunks = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'toolCall' && typeof block.name === 'string') chunks.push('[Tool call] ' + block.name);
  }
  return chunks.join('\\n').trim();
}
function getParsedRawEntry(entry) {
  if (Object.prototype.hasOwnProperty.call(entry, 'parsedRawEntry')) return entry.parsedRawEntry;
  const rawLineText = getRawLineText(entry);
  if (!rawLineText) {
    entry.parsedRawEntry = null;
    return entry.parsedRawEntry;
  }
  try {
    entry.parsedRawEntry = JSON.parse(rawLineText);
  } catch {
    entry.parsedRawEntry = null;
  }
  return entry.parsedRawEntry;
}
function buildDisplayTextFromParsedEntry(entry) {
  if (entry?.type === 'message') {
    const message = entry.message || {};
    if (message.role === 'user' || message.role === 'assistant') {
      return extractDisplayTextFromContent(message.content) || toDisplayString(message.details) || '(empty)';
    }
    if (message.role === 'toolResult') {
      return extractTextFromContent(message.content) || toDisplayString(message.details) || '(empty)';
    }
    if (message.role === 'bashExecution') {
      return [message.command ? '$ ' + message.command : '', toDisplayString(message.output)].filter(Boolean).join('\\n\\n') || '(empty)';
    }
    if (message.role === 'branchSummary' || message.role === 'compactionSummary') {
      return toDisplayString(message.summary) || '(empty)';
    }
    return extractTextFromContent(message.content) || toDisplayString(message.details) || '(empty)';
  }
  if (entry?.type === 'compaction' || entry?.type === 'branch_summary') {
    return toDisplayString(entry.summary) || toDisplayString(entry.details) || '(empty)';
  }
  if (entry?.type === 'custom_message') {
    return compactStructuredDisplay(entry.content) || compactStructuredDisplay(entry.details) || '(empty)';
  }
  if (entry?.type === 'custom') {
    return compactStructuredDisplay(entry.data) || '(empty)';
  }
  if (entry?.type === 'label') {
    return 'Label: ' + (entry.label || '(cleared)');
  }
  if (entry?.type === 'model_change') {
    return 'Model changed to ' + (entry.provider || '?') + '/' + (entry.modelId || '?');
  }
  if (entry?.type === 'thinking_level_change') {
    return 'Thinking level: ' + (entry.thinkingLevel || '?');
  }
  return '(empty)';
}
function entryDisplayText(entry) {
  if (entry.role === 'jsonl') return getRawLineText(entry);
  if (typeof entry.displayText === 'string') return entry.displayText;
  const parsed = getParsedRawEntry(entry);
  entry.displayText = buildDisplayTextFromParsedEntry(parsed);
  return entry.displayText;
}
function entryPreview(entry) {
  if (typeof entry.previewText === 'string' && entry.previewText.trim()) return entry.previewText.trim();
  const lines = splitEntryText(entryDisplayText(entry)).map((line) => line.trim()).filter(Boolean);
  return lines[0] || '(empty)';
}
function getRawLineText(entry) {
  const lineNumber = Number(entry && entry.rawLine || 0);
  if (lineNumber) {
    const lines = getRawLinesArray();
    return lines[lineNumber - 1] || '';
  }
  return typeof (entry && entry.text) === 'string' ? entry.text : '';
}
function entryAdvancedMeta(entry) {
  return [entry.timestamp || '', showAdvancedDetails && entry.id ? '#' + entry.id : '', showAdvancedDetails && entry.parentId ? 'parent=' + entry.parentId : ''].filter(Boolean).join(' \u2022 ');
}
function isSummaryEntry(entry) {
  return ['compaction','branch_summary','branchSummary','compactionSummary'].includes(entry.role) || ['compaction','branch_summary'].includes(entry.type);
}
function isToolishEntry(entry) {
  return entry.role === 'toolResult' || entry.role === 'bashExecution';
}
function groupKindForEntry(entry) {
  if (entry.role === 'user') return 'user';
  if (entry.role === 'assistant' || isToolishEntry(entry)) return 'assistantFlow';
  if (isSummaryEntry(entry)) return 'summary';
  return 'event';
}
function groupLabel(kind) {
  if (kind === 'user') return 'You asked';
  if (kind === 'assistantFlow') return 'Pi worked';
  if (kind === 'summary') return 'Short summaries';
  return 'Background events';
}
function groupHeadline(group) {
  if (group.kind === 'user') return 'Your message';
  if (group.kind === 'summary') return 'Quick recap';
  if (group.kind === 'event') return 'Background activity';
  const toolSteps = group.entries.filter((entry) => isToolishEntry(entry)).length;
  if (toolSteps > 0) return 'Pi answer with behind-the-scenes steps';
  return 'Pi answer';
}
function groupSubline(group) {
  if (group.kind === 'assistantFlow') {
    const toolSteps = group.entries.filter((entry) => isToolishEntry(entry)).length;
    if (toolSteps > 0) return toolSteps + ' behind-the-scenes ' + (toolSteps === 1 ? 'step' : 'steps');
    return 'Reply only';
  }
  if (group.kind === 'user') return 'What you said';
  if (group.kind === 'summary') return 'Short recap generated during the session';
  return 'Background information';
}
function renderLegend(compact) {
  const cls = compact ? 'legend-row compact' : 'legend-row';
  return '<div class="' + cls + '">' +
    '<span class="legend-item"><span class="type-block user"></span><span>You</span></span>' +
    '<span class="legend-item"><span class="type-block assistant"></span><span>Pi</span></span>' +
    '<span class="legend-item"><span class="type-block toolResult"></span><span>Tool activity</span></span>' +
    '<span class="legend-item"><span class="type-block compaction"></span><span>Summaries</span></span>' +
    '<span class="legend-item"><span class="type-block custom"></span><span>Background</span></span>' +
  '</div>';
}
function currentRoleLabel() {
  const match = roleConfigs.find((config) => config.key === currentRole);
  return match ? match.label : currentRole;
}
function conversationTopicSummary() {
  const seed = String(data.session.firstPrompt || data.session.firstMessage || '').trim();
  if (!seed) return 'This view highlights the main conversation between you and Pi.';
  const compact = seed.replace(/\s+/g, ' ').trim();
  const short = compact.length > 170 ? compact.slice(0, 167) + '\u2026' : compact;
  return 'This conversation is mostly about: ' + short;
}
function buildSnapshotHtml(entries) {
  const selected = selectedEntry(entries);
  const title = 'Conversation Snapshot \u2014 ' + (data.session.name || data.session.id);
  const snapshotModeLabels = { all: 'All entries', branch: 'Current branch', raw: 'Raw data' };
  const jumpListSummary = [];
  if (currentRole !== 'main') jumpListSummary.push(currentRoleLabel());
  if (searchEl.value.trim()) jumpListSummary.push('Search: ' + searchEl.value.trim());
  const subtitle = [snapshotModeLabels[currentMode], jumpListSummary.length ? 'Jump list filtered by ' + jumpListSummary.join(' \u2022 ') : ''].filter(Boolean).join(' \u2022 ');
  const body = entries.map((entry) => {
    const active = selected && entry.id === selected.id ? ' active' : '';
    const kind = groupKindForEntry(entry);
    const meta = [entryRoleLabel(entry), entry.timestamp || '', entry.id ? '#' + entry.id : '', entry.parentId ? 'parent=' + entry.parentId : ''].filter(Boolean).join(' \u2022 ');
    return '<article class="entry ' + kind + active + '">' +
      '<div class="entry-head"><span class="dot ' + kind + '"></span><span class="index">#' + escapeHtml(String(entry.index).padStart(4, '0')) + '</span><span class="meta">' + escapeHtml(meta) + '</span></div>' +
      '<pre>' + escapeHtml(entryDisplayText(entry)) + '</pre>' +
    '</article>';
  }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(title) + '</title><style>'
    + 'body{margin:0;background:#17181f;color:#e7e8ec;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;padding:24px;}main{max-width:980px;margin:0 auto;}h1{font-size:20px;margin:0 0 8px;color:#73d7ff;}p.meta{margin:0 0 20px;color:#999ca7;}section{display:grid;gap:14px;}article.entry{border:1px solid #3a3d46;border-radius:12px;padding:16px;background:rgba(23,25,32,0.7);}article.entry.user{background:linear-gradient(180deg, rgba(216,217,156,0.08), rgba(23,25,32,0.72));}article.entry.assistantFlow{background:linear-gradient(180deg, rgba(143,208,185,0.08), rgba(23,25,32,0.72));}article.entry.summary{background:linear-gradient(180deg, rgba(187,154,247,0.12), rgba(36,28,48,0.8));}article.entry.event{background:linear-gradient(180deg, rgba(140,160,215,0.08), rgba(23,25,32,0.72));}article.entry.active{border-color:rgba(115,215,255,0.7);box-shadow:0 0 0 1px rgba(115,215,255,0.2) inset;}div.entry-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;}span.dot{width:12px;height:12px;border-radius:999px;display:inline-block;}span.dot.user{background:#d8d99c;border-radius:3px;}span.dot.assistantFlow{background:#8fd0b9;}span.dot.summary{background:#bb9af7;width:14px;}span.dot.event{background:#8ca0d7;clip-path:polygon(50% 0%, 100% 100%, 0% 100%);border-radius:0;}span.index{font:11px ui-monospace,monospace;padding:2px 8px;border:1px solid rgba(255,255,255,0.15);border-radius:999px;color:#d6d8df;}span.meta{color:#999ca7;font-size:12px;}pre{margin:0;padding:16px;background:#171920;border:1px solid #3a3d46;border-radius:10px;color:#d9dde7;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;}</style></head><body><main><h1>' + escapeHtml(title) + '</h1><p class="meta">' + escapeHtml(subtitle) + '</p><section>' + body + '</section></main></body></html>';
}
function exportSnapshot(entries) {
  const html = buildSnapshotHtml(entries);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeId = String(data.session.id || 'session').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'session';
  a.href = url;
  a.download = 'pi-session-history-snapshot-' + safeId + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function buildTranscriptGroups(entries) {
  const groups = [];
  let current = null;
  entries.forEach((entry) => {
    const kind = groupKindForEntry(entry);
    const shouldStart = !current || current.kind !== kind || kind === 'user' || kind === 'summary';
    if (shouldStart) {
      current = { kind, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  });
  return groups;
}
function ensureSelection(entries) {
  const fromHash = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (fromHash && entries.some((entry) => entry.id === fromHash)) selectedId = fromHash;
  if (!entries.length) {
    selectedId = null;
    currentMomentId = null;
    return;
  }
  if (!selectedId || !entries.some((entry) => entry.id === selectedId)) selectedId = entries[0].id;
  if (!currentMomentId || !entries.some((entry) => entry.id === currentMomentId)) currentMomentId = selectedId;
}
function selectedEntry(entries) { return entries.find((entry) => entry.id === selectedId) || null; }
function currentMomentEntry(entries) { return entries.find((entry) => entry.id === currentMomentId) || selectedEntry(entries) || null; }
function setSelected(id, scrollSidebar, scrollTranscript) {
  selectedId = id;
  if (id) currentMomentId = id;
  const encoded = encodeURIComponent(id || '');
  if (encoded) history.replaceState(null, '', '#' + encoded);
  render(scrollTranscript);
  if (scrollSidebar) {
    const buttons = Array.from(entryListEl.querySelectorAll('[data-id]'));
    const row = buttons.find((button) => button.getAttribute('data-id') === id);
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' });
  }
}
function moveSelection(delta) {
  const entries = filteredEntries();
  if (!entries.length) return;
  ensureSelection(entries);
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedId));
  const nextIndex = Math.max(0, Math.min(entries.length - 1, currentIndex + delta));
  setSelected(entries[nextIndex].id, true, true);
}
function updateSidebarFooter(sidebarEntries, focusId) {
  if (!sidebarEntries.length) {
    sidebarFooterEl.textContent = '0 matching moments';
    return;
  }
  const currentIndex = focusId ? sidebarEntries.findIndex((entry) => entry.id === focusId) : -1;
  if (currentIndex >= 0) {
    sidebarFooterEl.textContent = (currentIndex + 1) + ' of ' + sidebarEntries.length + ' matching moments';
    return;
  }
  sidebarFooterEl.textContent = sidebarEntries.length + ' matching moments';
}
function updateTranscriptFocus(entries, sidebarEntries) {
  const focusEntry = currentMomentEntry(entries);
  const focusId = focusEntry ? focusEntry.id : null;
  detailCardEl.querySelectorAll('[data-transcript-id]').forEach((item) => {
    const itemId = item.getAttribute('data-transcript-id');
    item.classList.toggle('active', itemId === focusId);
    item.classList.toggle('selected-target', !!selectedId && itemId === selectedId && itemId !== focusId);
  });
  const sidebarButtons = Array.from(entryListEl.querySelectorAll('[data-id]'));
  let activeSidebarRow = null;
  sidebarButtons.forEach((button) => {
    const buttonId = button.getAttribute('data-id');
    const isActive = buttonId === focusId;
    button.classList.toggle('active', isActive);
    button.classList.toggle('selected-target', !!selectedId && buttonId === selectedId && buttonId !== focusId);
    if (isActive) activeSidebarRow = button;
  });
  updateSidebarFooter(sidebarEntries, focusId);
  if (activeSidebarRow && activeSidebarRow.scrollIntoView) activeSidebarRow.scrollIntoView({ block: 'nearest' });
}
function refreshCurrentMomentFromViewport() {
  const entries = renderEntries();
  const sidebarEntries = filteredEntries();
  if (!entries.length) {
    currentMomentId = null;
    updateTranscriptFocus(entries, sidebarEntries);
    return;
  }
  const items = Array.from(detailCardEl.querySelectorAll('[data-transcript-id]'));
  if (!items.length || !contentEl) {
    currentMomentId = selectedId;
    updateTranscriptFocus(entries, sidebarEntries);
    return;
  }
  const contentRect = contentEl.getBoundingClientRect();
  const visibleTop = contentRect.top + 12;
  const visibleBottom = contentRect.bottom - 12;
  let target = items.find((item) => {
    const rect = item.getBoundingClientRect();
    return rect.top >= visibleTop && rect.bottom <= visibleBottom;
  });
  if (!target) {
    target = items.find((item) => item.getBoundingClientRect().bottom > visibleTop) || items[items.length - 1];
  }
  currentMomentId = target ? target.getAttribute('data-transcript-id') : selectedId;
  updateTranscriptFocus(entries, sidebarEntries);
}
function scheduleCurrentMomentRefresh() {
  if (currentMomentRaf) cancelAnimationFrame(currentMomentRaf);
  currentMomentRaf = requestAnimationFrame(() => {
    currentMomentRaf = 0;
    refreshCurrentMomentFromViewport();
  });
}
function renderModeButtons() {
  modeButtonsEl.innerHTML = Object.keys(modeLabels).map((mode) => '<button class="mode-btn ' + (mode === currentMode ? 'active' : '') + '" data-mode="' + mode + '">' + modeLabels[mode] + '</button>').join('');
  modeButtonsEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      currentMode = button.getAttribute('data-mode');
      currentRole = 'main';
      collapsedAssistantGroupIndexes.clear();
      render(true);
    });
  });
}
function renderRoleChips(entries) {
  if (currentMode === 'raw') {
    roleChipsEl.innerHTML = '<div class="detail-meta">Raw mode shows every JSONL line. Use search to narrow it down.</div>';
    return;
  }
  roleChipsEl.innerHTML = roleConfigs.map((config) => '<button class="chip ' + (config.key === currentRole ? 'active' : '') + '" data-role="' + config.key + '">' + config.label + '</button>').join('');
  roleChipsEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      currentRole = button.getAttribute('data-role');
      render(false);
    });
  });
}
function renderSessionCard(entries) {
  const counts = data.session.counts;
  const plainModeLabels = { all: 'All entries', branch: 'Current branch', raw: 'Raw data' };
  const conversationSummary = currentMode === 'all'
    ? counts.all.user + ' messages from you, ' + counts.all.assistant + ' replies from Pi, and ' + counts.all.tools + ' behind-the-scenes steps'
    : entries.length + ' items in this view';
  sessionCardEl.innerHTML = '' +
    '<div class="session-id">Conversation overview</div>' +
    '<div class="friendly-summary">' + escapeHtml(conversationTopicSummary()) + '</div>' +
    '<div class="hint-row"><div>Pick a moment on the left and the conversation on the right will jump there.</div><div class="jsonl-badge">' + escapeHtml(plainModeLabels[currentMode]) + '</div></div>' +
    '<dl class="meta-grid">' +
      '<dt>Started:</dt><dd>' + escapeHtml(data.session.created || '(unknown)') + '</dd>' +
      '<dt>Last updated:</dt><dd>' + escapeHtml(data.session.modified || '(unknown)') + '</dd>' +
      '<dt>What you are seeing:</dt><dd>' + escapeHtml(conversationSummary) + '</dd>' +
      '<dt>Visible right now:</dt><dd>' + escapeHtml(String(entries.length)) + ' items</dd>' +
    '</dl>' +
    '<div class="inline-list">'
      + '<button class="toggle-link" id="legendToggle">' + (legendExpanded ? 'Hide color guide' : 'Show color guide') + '</button>'
      + '<button class="toggle-link" id="advancedToggle">' + (showAdvancedDetails ? 'Hide technical details' : 'Show technical details') + '</button>'
      + '<button class="toggle-link" id="assistantGroupsToggle">' + (collapseAssistantGroups ? 'Show all steps' : 'Hide most steps') + '</button>'
      + '<button class="toggle-link" id="exportSnapshotButton">Save this view</button>'
    + '</div>'
    + (legendExpanded ? renderLegend(false) : '')
    + (showAdvancedDetails
      ? '<dl class="meta-grid" style="margin-top:14px;">'
        + '<dt>Conversation ID:</dt><dd>' + escapeHtml(data.session.id) + '</dd>'
        + '<dt>Models:</dt><dd>' + escapeHtml((data.session.observedModels || []).join(', ') || '(none inferred)') + '</dd>'
        + '<dt>Total items:</dt><dd>' + escapeHtml(String(counts.all.entries)) + '</dd>'
        + '<dt>File path:</dt><dd class="pre-wrap">' + escapeHtml(data.session.path) + '</dd>'
      + '</dl>'
      : '');
  const legendToggleEl = document.getElementById('legendToggle');
  if (legendToggleEl) legendToggleEl.addEventListener('click', () => {
    legendExpanded = !legendExpanded;
    render(false);
  });
  const advancedToggleEl = document.getElementById('advancedToggle');
  if (advancedToggleEl) advancedToggleEl.addEventListener('click', () => {
    showAdvancedDetails = !showAdvancedDetails;
    render(false);
  });
  const assistantGroupsToggleEl = document.getElementById('assistantGroupsToggle');
  if (assistantGroupsToggleEl) assistantGroupsToggleEl.addEventListener('click', () => {
    collapseAssistantGroups = !collapseAssistantGroups;
    if (!collapseAssistantGroups) collapsedAssistantGroupIndexes.clear();
    render(false);
  });
  const exportSnapshotButtonEl = document.getElementById('exportSnapshotButton');
  if (exportSnapshotButtonEl) exportSnapshotButtonEl.addEventListener('click', () => {
    exportSnapshot(entries);
  });
}
function renderPromptCard() {
  if (!data.session.firstPrompt) {
    promptCardEl.style.display = 'none';
    promptCardEl.innerHTML = '';
    return;
  }
  promptCardEl.style.display = '';
  promptCardEl.innerHTML = '<h2>How this conversation started</h2><pre>' + escapeHtml(data.session.firstPrompt) + '</pre>';
}
function renderToolsCard() {
  const tools = data.session.observedTools || [];
  const models = data.session.observedModels || [];
  if (!showAdvancedDetails || (!tools.length && !models.length)) {
    toolsCardEl.style.display = 'none';
    toolsCardEl.innerHTML = '';
    return;
  }
  toolsCardEl.style.display = '';
  toolsCardEl.innerHTML = '<h2>Technical details</h2>' +
    '<div class="detail-meta" style="margin-bottom:12px;">This section is mostly helpful if you want the low-level details behind the conversation.</div>' +
    (tools.length ? '<div style="margin-bottom:12px;"><div class="detail-meta" style="margin-bottom:8px;">Tools Pi used</div><div class="tag-cloud">' + tools.map((tool) => '<span class="tag">' + escapeHtml(tool) + '</span>').join('') + '</div></div>' : '') +
    (models.length ? '<div><div class="detail-meta" style="margin-bottom:8px;">Models seen in this session</div><div class="tag-cloud">' + models.map((model) => '<span class="tag">' + escapeHtml(model) + '</span>').join('') + '</div></div>' : '');
}
function renderEntryList(entries) {
  if (currentMode === 'raw') {
    const totalLines = entriesForMode().length;
    if (!entries.length) {
      entryListEl.innerHTML = '<div class="empty" style="margin:12px;">No raw lines matched that search.</div>';
      sidebarFooterEl.textContent = '0 matching lines';
      return;
    }
    entryListEl.innerHTML = '<div class="empty" style="margin:12px;">Raw mode renders the JSONL file on the right as a single block for reliability. Use search to filter lines. Showing ' + escapeHtml(String(entries.length)) + ' of ' + escapeHtml(String(totalLines)) + ' lines.</div>';
    sidebarFooterEl.textContent = entries.length + ' of ' + totalLines + ' lines';
    return;
  }
  if (!entries.length) {
    entryListEl.innerHTML = '<div class="empty" style="margin:12px;">Nothing matched that search. The conversation on the right is unchanged.</div>';
    updateSidebarFooter(entries, currentMomentId);
    return;
  }
  entryListEl.innerHTML = entries.map((entry) => {
    const preview = entryPreview(entry);
    const secondary = [entryRoleLabel(entry), entry.timestamp || '', showAdvancedDetails && entry.id ? '#' + entry.id : ''].filter(Boolean).join(' \u2022 ');
    const kindClass = 'kind-' + groupKindForEntry(entry);
    const activeClass = entry.id === currentMomentId ? 'active' : '';
    const targetClass = selectedId && entry.id === selectedId && entry.id !== currentMomentId ? 'selected-target' : '';
    return '<div class="entry-row"><button class="entry-button ' + kindClass + ' ' + activeClass + ' ' + targetClass + '" data-id="' + escapeHtml(entry.id) + '" title="' + escapeHtml(String(entry.role || entry.type || 'entry')) + '"><div class="entry-line primary"><span class="type-block ' + roleClass(entry.role || entry.type) + '"></span><span>' + escapeHtml(preview) + '</span></div><div class="entry-line secondary">' + escapeHtml(secondary) + '</div></button></div>';
  }).join('');
  entryListEl.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => setSelected(button.getAttribute('data-id'), false, true));
  });
  updateSidebarFooter(entries, currentMomentId);
}
function scrollTranscriptSelection() {
  if (!selectedId) return;
  const items = Array.from(detailCardEl.querySelectorAll('[data-transcript-id]'));
  const target = items.find((item) => item.getAttribute('data-transcript-id') === selectedId);
  if (target && target.scrollIntoView) {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    scheduleCurrentMomentRefresh();
    setTimeout(scheduleCurrentMomentRefresh, 220);
  }
}
function renderTranscriptEntry(entry, groupKind) {
  const meta = entryAdvancedMeta(entry);
  const active = entry.id === currentMomentId ? 'active' : '';
  const selectedTarget = selectedId && entry.id === selectedId && entry.id !== currentMomentId ? 'selected-target' : '';
  const toolish = isToolishEntry(entry) ? 'toolish' : '';
  const displayText = entryDisplayText(entry);
  const technicalText = getRawLineText(entry);
  const showTechnicalBlock = showAdvancedDetails && technicalText && technicalText !== displayText;
  return ''
    + '<article class="transcript-entry ' + active + ' ' + selectedTarget + ' ' + groupKind + ' ' + toolish + '" data-transcript-id="' + escapeHtml(entry.id) + '">'
    +   '<div class="transcript-entry-header">'
    +     '<div>'
    +       '<div class="transcript-entry-title">'
    +         '<span class="type-block large ' + roleClass(entry.role || entry.type) + '" title="' + escapeHtml(String(entry.role || entry.type || 'entry')) + '"></span>'
    +         '<span>' + escapeHtml(entryRoleLabel(entry)) + '</span>'
    +         (showAdvancedDetails ? '<span class="pill">#' + escapeHtml(String(entry.index).padStart(4, '0')) + '</span>' : '')
    +       '</div>'
    +       '<div class="transcript-entry-meta">' + escapeHtml(entryPreview(entry)) + '</div>'
    +       (meta ? '<div class="inline-list"><span>' + escapeHtml(meta) + '</span></div>' : '')
    +     '</div>'
    +     (showAdvancedDetails ? '<div class="inline-list"><span>Reference:</span><span class="kbd">#' + escapeHtml(entry.id) + '</span></div>' : '')
    +   '</div>'
    +   '<div class="transcript-entry-body"><pre>' + escapeHtml(displayText) + '</pre>' + (showTechnicalBlock ? '<details class="technical-details"><summary>Technical details</summary><pre>' + escapeHtml(technicalText) + '</pre></details>' : '') + '</div>'
    + '</article>';
}
function cancelTranscriptChunking() {
  transcriptRenderToken += 1;
  if (transcriptChunkRaf) cancelAnimationFrame(transcriptChunkRaf);
  transcriptChunkRaf = 0;
}
function renderTranscriptGroupSection(group, index) {
  const lead = group.entries[0];
  const containsFocus = group.entries.some((entry) => entry.id === selectedId || entry.id === currentMomentId);
  const collapsed = group.kind === 'assistantFlow' && !containsFocus && (collapseAssistantGroups || collapsedAssistantGroupIndexes.has(index));
  return ''
    + '<section class="transcript-group ' + group.kind + ' ' + (collapsed ? 'collapsed' : '') + '" data-group-index="' + index + '">'
    +   '<div class="transcript-group-header">'
    +     '<div><div class="transcript-group-title">' + escapeHtml(groupHeadline(group)) + '</div><div class="transcript-entry-meta">' + escapeHtml(groupSubline(group)) + '</div></div>'
    +     '<div class="transcript-group-controls">'
    +       '<div class="transcript-entry-meta">' + escapeHtml(String(group.entries.length)) + ' entr' + (group.entries.length === 1 ? 'y' : 'ies') + (lead && lead.timestamp ? ' \u2022 ' + escapeHtml(lead.timestamp) : '') + '</div>'
    +       (group.kind === 'assistantFlow' ? '<button class="toggle-link" data-toggle-group="' + index + '">' + (collapsed ? 'Show steps' : 'Hide steps') + '</button>' : '')
    +     '</div>'
    +   '</div>'
    +   '<div class="transcript-list">' + group.entries.map((entry) => renderTranscriptEntry(entry, group.kind)).join('') + '</div>'
    + '</section>';
}
function bindTranscriptInteractions() {
  detailCardEl.querySelectorAll('[data-transcript-id]').forEach((item) => {
    item.addEventListener('click', () => setSelected(item.getAttribute('data-transcript-id'), true, false));
  });
  detailCardEl.querySelectorAll('[data-toggle-group]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-toggle-group'));
      if (Number.isNaN(index)) return;
      if (collapsedAssistantGroupIndexes.has(index)) collapsedAssistantGroupIndexes.delete(index);
      else collapsedAssistantGroupIndexes.add(index);
      render(false);
    });
  });
}
function scheduleTranscriptChunkAppend(groups, nextIndex, token, allEntries, sidebarEntries) {
  if (nextIndex >= groups.length) {
    const loading = detailCardEl.querySelector('[data-transcript-loading]');
    if (loading) loading.remove();
    transcriptChunkRaf = 0;
    bindTranscriptInteractions();
    updateTranscriptFocus(allEntries, sidebarEntries);
    scheduleCurrentMomentRefresh();
    return;
  }
  transcriptChunkRaf = requestAnimationFrame(() => {
    if (token !== transcriptRenderToken) return;
    const shell = detailCardEl.querySelector('.transcript-shell');
    if (!shell) return;
    let index = nextIndex;
    let appendedEntries = 0;
    const chunkHtml = [];
    while (index < groups.length && (appendedEntries < TRANSCRIPT_CHUNK_ENTRY_LIMIT || chunkHtml.length === 0)) {
      appendedEntries += groups[index].entries.length;
      chunkHtml.push(renderTranscriptGroupSection(groups[index], index));
      index += 1;
    }
    const loading = detailCardEl.querySelector('[data-transcript-loading]');
    if (loading) loading.insertAdjacentHTML('beforebegin', chunkHtml.join(''));
    else shell.insertAdjacentHTML('beforeend', chunkHtml.join(''));
    bindTranscriptInteractions();
    updateTranscriptFocus(allEntries, sidebarEntries);
    scheduleCurrentMomentRefresh();
    scheduleTranscriptChunkAppend(groups, index, token, allEntries, sidebarEntries);
  });
}
function renderDetailCard(entries, sidebarEntries) {
  cancelTranscriptChunking();
  if (currentMode === 'raw') {
    const rawEntries = filteredEntries();
    if (!rawEntries.length) {
      detailCardEl.innerHTML = '<h2>Raw session data (advanced)</h2><div class="empty">No raw lines matched the current search.</div>';
      return;
    }
    const totalLines = entriesForMode().length;
    const rawBody = rawEntries.map((entry) => String(entry.index).padStart(5, '0') + ' │ ' + getRawLineText(entry)).join('\\n');
    detailCardEl.innerHTML = '<h2>Raw session data (advanced)</h2>'
      + '<div class="detail-meta" style="margin-bottom:12px;">Showing ' + escapeHtml(String(rawEntries.length)) + ' of ' + escapeHtml(String(totalLines)) + ' JSONL lines.</div>'
      + '<pre>' + escapeHtml(rawBody) + '</pre>';
    return;
  }
  if (!entries.length) {
    detailCardEl.innerHTML = '<div class="empty">Nothing matched the current search or filter.</div>';
    return;
  }
  const groups = buildTranscriptGroups(entries);
  const hashTarget = !!decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const shouldChunkInitialTranscript = !hasRenderedInitialTranscript && !hashTarget && !showAdvancedDetails && entries.length > INITIAL_TRANSCRIPT_ENTRY_LIMIT;
  hasRenderedInitialTranscript = true;
  if (!shouldChunkInitialTranscript) {
    detailCardEl.innerHTML = '<h2>Conversation</h2><div class="transcript-shell">'
      + groups.map((group, index) => renderTranscriptGroupSection(group, index)).join('')
      + '</div>';
    bindTranscriptInteractions();
    return;
  }
  let initialGroupCount = 0;
  let initialEntryCount = 0;
  while (initialGroupCount < groups.length && (initialEntryCount < INITIAL_TRANSCRIPT_ENTRY_LIMIT || initialGroupCount === 0)) {
    initialEntryCount += groups[initialGroupCount].entries.length;
    initialGroupCount += 1;
  }
  detailCardEl.innerHTML = '<h2>Conversation</h2><div class="transcript-shell">'
    + groups.slice(0, initialGroupCount).map((group, index) => renderTranscriptGroupSection(group, index)).join('')
    + '<div class="detail-meta" data-transcript-loading style="padding:8px 0 0;">Loading more of this conversation…</div>'
    + '</div>';
  bindTranscriptInteractions();
  const token = transcriptRenderToken;
  scheduleTranscriptChunkAppend(groups, initialGroupCount, token, entries, sidebarEntries);
}
function render(scrollTranscript) {
  renderModeButtons();
  const modeEntries = renderEntries();
  const sidebarEntries = filteredEntries();
  renderRoleChips(modeEntries);
  ensureSelection(modeEntries);
  renderSessionCard(modeEntries);
  renderPromptCard();
  renderToolsCard();
  renderEntryList(sidebarEntries);
  renderDetailCard(modeEntries, sidebarEntries);
  if (scrollTranscript) scrollTranscriptSelection();
  updateTranscriptFocus(modeEntries, sidebarEntries);
  scheduleCurrentMomentRefresh();
}
searchEl.addEventListener('input', () => {
  render(false);
});
window.addEventListener('hashchange', () => render(true));
if (contentEl) contentEl.addEventListener('scroll', () => scheduleCurrentMomentRefresh(), { passive: true });
window.addEventListener('resize', () => scheduleCurrentMomentRefresh());
window.addEventListener('error', (event) => {
  showFatalError(event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason || 'Unhandled promise rejection');
});
window.addEventListener('keydown', (event) => {
  const tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
  const inInput = tag === 'input' || tag === 'textarea';
  if (event.key === '/' && !inInput) {
    event.preventDefault();
    searchEl.focus();
    searchEl.select();
    return;
  }
  if (event.key === 'Escape' && inInput) {
    searchEl.blur();
    return;
  }
  if (inInput) return;
  if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1); return; }
  if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1); return; }
  if (event.key === '1') { currentMode = 'all'; currentRole = 'main'; collapsedAssistantGroupIndexes.clear(); render(true); return; }
  if (event.key === '2') { currentMode = 'branch'; currentRole = 'main'; collapsedAssistantGroupIndexes.clear(); render(true); return; }
});
try {
  const shouldScrollToSelectionOnLoad = !!decodeURIComponent((location.hash || '').replace(/^#/, ''));
  render(shouldScrollToSelectionOnLoad);
} catch (error) {
  showFatalError(error);
}
</script>
</body>
</html>`;
}
function openFileInDefaultViewer(filePath) {
  const platform = process.platform;
  if (platform === "darwin") {
    (0, import_node_child_process.spawn)("open", [filePath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (platform === "win32") {
    (0, import_node_child_process.spawn)("cmd", ["/c", "start", "", filePath], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  (0, import_node_child_process.spawn)("xdg-open", [filePath], { detached: true, stdio: "ignore" }).unref();
}
function writeHtmlViewer(session) {
  const safeId = session.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "session";
  const stamp = Date.now().toString(36);
  const outPath = import_node_path.join(import_node_os.tmpdir(), `pi-session-history-${safeId}-${stamp}.html`);
  import_node_fs.writeFileSync(outPath, buildHistoryHtml(session), "utf8");
  return outPath;
}
var __sessionHistoryBenchmarkHelpers = {
  loadSession,
  buildHistoryHtml,
  writeHtmlViewer
};
async function selectHtmlSessionFromArgs(args, ctx) {
  let selectedSummary;
  let selectedPath;
  const normalized = normalizeArg(args);
  if (normalized === "cwd" || normalized === "here") {
    selectedSummary = await pickSession(ctx, listLightSessionsForCwd(ctx.cwd));
  } else if (normalized === "current") {
    selectedPath = ctx.sessionManager.getSessionFile() || void 0;
  } else {
    const trimmed = args.trim();
    const explicitPath = trimmed.startsWith("~/") ? import_node_path.join(HOME, trimmed.slice(2)) : trimmed;
    if (explicitPath && explicitPath.endsWith(".jsonl") && import_node_fs.existsSync(explicitPath)) {
      selectedPath = explicitPath;
    } else {
      const allSessions = listAllLightSessions();
      const resolved = resolveSessionFromArgs(args, ctx, allSessions);
      if (!resolved) {
        selectedSummary = await pickSession(ctx, allSessions);
      } else {
        selectedSummary = resolved;
      }
    }
  }
  selectedPath = selectedPath ?? selectedSummary?.path;
  if (!selectedPath) return void 0;
  if (!import_node_fs.existsSync(selectedPath)) {
    throw new Error(`Session file not found: ${selectedPath}`);
  }
  return { loaded: loadSession(selectedPath, selectedSummary), summary: selectedSummary };
}
function sessionHistoryViewerExtension(pi) {
  pi.registerCommand(HTML_COMMAND_NAME, {
    description: "Open a friendly browser viewer for any pi session",
    getArgumentCompletions: (prefix) => {
      const options = [
        { value: "current", label: "current" },
        { value: "pick", label: "pick" },
        { value: "cwd", label: "cwd" }
      ];
      const normalized = prefix.trim().toLowerCase();
      const matches = options.filter((option) => option.value.startsWith(normalized));
      return matches.length > 0 ? matches : null;
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        pi.sendMessage(
          {
            customType: HTML_COMMAND_NAME,
            content: "session-history-html requires interactive mode.",
            display: true
          },
          { triggerTurn: false }
        );
        return;
      }
      try {
        const selected = await selectHtmlSessionFromArgs(args, ctx);
        if (!selected) {
          ctx.ui.notify("No session selected.", "info");
          return;
        }
        const outPath = writeHtmlViewer(selected.loaded);
        openFileInDefaultViewer(outPath);
        ctx.ui.notify(`Opened conversation viewer: ${outPath}`, "info");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Failed to open the conversation viewer: ${message}`, "error");
      }
    }
  });
}
