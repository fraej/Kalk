// ====================================
// SciCalc — Scientific Calculator App
// Uses MathLive (mathfield) + Compute Engine
// ====================================

import { MathfieldElement } from 'https://esm.run/mathlive';
import { ComputeEngine } from 'https://esm.run/@cortex-js/compute-engine';

// ---- Configure MathLive fonts before any math-field renders ----
MathfieldElement.fontsDirectory = 'https://cdn.jsdelivr.net/npm/mathlive@0.109.0/fonts/';

// ---- Compute Engine Instance ----
const ce = new ComputeEngine();

// ---- Wait for MathField to be ready ----
await customElements.whenDefined('math-field');

// Disable the MathLive virtual keyboard globally
if (window.mathVirtualKeyboard) {
  window.mathVirtualKeyboard.visible = false;
}

// ---- DOM References ----
const mf = document.getElementById('mathfield');
const resultPreview = document.getElementById('result-preview');
const resultValue = document.getElementById('result-value');
const historyList = document.getElementById('history-list');
const modeRad = document.getElementById('mode-rad');
const modeDeg = document.getElementById('mode-deg');

// ---- Command Map: maps data-cmd values to LaTeX strings ----
const CMD_MAP = {
  // Trig
  sin:     '\\sin\\left(#?\\right)',
  cos:     '\\cos\\left(#?\\right)',
  tan:     '\\tan\\left(#?\\right)',
  ln:      '\\ln\\left(#?\\right)',
  log:     '\\log\\left(#?\\right)',
  // Inverse trig
  arcsin:  '\\arcsin\\left(#?\\right)',
  arccos:  '\\arccos\\left(#?\\right)',
  arctan:  '\\arctan\\left(#?\\right)',
  // Exponentials
  exp:     'e^{#?}',
  pow10:   '10^{#?}',
  // Functions
  sqrt:    '\\sqrt{#?}',
  square:  '#@^{2}',
  pi:      '\\pi',
  euler:   'e',
  parensOpen: '(',
  parensClose: ')',
  factorial: '#@!',
  abs:     '\\left|#?\\right|',
  frac:    '\\frac{#@}{#?}',
  power:   '#@^{#?}',
  percent: '\\%',
  sci:     '\\times10^{#?}',
  // Casio Additions
  calc: '',
  integral: '\\int_{#?}^{#?} #? dx',
  inverse: '#@^{-1}',
  logbox: '\\log_{#?}(#?)',
  degrees: '^{\\circ}',
  hyp: '',
  rcl: '',
  eng: '',
  sd: '',
  mplus: '',
  // Numbers
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4',
  '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  dot:   '.',
  comma: ',',
  // Operators
  add: '+',
  sub: '-',
  mul: '\\times',
  div: '/',
};

// ---- State ----
let angleMode = 'rad';
let shiftActive = false;
let history = [];
let lastAns = '';

// ---- Initialize MathField ----
mf.focus();

// Live preview on input
mf.addEventListener('input', () => {
  updatePreview();
});

// Intercept Enter to evaluate
mf.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    evaluateExpression();
  }
});

// ---- Angle Mode Toggle ----
modeRad.addEventListener('click', () => setAngleMode('rad'));
modeDeg.addEventListener('click', () => setAngleMode('deg'));

function setAngleMode(mode) {
  angleMode = mode;
  modeRad.classList.toggle('active', mode === 'rad');
  modeDeg.classList.toggle('active', mode === 'deg');
  updatePreview();
}

// ---- Button Event Delegation ----
const buttonPanel = document.querySelector('.button-panel');

buttonPanel.addEventListener('mousedown', (e) => {
  // Prevent buttons from stealing focus from the mathfield
  e.preventDefault();
});

buttonPanel.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  e.preventDefault();

  const action = btn.dataset.action;

  switch (action) {
    case 'insert': {
      const cmd = btn.dataset.cmd;
      if (cmd === 'ans') {
        if (lastAns !== '') {
          mf.insert(lastAns);
          mf.focus();
          updatePreview();
        }
        break;
      }
      const latex = CMD_MAP[cmd];
      if (latex) {
        mf.insert(latex);
        mf.focus();
        updatePreview();
      }
      break;
    }
    case 'delete':
      mf.executeCommand('deleteBackward');
      mf.focus();
      updatePreview();
      break;
    case 'clear':
      clearInput();
      break;
    case 'evaluate':
      evaluateExpression();
      break;
    case 'shift':
      toggleShift();
      break;
    case 'toggleSign':
      toggleSign();
      break;
  }

  // Force-clear any stuck :hover / :focus state
  btn.blur();
});

// ---- Toggle sign ----
function toggleSign() {
  const currentLatex = mf.getValue('latex');
  if (currentLatex.startsWith('-')) {
    mf.setValue(currentLatex.slice(1));
  } else {
    mf.setValue('-' + currentLatex);
  }
  mf.focus();
  updatePreview();
}

// ---- Toggle Shift (2nd function) ----
function toggleShift() {
  shiftActive = !shiftActive;
  const shiftBtn = document.getElementById('btn-shift');
  if (shiftActive) {
    shiftBtn.classList.add('btn-shift-active');
  } else {
    shiftBtn.classList.remove('btn-shift-active');
  }
}

// ---- Clear ----
function clearInput() {
  mf.setValue('');
  resultPreview.classList.remove('visible');
  resultValue.textContent = '';
  resultValue.classList.remove('error');
  mf.focus();
}

// ---- Live Preview ----
function updatePreview() {
  const latex = mf.getValue('latex');
  if (!latex || latex.trim() === '') {
    resultPreview.classList.remove('visible');
    return;
  }

  try {
    const result = computeLatex(latex);
    if (result !== null && result !== undefined && result !== '') {
      resultValue.textContent = result;
      resultValue.classList.remove('error');
      resultPreview.classList.add('visible');
    } else {
      resultPreview.classList.remove('visible');
    }
  } catch {
    resultPreview.classList.remove('visible');
  }
}

// ---- Compute LaTeX expression ----
function computeLatex(latex) {
  try {
    let expr = ce.parse(latex);
    if (!expr) return null;

    // Check for errors
    const json = expr.json;
    if (hasError(json)) return null;

    // Handle degree mode
    if (angleMode === 'deg') {
      expr = convertTrigToDegrees(expr);
    }

    // Numeric evaluation
    const result = expr.N();
    if (!result) return null;
    if (hasError(result.json)) return null;

    const val = result.valueOf();

    if (typeof val === 'number') {
      if (Number.isNaN(val)) return 'Undefined';
      if (!Number.isFinite(val)) return val > 0 ? '∞' : '-∞';
      if (Number.isInteger(val)) return val.toString();
      if (Math.abs(val - Math.round(val)) < 1e-10) return Math.round(val).toString();
      return parseFloat(val.toPrecision(12)).toString();
    }

    // Non-numeric: try string representation
    const str = result.toString();
    if (str && str !== '[object Object]' && !str.includes('Error')) {
      return str;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Check for errors in MathJSON ----
function hasError(json) {
  if (!json) return false;
  if (typeof json === 'string') return json === 'Error';
  if (Array.isArray(json)) {
    if (json[0] === 'Error') return true;
    return json.some(item => hasError(item));
  }
  return false;
}

// ---- Degree mode conversion ----
function convertTrigToDegrees(expr) {
  try {
    const json = expr.json;
    const converted = convertJsonTrigArgs(json);
    return ce.box(converted);
  } catch {
    return expr;
  }
}

function convertJsonTrigArgs(json) {
  if (json === null || json === undefined) return json;
  if (typeof json === 'number' || typeof json === 'string') return json;
  if (!Array.isArray(json)) return json;

  const [head, ...args] = json;
  const trigFns = ['Sin', 'Cos', 'Tan', 'Sec', 'Csc', 'Cot'];
  const invTrigFns = ['Arcsin', 'Arccos', 'Arctan'];

  if (typeof head === 'string' && trigFns.includes(head) && args.length === 1) {
    const convertedArg = ['Multiply', convertJsonTrigArgs(args[0]), ['Divide', 'Pi', 180]];
    return [head, convertedArg];
  }

  if (typeof head === 'string' && invTrigFns.includes(head) && args.length === 1) {
    return ['Multiply', [head, convertJsonTrigArgs(args[0])], ['Divide', 180, 'Pi']];
  }

  return [head, ...args.map(a => convertJsonTrigArgs(a))];
}

// ---- Evaluate and add to history ----
function evaluateExpression() {
  const latex = mf.getValue('latex');
  if (!latex || latex.trim() === '') return;

  const result = computeLatex(latex);
  if (result === null || result === undefined || result === '') {
    showError('Cannot evaluate');
    return;
  }

  addToHistory(latex, result);
  lastAns = result;
  mf.setValue('');
  mf.focus();
  updatePreview();
}

// ---- Show error ----
function showError(msg) {
  resultValue.textContent = msg;
  resultValue.classList.add('error');
  resultPreview.classList.add('visible');
  setTimeout(() => {
    resultValue.classList.remove('error');
    resultPreview.classList.remove('visible');
  }, 2000);
}

// ---- History ----
function addToHistory(latex, result) {
  history.push({ latex, result, id: Date.now() });
  if (history.length > 20) history.shift();
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = '';

  history.forEach((entry) => {
    const div = document.createElement('div');
    div.className = 'history-entry';

    // Render the LaTeX expression using a read-only math-field
    const exprField = document.createElement('math-field');
    exprField.className = 'history-expr';
    exprField.setAttribute('read-only', '');
    exprField.setAttribute('virtual-keyboard-mode', 'off');
    exprField.setAttribute('math-virtual-keyboard-policy', 'manual');
    exprField.setValue(entry.latex);

    const resultSpan = document.createElement('span');
    resultSpan.className = 'history-result';
    resultSpan.textContent = `= ${entry.result}`;

    div.appendChild(exprField);
    div.appendChild(resultSpan);

    div.addEventListener('click', () => {
      mf.setValue(entry.latex);
      mf.focus();
      updatePreview();
    });
    div.style.cursor = 'pointer';

    historyList.appendChild(div);
  });

  historyList.scrollTop = historyList.scrollHeight;
}

// ---- Keyboard: Escape to clear ----
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') clearInput();
});

// ---- Long press delete to clear all ----
let deleteTimer = null;
const btnDelete = document.getElementById('btn-delete');

btnDelete.addEventListener('mousedown', (e) => {
  e.preventDefault();
  deleteTimer = setTimeout(() => clearInput(), 600);
});
btnDelete.addEventListener('mouseup', () => clearTimeout(deleteTimer));
btnDelete.addEventListener('mouseleave', () => clearTimeout(deleteTimer));

// ---- Render Function Buttons with LaTeX ----
document.querySelectorAll('.btn-fn').forEach(btn => {
  const latex = btn.dataset.latex;
  if (latex) {
    btn.innerHTML = '';
    const mathField = document.createElement('math-field');
    mathField.setAttribute('read-only', '');
    mathField.style.pointerEvents = 'none';
    mathField.style.background = 'transparent';
    mathField.style.border = 'none';
    mathField.style.padding = '0';
    mathField.style.margin = '0';
    mathField.style.outline = 'none';
    mathField.style.minHeight = '0';
    mathField.style.fontSize = 'inherit';
    
    // Disable virtual keyboard settings to prevent any interference
    mathField.setAttribute('virtual-keyboard-mode', 'off');
    mathField.setAttribute('math-virtual-keyboard-policy', 'manual');
    
    mathField.setValue(latex);
    btn.appendChild(mathField);
    
    // Center the content using flex container on the button
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  }
});
