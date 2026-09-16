
"use strict";

const STORAGE_KEY = "pseintJudgeStateV1";
const DRAFTS_KEY = "pseintJudgeDraftsV1";
const ADMIN_CODE = "04370";
const ADMIN_NAME = "EDWIN TORRADO";

const $ = (s) => document.querySelector(s);
const els = {
  authView: $("#authView"), appView: $("#appView"), authForm: $("#authForm"),
  studentCode: $("#studentCode"), studentName: $("#studentName"), userBadge: $("#userBadge"),
  adminTools: $("#adminTools"),
  exerciseList: $("#exerciseList"), searchExercise: $("#searchExercise"), topicFilter: $("#topicFilter"),
  difficultyFilter: $("#difficultyFilter"),
  progressText: $("#progressText"), progressBar: $("#progressBar"), emptyState: $("#emptyState"),
  exerciseView: $("#exerciseView"), problemId: $("#problemId"), problemTitle: $("#problemTitle"),
  difficultyBadge: $("#difficultyBadge"), topicChip: $("#topicChip"), problemStatement: $("#problemStatement"),
  problemInput: $("#problemInput"), problemOutput: $("#problemOutput"), examples: $("#examples"),
  codeEditor: $("#codeEditor"), consoleOutput: $("#consoleOutput"), judgeResult: $("#judgeResult"),
  saveStatus: $("#saveStatus"), exportBtn: $("#exportBtn"), importInput: $("#importInput"),
  logoutBtn: $("#logoutBtn"), runBtn: $("#runBtn"), submitBtn: $("#submitBtn"),
  resetCodeBtn: $("#resetCodeBtn"), clearConsoleBtn: $("#clearConsoleBtn")
};

let exercises = [];
let activeExercise = null;
let state = loadState();
let drafts = loadDrafts();
let saveTimer = null;

function defaultState() {
  return { version: 1, users: {}, activeUserCode: null };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch { return defaultState(); }
}
function normalizeState(obj) {
  if (!obj || typeof obj !== "object") return defaultState();
  obj.version = 1;
  obj.users = obj.users && typeof obj.users === "object" ? obj.users : {};
  obj.activeUserCode = obj.activeUserCode ?? null;
  return obj;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadDrafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}"); }
  catch { return {}; }
}
function saveDrafts() { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); }
function getUser() { return state.activeUserCode ? state.users[state.activeUserCode] : null; }
function safeCode(v) { return v.trim().replace(/[^\w.-]/g, "").slice(0, 30); }
function normalizeName(v) { return String(v || "").trim().replace(/\s+/g, " ").toUpperCase(); }
function isAdminCredentials(code, name) {
  return code === ADMIN_CODE && normalizeName(name) === ADMIN_NAME;
}
function isAdmin() {
  const user = getUser();
  return !!user && isAdminCredentials(user.code, user.name);
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function init() {
  try {
    const res = await fetch("data/exercises.json", { cache: "no-store" });
    if (!res.ok) throw new Error("No fue posible cargar exercises.json");
    exercises = await res.json();
  } catch (err) {
    els.authView.innerHTML = `<div class="auth-card"><h1>Error de carga</h1><p>${escapeHtml(err.message)}</p><p>Abre el proyecto desde un servidor web o GitHub Pages; no directamente como archivo local.</p></div>`;
    return;
  }
  buildTopicFilter();
  bindEvents();
  renderSession();
}

function bindEvents() {
  els.authForm.addEventListener("submit", handleLogin);
  els.logoutBtn.addEventListener("click", logout);
  els.exportBtn.addEventListener("click", exportJson);
  els.importInput.addEventListener("change", importJson);
  els.searchExercise.addEventListener("input", renderExerciseList);
  els.topicFilter.addEventListener("change", renderExerciseList);
  els.difficultyFilter.addEventListener("change", renderExerciseList);
  els.runBtn.addEventListener("click", runExample);
  els.submitBtn.addEventListener("click", submitSolution);
  els.resetCodeBtn.addEventListener("click", resetCode);
  els.clearConsoleBtn.addEventListener("click", () => els.consoleOutput.textContent = "");
  els.codeEditor.addEventListener("input", scheduleDraftSave);
  els.codeEditor.addEventListener("keydown", editorTabs);
}

function handleLogin(e) {
  e.preventDefault();
  const code = safeCode(els.studentCode.value);
  const name = els.studentName.value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!code || !name) return toast("Escribe código y nombre.");

  // El código 04370 queda reservado exclusivamente para la cuenta administradora.
  if (code === ADMIN_CODE && !isAdminCredentials(code, name)) {
    return toast("El código 04370 está reservado para el administrador.");
  }

  const role = isAdminCredentials(code, name) ? "admin" : "student";

  // La cuenta administradora siempre puede recuperar el código reservado,
  // incluso si una versión anterior dejó un registro local con otro nombre.
  if (role === "admin") {
    const previous = state.users[ADMIN_CODE] || {};
    state.users[ADMIN_CODE] = {
      code: ADMIN_CODE,
      name: ADMIN_NAME,
      role: "admin",
      registeredAt: previous.registeredAt || new Date().toISOString(),
      solved: previous.solved || {},
      attempts: previous.attempts || {}
    };
  } else if (!state.users[code]) {
    state.users[code] = {
      code, name, role,
      registeredAt: new Date().toISOString(),
      solved: {}, attempts: {}
    };
  } else {
    const registered = state.users[code];
    if (normalizeName(registered.name) !== normalizeName(name)) {
      return toast("Ese código ya existe en este navegador con otro nombre.");
    }
    registered.role = "student";
  }

  state.activeUserCode = code;
  saveState();
  renderSession();
}

function logout() {
  state.activeUserCode = null;
  saveState();
  activeExercise = null;
  renderSession();
}

function renderSession() {
  const user = getUser();
  els.authView.classList.toggle("hidden", !!user);
  els.appView.classList.toggle("hidden", !user);
  if (!user) return;

  const admin = isAdmin();
  els.userBadge.innerHTML = `${escapeHtml(user.name)} · ${escapeHtml(user.code)} <span class="role-badge ${admin ? "role-admin" : "role-student"}">${admin ? "ADMINISTRADOR" : "ESTUDIANTE"}</span>`;
  els.adminTools.classList.toggle("hidden", !admin);

  renderProgress();
  renderExerciseList();
  if (activeExercise) showExercise(activeExercise.id);
}

function buildTopicFilter() {
  [...new Set(exercises.map(e => e.topic))].sort().forEach(topic => {
    const op = document.createElement("option");
    op.value = topic; op.textContent = topic;
    els.topicFilter.appendChild(op);
  });
}

function renderProgress() {
  const user = getUser(); if (!user) return;
  const solved = Object.keys(user.solved || {}).length;
  els.progressText.textContent = `${solved} / ${exercises.length}`;
  els.progressBar.style.width = `${exercises.length ? solved / exercises.length * 100 : 0}%`;
}

function renderExerciseList() {
  const user = getUser(); if (!user) return;
  const q = els.searchExercise.value.trim().toLowerCase();
  const topic = els.topicFilter.value;
  const difficulty = els.difficultyFilter.value;
  const list = exercises.filter(e =>
    (!q || `${e.id} ${e.title} ${e.topic} ${e.difficulty}`.toLowerCase().includes(q)) &&
    (!topic || e.topic === topic) &&
    (!difficulty || e.difficulty === difficulty)
  );
  els.exerciseList.innerHTML = "";
  let previousGroup = "";
  list.forEach((ex, idx) => {
    const group = `${ex.topic} · ${ex.difficulty}`;
    if (group !== previousGroup) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.textContent = group;
      els.exerciseList.appendChild(label);
      previousGroup = group;
    }

    const solved = !!user.solved?.[ex.id];
    const btn = document.createElement("button");
    btn.className = `exercise-item ${solved ? "solved" : ""} ${activeExercise?.id === ex.id ? "active" : ""}`;
    btn.innerHTML = `
      <span class="exercise-number">${escapeHtml(ex.id)}</span>
      <span class="exercise-meta"><strong>${escapeHtml(ex.title)}</strong><span>${escapeHtml(ex.topic)} · ${escapeHtml(ex.difficulty)}</span></span>
      <span class="check">${solved ? "✓" : ""}</span>`;
    btn.addEventListener("click", () => showExercise(ex.id));
    els.exerciseList.appendChild(btn);
  });
}

function showExercise(id) {
  activeExercise = exercises.find(e => e.id === id);
  if (!activeExercise) return;
  els.emptyState.classList.add("hidden");
  els.exerciseView.classList.remove("hidden");
  els.problemId.textContent = activeExercise.id;
  els.problemTitle.textContent = activeExercise.title;
  els.difficultyBadge.textContent = activeExercise.difficulty;
  els.topicChip.textContent = activeExercise.topic;
  els.problemStatement.textContent = activeExercise.statement;
  els.problemInput.textContent = activeExercise.input;
  els.problemOutput.textContent = activeExercise.output;
  els.examples.innerHTML = activeExercise.examples.map((x, i) => `
    <div class="example">
      <div class="example-head">Ejemplo ${i + 1}</div>
      <div class="example-grid">
        <div><strong>Entrada</strong><pre>${escapeHtml(x.input)}</pre></div>
        <div><strong>Salida esperada</strong><pre>${escapeHtml(x.output)}</pre></div>
      </div>
    </div>`).join("");
  const key = draftKey(id);
  els.codeEditor.value = drafts[key] ?? activeExercise.starter;
  els.consoleOutput.textContent = "Selecciona “Probar ejemplo” o “Enviar al juez”.";
  els.judgeResult.classList.add("hidden");
  els.saveStatus.textContent = "Guardado local";
  renderExerciseList();
}

function draftKey(exerciseId) {
  return `${state.activeUserCode || "anon"}::${exerciseId}`;
}
function scheduleDraftSave() {
  els.saveStatus.textContent = "Guardando…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!activeExercise) return;
    drafts[draftKey(activeExercise.id)] = els.codeEditor.value;
    saveDrafts();
    els.saveStatus.textContent = "Guardado local";
  }, 250);
}
function resetCode() {
  if (!activeExercise) return;
  els.codeEditor.value = activeExercise.starter;
  drafts[draftKey(activeExercise.id)] = activeExercise.starter;
  saveDrafts();
  toast("Plantilla restaurada.");
}
function editorTabs(e) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const t = e.target, start = t.selectionStart, end = t.selectionEnd;
  t.value = t.value.substring(0, start) + "    " + t.value.substring(end);
  t.selectionStart = t.selectionEnd = start + 4;
  scheduleDraftSave();
}

function runExample() {
  if (!activeExercise) return;
  const ex = activeExercise.examples[0];
  try {
    const output = runPseint(els.codeEditor.value, ex.input);
    els.consoleOutput.textContent =
      `Entrada:\n${ex.input}\n\nSalida obtenida:\n${output || "(sin salida)"}\n\nSalida esperada:\n${ex.output}`;
  } catch (err) {
    els.consoleOutput.textContent = formatError(err);
  }
}

function validateRequiredConstructs(code, required = []) {
  const clean = String(code || "").replace(/\/\/.*$/gm, "");
  const missing = [];

  if (required.includes("si")) {
    const hasIf = /\bSi\s+.+?\s+Entonces\b/i.test(clean);
    const hasEndIf = /\bFinSi\b/i.test(clean);
    if (!hasIf || !hasEndIf) missing.push("Si ... Entonces / FinSi");
  }

  if (required.includes("segun")) {
    const hasSwitch = /\bSegun\s+.+?\s+Hacer\b/i.test(clean);
    const hasEndSwitch = /\bFinSegun\b/i.test(clean);
    if (!hasSwitch || !hasEndSwitch) missing.push("Segun ... Hacer / FinSegun");
  }

  return missing;
}

function submitSolution() {
  if (!activeExercise) return;
  const user = getUser();
  const code = els.codeEditor.value;

  const missing = validateRequiredConstructs(code, activeExercise.required || []);
  if (missing.length) {
    els.judgeResult.classList.remove("hidden");
    els.judgeResult.innerHTML = `<div class="result-bad">ESTRUCTURA REQUERIDA NO ENCONTRADA</div>
      <p>Este ejercicio debe utilizar: <strong>${escapeHtml(missing.join(" y "))}</strong>.</p>`;
    els.consoleOutput.textContent = `VALIDACIÓN DE CÓDIGO\nFalta utilizar la estructura requerida por el ejercicio: ${missing.join(" y ")}.`;
    return;
  }
  user.attempts = user.attempts || {};
  user.attempts[activeExercise.id] = (user.attempts[activeExercise.id] || 0) + 1;

  const results = [];
  let firstError = null;
  for (let i = 0; i < activeExercise.tests.length; i++) {
    const test = activeExercise.tests[i];
    try {
      const actual = runPseint(code, test.input);
      const ok = sameOutput(actual, test.output);
      results.push({ ok, actual, expected: test.output });
    } catch (err) {
      results.push({ ok: false, error: err.message });
      firstError = firstError || err;
    }
  }

  const passed = results.filter(r => r.ok).length;
  const accepted = passed === results.length;
  const score = Math.round((passed / results.length) * 100);

  if (accepted) {
    user.solved = user.solved || {};
    user.solved[activeExercise.id] = {
      score: 100,
      attempts: user.attempts[activeExercise.id],
      solvedAt: new Date().toISOString()
    };
  }
  saveState();
  drafts[draftKey(activeExercise.id)] = code; saveDrafts();
  renderProgress(); renderExerciseList();

  els.judgeResult.classList.remove("hidden");
  els.judgeResult.innerHTML = `
    <div class="${accepted ? "result-ok" : "result-bad"}">
      ${accepted ? "ACEPTADO · 100/100" : `RESPUESTA INCORRECTA · ${score}/100`}
    </div>
    <div class="result-grid">
      ${results.map((r, i) => `<div class="test-pill ${r.ok ? "ok" : "bad"}">Caso ${i+1}: ${r.ok ? "✓ Correcto" : "✗ Falló"}</div>`).join("")}
    </div>`;

  if (accepted) {
    els.consoleOutput.textContent = `Todos los ${results.length} casos de prueba fueron superados.\nIntentos: ${user.attempts[activeExercise.id]}`;
    toast("Ejercicio resuelto correctamente.");
  } else if (firstError) {
    els.consoleOutput.textContent = formatError(firstError);
  } else {
    const fail = results.find(r => !r.ok);
    els.consoleOutput.textContent =
      `El juez encontró una salida incorrecta en un caso oculto.\n\nSalida obtenida:\n${fail.actual || "(sin salida)"}\n\nRevisa formato, condiciones y casos límite.`;
  }
}

function sameOutput(a, b) {
  return normalizeOutput(a) === normalizeOutput(b);
}
function normalizeOutput(s) {
  return String(s ?? "").replace(/\r\n/g, "\n").split("\n")
    .map(x => x.replace(/[ \t]+$/g, "")).join("\n").trim();
}
function formatError(err) {
  return `ERROR DE EJECUCIÓN\n${err.message}${err.line ? `\nLínea aproximada: ${err.line}` : ""}`;
}

/* ---------------- PSeInt mini-interpreter ---------------- */

function runPseint(source, inputText) {
  const program = parseProgram(source);
  const input = tokenizeInput(inputText);
  const env = Object.create(null);
  const output = [];
  const ctx = { env, input, inputPos: 0, output, steps: 0, maxSteps: 100000 };
  execBlock(program, ctx);
  return output.join("\n");
}

function cleanLines(source) {
  return source.replace(/\r/g, "").split("\n").map((raw, index) => {
    let line = stripComment(raw).trim();
    return { text: line, line: index + 1 };
  }).filter(x => x.text);
}
function stripComment(s) {
  let out = "", quote = null;
  for (let i=0;i<s.length;i++) {
    const c=s[i], n=s[i+1];
    if ((c === '"' || c === "'") && s[i-1] !== "\\") quote = quote === c ? null : (quote || c);
    if (!quote && c === "/" && n === "/") break;
    out += c;
  }
  return out;
}

function parseProgram(source) {
  const lines = cleanLines(source);
  if (!lines.length) throw judgeError("El código está vacío.");
  let start = 0, end = lines.length;
  if (/^(Proceso|Algoritmo)\b/i.test(lines[0].text)) start++;
  if (/^Fin(Proceso|Algoritmo)\b/i.test(lines[lines.length-1].text)) end--;
  const slice = lines.slice(start,end);
  const [nodes, pos] = parseBlock(slice, 0, []);
  if (pos < slice.length) throw judgeError(`Sentencia inesperada: ${slice[pos].text}`, slice[pos].line);
  return nodes;
}

function parseBlock(lines, pos, stops) {
  const nodes = [];
  while (pos < lines.length) {
    const item = lines[pos], t = item.text;
    if (stops.some(re => re.test(t))) break;

    let m;
    if (/^Definir\b/i.test(t)) {
      nodes.push({type:"define", text:t, line:item.line}); pos++; continue;
    }
    if (/^Leer\b/i.test(t)) {
      nodes.push({type:"read", text:t.replace(/^Leer\s+/i,""), line:item.line}); pos++; continue;
    }
    if (/^Escribir\b/i.test(t)) {
      nodes.push({type:"write", text:t.replace(/^Escribir\s+/i,""), line:item.line}); pos++; continue;
    }
    if ((m=t.match(/^Si\s+(.+?)\s+Entonces$/i))) {
      const cond=m[1]; pos++;
      let thenNodes; [thenNodes,pos]=parseBlock(lines,pos,[/^SiNo$/i,/^FinSi$/i]);
      let elseNodes=[];
      if (pos < lines.length && /^SiNo$/i.test(lines[pos].text)) {
        pos++; [elseNodes,pos]=parseBlock(lines,pos,[/^FinSi$/i]);
      }
      if (pos>=lines.length || !/^FinSi$/i.test(lines[pos].text)) throw judgeError("Falta FinSi.", item.line);
      pos++;
      nodes.push({type:"if",cond,thenNodes,elseNodes,line:item.line}); continue;
    }
    if ((m=t.match(/^Mientras\s+(.+?)\s+Hacer$/i))) {
      pos++; let body; [body,pos]=parseBlock(lines,pos,[/^FinMientras$/i]);
      if (pos>=lines.length || !/^FinMientras$/i.test(lines[pos].text)) throw judgeError("Falta FinMientras.", item.line);
      pos++;
      nodes.push({type:"while",cond:m[1],body,line:item.line}); continue;
    }
    if ((m=t.match(/^Para\s+([A-Za-z_]\w*)\s*<-\s*(.+?)\s+Hasta\s+(.+?)(?:\s+Con\s+Paso\s+(.+?))?\s+Hacer$/i))) {
      pos++; let body; [body,pos]=parseBlock(lines,pos,[/^FinPara$/i]);
      if (pos>=lines.length || !/^FinPara$/i.test(lines[pos].text)) throw judgeError("Falta FinPara.", item.line);
      pos++;
      nodes.push({type:"for",name:m[1],start:m[2],end:m[3],step:m[4]||"1",body,line:item.line}); continue;
    }
    if (/^Repetir$/i.test(t)) {
      pos++; let body; [body,pos]=parseBlock(lines,pos,[/^Hasta\s+Que\b/i]);
      if (pos>=lines.length) throw judgeError("Falta Hasta Que.", item.line);
      const hm=lines[pos].text.match(/^Hasta\s+Que\s+(.+)$/i);
      if (!hm) throw judgeError("Sintaxis inválida en Hasta Que.", lines[pos].line);
      pos++;
      nodes.push({type:"repeat",cond:hm[1],body,line:item.line}); continue;
    }
    if ((m=t.match(/^Segun\s+(.+?)\s+Hacer$/i))) {
      const parsed = parseSwitch(lines,pos+1,m[1],item.line);
      nodes.push(parsed.node); pos=parsed.pos; continue;
    }
    if ((m=t.match(/^([A-Za-z_]\w*)\s*<-\s*(.+)$/i))) {
      nodes.push({type:"assign",name:m[1],expr:m[2],line:item.line}); pos++; continue;
    }
    if (/^(FinSi|FinMientras|FinPara|FinSegun|SiNo|Hasta\s+Que)\b/i.test(t)) break;
    if (/^Borrar\s+Pantalla$/i.test(t) || /^Limpiar\s+Pantalla$/i.test(t)) { pos++; continue; }
    throw judgeError(`No reconozco la sentencia: ${t}`, item.line);
  }
  return [nodes,pos];
}

function parseSwitch(lines, pos, expr, openingLine) {
  const cases = [], defaultBody = [];
  let current = null, defaultMode = false;
  while (pos < lines.length) {
    const item=lines[pos], t=item.text;
    if (/^FinSegun$/i.test(t)) return {node:{type:"switch",expr,cases,defaultBody,line:openingLine},pos:pos+1};

    const dm=t.match(/^De\s+Otro\s+Modo\s*:\s*$/i);
    if (dm) { defaultMode=true; current=null; pos++; continue; }

    const cm=t.match(/^(.+?)\s*:\s*$/);
    if (cm && !/^(Si|Mientras|Para|Segun)\b/i.test(t)) {
      const raw=cm[1];
      const values=raw.split(",").map(x=>x.trim()).filter(Boolean);
      current={values,body:[]}; cases.push(current); defaultMode=false; pos++; continue;
    }

    if (!current && !defaultMode) throw judgeError("Dentro de Segun debes declarar un caso como 1: o De Otro Modo:",item.line);
    const [chunk,newPos]=parseBlock(lines,pos,[/^.+?\s*:\s*$/,/^De\s+Otro\s+Modo\s*:\s*$/i,/^FinSegun$/i]);
    (defaultMode?defaultBody:current.body).push(...chunk);
    pos=newPos;
  }
  throw judgeError("Falta FinSegun.",openingLine);
}

function execBlock(nodes, ctx) {
  for (const node of nodes) {
    tick(ctx,node.line);
    switch(node.type) {
      case "define": execDefine(node,ctx); break;
      case "read": execRead(node,ctx); break;
      case "write": execWrite(node,ctx); break;
      case "assign": setVar(ctx.env,node.name,evalExpr(node.expr,ctx,node.line)); break;
      case "if":
        execBlock(truthy(evalExpr(node.cond,ctx,node.line))?node.thenNodes:node.elseNodes,ctx); break;
      case "while": {
        let guard=0;
        while (truthy(evalExpr(node.cond,ctx,node.line))) {
          execBlock(node.body,ctx); if (++guard>50000) throw judgeError("Bucle Mientras demasiado largo.",node.line);
        } break;
      }
      case "for": {
        const start=Number(evalExpr(node.start,ctx,node.line)), end=Number(evalExpr(node.end,ctx,node.line));
        let step=Number(evalExpr(node.step,ctx,node.line));
        if (!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(step)||step===0) throw judgeError("Valores inválidos en Para.",node.line);
        let guard=0;
        if (step>0) for(let i=start;i<=end;i+=step){ setVar(ctx.env,node.name,i); execBlock(node.body,ctx); if(++guard>50000) throw judgeError("Bucle Para demasiado largo.",node.line); }
        else for(let i=start;i>=end;i+=step){ setVar(ctx.env,node.name,i); execBlock(node.body,ctx); if(++guard>50000) throw judgeError("Bucle Para demasiado largo.",node.line); }
        break;
      }
      case "repeat": {
        let guard=0;
        do { execBlock(node.body,ctx); if(++guard>50000) throw judgeError("Bucle Repetir demasiado largo.",node.line); }
        while(!truthy(evalExpr(node.cond,ctx,node.line)));
        break;
      }
      case "switch": execSwitch(node,ctx); break;
    }
  }
}

function execDefine(node,ctx) {
  const m=node.text.match(/^Definir\s+(.+?)\s+Como\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)$/i);
  if (!m) throw judgeError("Sintaxis de Definir inválida.",node.line);
  const type=m[2].toLowerCase();
  m[1].split(",").map(x=>x.trim()).filter(Boolean).forEach(name=>{
    setVar(ctx.env,name, type.includes("cadena")||type.includes("caracter") ? "" : type.includes("logico") ? false : 0);
  });
}
function execRead(node,ctx) {
  const names=node.text.split(",").map(x=>x.trim()).filter(Boolean);
  names.forEach(name=>{
    if (!/^[A-Za-z_]\w*$/.test(name)) throw judgeError(`Variable inválida en Leer: ${name}`,node.line);
    if (ctx.inputPos>=ctx.input.length) throw judgeError("El programa intentó leer más datos de los proporcionados.",node.line);
    setVar(ctx.env,name,parseInputValue(ctx.input[ctx.inputPos++]));
  });
}
function execWrite(node,ctx) {
  let text=node.text.replace(/^Sin\s+Saltar\s+/i,"");
  const noNewline=/^Sin\s+Saltar\s+/i.test(node.text);
  const parts=splitArgs(text);
  const rendered=parts.map(p=>formatValue(evalExpr(p,ctx,node.line))).join("");
  if (noNewline && ctx.output.length) ctx.output[ctx.output.length-1]+=rendered;
  else ctx.output.push(rendered);
}
function execSwitch(node,ctx) {
  const value=evalExpr(node.expr,ctx,node.line);
  for (const c of node.cases) {
    for (const raw of c.values) {
      if (looseEqual(value,evalExpr(raw,ctx,node.line))) { execBlock(c.body,ctx); return; }
    }
  }
  execBlock(node.defaultBody,ctx);
}
function looseEqual(a,b) {
  if (typeof a==="number" && typeof b==="number") return Math.abs(a-b)<1e-12;
  return String(a)===String(b);
}
function tick(ctx,line) {
  ctx.steps++;
  if (ctx.steps>ctx.maxSteps) throw judgeError("Se superó el límite de ejecución. Revisa si existe un ciclo infinito.",line);
}
function truthy(v){ return !!v; }
function setVar(env,name,value){ env[String(name).toLowerCase()]=value; }

function tokenizeInput(text) {
  const tokens=[]; let cur="", quote=null;
  const src=String(text??"").replace(/\r/g,"");
  for(let i=0;i<src.length;i++){
    const c=src[i];
    if ((c==='"'||c==="'")) { if(quote===c) quote=null; else if(!quote) quote=c; else cur+=c; continue; }
    if(!quote && /\s/.test(c)){ if(cur!==""){tokens.push(cur);cur="";} }
    else cur+=c;
  }
  if(cur!=="") tokens.push(cur);
  return tokens;
}
function parseInputValue(t) {
  const s=String(t);
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
  if (/^(verdadero|true)$/i.test(s)) return true;
  if (/^(falso|false)$/i.test(s)) return false;
  return s;
}
function formatValue(v) {
  if (typeof v==="boolean") return v ? "Verdadero" : "Falso";
  if (typeof v==="number") {
    if (Object.is(v,-0)) v=0;
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(12)));
  }
  return String(v ?? "");
}
function splitArgs(s) {
  const out=[]; let cur="", quote=null, depth=0;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if((c==='"'||c==="'") && s[i-1]!=="\\"){ quote=quote===c?null:(quote||c); cur+=c; continue; }
    if(!quote){
      if(c==="(") depth++;
      if(c===")") depth--;
      if(c==="," && depth===0){ out.push(cur.trim()); cur=""; continue; }
    }
    cur+=c;
  }
  if(cur.trim()) out.push(cur.trim());
  return out.length?out:[""];
}

function evalExpr(expr,ctx,line) {
  let js=translateExpr(expr);
  const helpers={
    abs:Math.abs, trunc:Math.trunc, redon:Math.round, raiz:Math.sqrt,
    sen:Math.sin, cos:Math.cos, tan:Math.tan,
    azar:(n)=>Math.floor(Math.random()*Number(n)),
    longitud:(x)=>String(x).length,
    mayusculas:(x)=>String(x).toUpperCase(),
    minusculas:(x)=>String(x).toLowerCase(),
    convertiratexto:(x)=>String(x),
    convertirnumero:(x)=>Number(x)
  };
  const envProxy=new Proxy(ctx.env,{
    has:(target,prop)=>{
      if(typeof prop!=="string") return false;
      const k=prop.toLowerCase();
      if(k==="helpers" || k==="env") return false;
      if(Object.prototype.hasOwnProperty.call(helpers,k)) return false;
      return true;
    },
    get:(target,prop)=>{
      if(typeof prop!=="string") return target[prop];
      const k=prop.toLowerCase();
      if(Object.prototype.hasOwnProperty.call(target,k)) return target[k];
      if(k==="verdadero") return true;
      if(k==="falso") return false;
      throw judgeError(`Variable no definida: ${prop}`,line);
    }
  });
  try {
    return Function("env","helpers",`with(env){with(helpers){return (${js});}}`)(envProxy,helpers);
  } catch(err) {
    if (err && err.isJudgeError) throw err;
    throw judgeError(`Expresión inválida: ${expr}`,line);
  }
}

function translateExpr(expr) {
  let s=String(expr).trim();
  const strings=[];
  s=s.replace(/(["'])(?:\\.|(?!\1).)*\1/g, m=>`__STR${strings.push(m)-1}__`);
  s=s.replace(/<>/g,"!=")
     .replace(/\bMOD\b/gi,"%")
     .replace(/\bY\b/gi,"&&")
     .replace(/\bO\b/gi,"||")
     .replace(/\bNO\b/gi,"!")
     .replace(/\^/g,"**")
     .replace(/(?<![<>=!])=(?!=)/g,"===")
     .replace(/\bVerdadero\b/gi,"true")
     .replace(/\bFalso\b/gi,"false");
  s=s.replace(/__STR(\d+)__/g,(_,n)=>strings[Number(n)]);
  return s;
}

function judgeError(message,line=null) {
  const e=new Error(message); e.line=line; e.isJudgeError=true; return e;
}

/* ---------------- JSON import/export ---------------- */

function exportJson() {
  if (!isAdmin()) {
    toast("Solo el administrador puede exportar información.");
    return;
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    platform: "PSeInt Judge",
    state
  };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`pseint-judge-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast("Archivo JSON exportado.");
}

async function importJson(e) {
  if (!isAdmin()) {
    toast("Solo el administrador puede importar información.");
    e.target.value = "";
    return;
  }
  const file=e.target.files?.[0]; if(!file) return;
  try {
    const parsed=JSON.parse(await file.text());
    const incoming=normalizeState(parsed.state || parsed);
    if(!incoming.users || typeof incoming.users!=="object") throw new Error("JSON inválido.");
    state=mergeStates(state,incoming);
    saveState();
    renderSession();
    toast("JSON importado y combinado.");
  } catch(err) { toast(`No se pudo importar: ${err.message}`); }
  finally { e.target.value=""; }
}
function mergeStates(a,b) {
  const out=normalizeState(structuredClone(a));
  for(const [code,user] of Object.entries(b.users||{})){
    if(!out.users[code]) out.users[code]=user;
    else {
      out.users[code].name=out.users[code].name||user.name;
      out.users[code].solved={...(user.solved||{}),...(out.users[code].solved||{})};
      out.users[code].attempts={...(user.attempts||{}),...(out.users[code].attempts||{})};
    }
  }
  return out;
}
function escapeHtml(s) {
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

init();
