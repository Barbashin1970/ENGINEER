// Calculator state
let expression = '';         // what is typed, internal form: 2*π+sin(30
let isDegrees = true;
let isInv = false;
let lastCalculation = false; // expression holds the result of «=»
let lastValue = null;        // exact result of «=»: the display rounds, the chain does not
let memory = 0;
let hasMemory = false;
let isEngineering = false;   // result format: exponent is a multiple of three

// DOM elements
const expressionEl = document.getElementById('expression'); // history line: 2×π+sin(30) =
const resultEl = document.getElementById('result');         // main display
const degRadBtn = document.getElementById('degRadBtn');
const invBtn = document.getElementById('invBtn');
const engBtn = document.getElementById('engBtn');
const memoryIndicator = document.getElementById('memoryIndicator');

// What the scientific keys insert in INV mode
const INVERSE = {
    'sin(': 'asin(',
    'cos(': 'acos(',
    'tan(': 'atan(',
    'sinh(': 'asinh(',
    'cosh(': 'acosh(',
    'tanh(': 'atanh(',
    'log(': '10^(',
    'ln(': 'e^(',
    'sqrt(': 'cbrt(',
    'exp(': 'ln(',
};

// Postfix keys: x², x³, 1/x
const SUFFIX_BY_KEY = {
    'x²': '²',
    'x³': '³',
    '1/x': '⁻¹',
};

// A function opening at the end of the expression: sin(, asin(, 10^(, e^(
// FUNCTION_NAMES comes from calc-engine.js
const FUNCTION_OPENING = new RegExp('(?:' + FUNCTION_NAMES.join('|') + '|10\\^|e\\^)\\($');
const FUNCTION_NAME_AT_END = new RegExp('(?:' + FUNCTION_NAMES.join('|') + '|10\\^|e\\^)$');

// Check if character is a binary operator
function isOperator(char) {
    return ['+', '-', '*', '/', '^'].includes(char);
}

// Expression ends with a complete operand: a number, constant, ')' or a postfix sign
function endsWithOperand() {
    return /[\d.)πe!%²³¹]$/.test(expression);
}

// A number written without the rounding of the display: String() gives the
// shortest text that reads back into exactly the same double (1/3 keeps 17 digits).
function exactString(value) {
    return String(value).replace('e', 'E');
}

// After «=» a new number starts from scratch; an operator continues the result
function startNewEntry() {
    if (lastCalculation) {
        expression = '';
        lastCalculation = false;
    }
}

// Continue from the exact result after «=» instead of the rounded text on the display
function continueFromResult() {
    if (!lastCalculation) return;
    expression = lastValue !== null ? exactString(lastValue) : '';
    lastCalculation = false;
}

// Insert character: digit, point, parenthesis, operator, '!' or '%'
function insertChar(char) {
    if (isOperator(char)) {
        insertOperator(char);
    } else if (char === '!' || char === '%') {
        insertPostfix(char);
    } else if (char === '.') {
        insertPoint();
    } else if (char === ')') {
        closeParenthesis();
    } else if (char === '(') {
        startNewEntry();
        expression += '(';
        updateDisplay();
    } else if (/^\d$/.test(char)) {
        insertDigit(char);
    }
}

// Insert digit; a lone leading zero is replaced: 0 → 5, but 10 → 105 and 0. → 0.5
function insertDigit(digit) {
    startNewEntry();
    if (/(^|[^\d.E])0$/.test(expression)) {
        expression = expression.slice(0, -1);
    } else if (/(?:[!%²³¹]|⁻¹)$/.test(expression)) {
        // 5% then 2 must not silently become 5 % 2: show the multiplication
        expression += '*';
    }
    expression += digit;
    updateDisplay();
}

// Decimal point: one per number; a point without digits before it becomes 0.
function insertPoint() {
    startNewEntry();
    if (/(?:[!%²³¹]|⁻¹|\))$/.test(expression)) {
        expression += '*0.';
        updateDisplay();
        return;
    }
    const number = expression.match(/[\d.]*(?:E[+-]?\d*)?$/)[0];
    if (number.includes('.') || number.includes('E')) return;
    expression += number === '' ? '0.' : '.';
    updateDisplay();
}

// Closing parenthesis: only when one is open and the operand before it is complete
function closeParenthesis() {
    const open = (expression.match(/\(/g) || []).length;
    const closed = (expression.match(/\)/g) || []).length;
    if (open > closed && endsWithOperand()) {
        expression += ')';
        lastCalculation = false;
        updateDisplay();
    }
}

// Insert operator: + − × ÷ ^
function insertOperator(op) {
    continueFromResult();
    const last = expression.slice(-1);
    if (isOperator(last)) {
        if (op === '-' && ['*', '/', '^'].includes(last)) {
            // Negative number after ×, ÷, ^: 2×−3, 2^−1
            expression += op;
            updateDisplay();
            return;
        }
        // A new operator replaces the previous one
        expression = expression.replace(/[-+*/^]+$/, '');
    }
    if (expression === '' || expression.slice(-1) === '(') {
        // Only a minus can start a number
        if (op === '-') expression += op;
    } else {
        expression += op;
    }
    updateDisplay();
}

// Factorial and percent go after a complete operand: 5!, (2+1)!, 50%
function insertPostfix(sign) {
    continueFromResult();
    if (endsWithOperand()) {
        expression += sign;
        updateDisplay();
    }
}

// Insert function
function insertFunction(func) {
    const text = isInv && INVERSE[func] ? INVERSE[func] : func;
    if (SUFFIX_BY_KEY[text]) {
        insertSuffix(SUFFIX_BY_KEY[text]);
        return;
    }
    startNewEntry();
    // 10^( right after an operand would merge into one number: 2 → 2*10^(
    if (/^\d/.test(text) && endsWithOperand()) expression += '*';
    expression += text;
    updateDisplay();
}

// Postfix square, cube and reciprocal: they apply to the whole operand before them,
// including the result of «=» and a completed power: 2^3 → x² gives 64.
function insertSuffix(symbol) {
    if (lastCalculation) {
        if (lastValue === null) return;
        expression = exactString(lastValue);
        lastCalculation = false;
    }
    if (!endsWithOperand()) return;
    expression += symbol;
    updateDisplay();
}

// y-th root of x: typed as x^(1/y), the missing ')' is closed by «=»
function insertNthRoot() {
    continueFromResult();
    if (!endsWithOperand()) return;
    expression += '^(1/';
    updateDisplay();
}

// Word operators mod, nCr, nPr
function insertNamedOperator(name) {
    continueFromResult();
    if (!endsWithOperand()) return;
    if (expression.endsWith(name)) return;
    expression += name;
    updateDisplay();
}

// Insert constant
function insertConstant(constant) {
    startNewEntry();
    if (endsWithOperand()) expression += '*';
    expression += constant === 'pi' ? 'π' : 'e';
    updateDisplay();
}

// Exponent of the number being typed: 2 EXP 3 → 2E3
function insertExponent() {
    continueFromResult();
    if (!/[\d.]$/.test(expression)) return;
    if (/E[+-]?\d*$/.test(expression)) return;
    expression += 'E';
    updateDisplay();
}

// Recall the exact previous result as a number in the expression
function insertAnswer() {
    if (lastValue === null || !Number.isFinite(lastValue)) return;
    startNewEntry();
    if (endsWithOperand()) expression += '*';
    expression += exactString(lastValue);
    updateDisplay();
}

// Value of what is typed right now, or null when it cannot be calculated
function currentValue() {
    if (expression === '') return lastValue;
    try {
        const value = evaluateExpression(expression, isDegrees);
        return Number.isFinite(value) ? value : null;
    } catch (error) {
        return null;
    }
}

function updateMemoryIndicator() {
    memoryIndicator.classList.toggle('visible', hasMemory);
}

function memoryStore() {
    const value = currentValue();
    if (value === null) return;
    memory = value;
    hasMemory = true;
    updateMemoryIndicator();
}

function memoryAdd() {
    const value = currentValue();
    if (value === null) return;
    memory += value;
    hasMemory = true;
    updateMemoryIndicator();
}

function memorySubtract() {
    const value = currentValue();
    if (value === null) return;
    memory -= value;
    hasMemory = true;
    updateMemoryIndicator();
}

function memoryRecall() {
    startNewEntry();
    if (!hasMemory) return;
    if (endsWithOperand()) expression += '*';
    expression += exactString(memory);
    updateDisplay();
}

function memoryClear() {
    memory = 0;
    hasMemory = false;
    updateMemoryIndicator();
}

// Clear all
function clearAll() {
    expression = '';
    lastCalculation = false;
    expressionEl.textContent = '';
    updateDisplay();
}

// Index where the trailing !, %, ², ³ and ⁻¹ end
function stripTrailingPostfix(text) {
    let end = text.length;
    for (;;) {
        if (end >= 2 && text.slice(0, end).endsWith('⁻¹')) {
            end -= 2;
        } else if (end > 0 && '!%²³'.includes(text[end - 1])) {
            end -= 1;
        } else {
            return end;
        }
    }
}

// Index where the last operand begins: a number, a constant or a group (...) with its function
function lastOperandStart() {
    const end = stripTrailingPostfix(expression);
    const head = expression.slice(0, end);
    if (head === '') return -1;
    if (head.endsWith(')')) {
        let depth = 0;
        for (let i = head.length - 1; i >= 0; i--) {
            if (head[i] === ')') depth++;
            if (head[i] === '(' && --depth === 0) {
                const name = head.slice(0, i).match(FUNCTION_NAME_AT_END);
                return name ? i - name[0].length : i;
            }
        }
        return -1;
    }
    const operand = head.match(/(?:(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?|[πe])$/);
    return operand ? end - operand[0].length : -1;
}

// Clear entry: the last operand, function call or the result after «=»
function clearEntry() {
    if (lastCalculation) {
        clearAll();
        return;
    }
    const start = lastOperandStart();
    if (start >= 0) expression = expression.slice(0, start);
    updateDisplay();
}

// Backspace: one character; a function opening like sin( or 10^( goes as a whole
function backspace() {
    if (lastCalculation) {
        clearAll();
        return;
    }
    const opening = expression.match(FUNCTION_OPENING);
    expression = opening ? expression.slice(0, -opening[0].length) : expression.slice(0, -1);
    // No half of E-notation is left behind: 2E−7 → 2E− → 2
    expression = expression.replace(/E[+-]?$/, '');
    updateDisplay();
}

// Toggle sign of the last operand: 5+3 → 5−3, 5×3 → 5×−3, −3 → 3
function toggleSign() {
    const start = lastOperandStart();
    if (start < 0) {
        // Nothing to negate yet: start a negative number
        insertOperator('-');
        return;
    }
    const before = expression.slice(0, start);
    const operand = expression.slice(start);
    const sign = before.slice(-1);
    const beforeSign = before.slice(0, -1);
    if (sign === '-' && (beforeSign === '' || /[-+*/^(]$/.test(beforeSign))) {
        expression = beforeSign + operand;          // −3 → 3, 5×−3 → 5×3
    } else if (sign === '-') {
        expression = beforeSign + '+' + operand;    // 5−3 → 5+3
    } else if (sign === '+') {
        expression = beforeSign + '-' + operand;    // 5+3 → 5−3
    } else if (before === '' || /[*/^(]$/.test(before)) {
        expression = before + '-' + operand;        // 3 → −3, 5×3 → 5×−3
    } else {
        expression = before + '*-' + operand;       // 2π → 2×−π
    }
    updateDisplay();
}

// Toggle degree/radian
function toggleDegRad() {
    isDegrees = !isDegrees;
    degRadBtn.classList.toggle('active', isDegrees);
    degRadBtn.textContent = isDegrees ? 'DEG' : 'RAD';
    saveSettings();
}

// Toggle inverse; the scientific keys show what they insert in INV mode
function toggleInv() {
    isInv = !isInv;
    invBtn.classList.toggle('active', isInv);
    document.querySelectorAll('[data-inv]').forEach((button) => {
        if (!button.dataset.label) button.dataset.label = button.textContent;
        button.textContent = isInv ? button.dataset.inv : button.dataset.label;
    });
}

// Toggle the engineering format of the result: 1234 → 1.234E+3, 0.000123 → 123E-6
function toggleEngineering() {
    isEngineering = !isEngineering;
    engBtn.classList.toggle('active', isEngineering);
    saveSettings();
}

// Expression as shown: × ÷ − √ sin⁻¹ instead of the internal * / - sqrt asin
function prettify(text) {
    return text
        .replace(/\*/g, '×')
        .replace(/\//g, '÷')
        // The minus of E-notation is part of the number: 2E−7 must read back as 2E-7
        .replace(/-/g, (match, offset, whole) => (whole[offset - 1] === 'E' ? match : '−'))
        .replace(/asinh\(/g, 'sinh⁻¹(')
        .replace(/acosh\(/g, 'cosh⁻¹(')
        .replace(/atanh\(/g, 'tanh⁻¹(')
        .replace(/asin\(/g, 'sin⁻¹(')
        .replace(/acos\(/g, 'cos⁻¹(')
        .replace(/atan\(/g, 'tan⁻¹(')
        .replace(/sqrt\(/g, '√(')
        .replace(/cbrt\(/g, '∛(');
}

// Update display: the main display always shows what is typed
function updateDisplay() {
    resultEl.textContent = expression ? prettify(expression) : '0';
}

function formatValue(value) {
    return formatResult(value, isEngineering ? 'eng' : undefined);
}

// Calculate
function calculate() {
    if (!expression) return;
    // History line shows the parentheses that «=» closes automatically
    const missing = (expression.match(/\(/g) || []).length - (expression.match(/\)/g) || []).length;
    const shown = prettify(expression + ')'.repeat(Math.max(0, missing)));
    try {
        const value = evaluateExpression(expression, isDegrees);
        if (!Number.isFinite(value)) throw new RangeError('Нет значения');
        lastValue = value;
        expression = formatValue(value);
        lastCalculation = true;
        resultEl.textContent = prettify(expression);
    } catch (error) {
        // 1÷0, √−1, unfinished expression: show the error, next input starts from scratch
        lastValue = null;
        expression = '';
        lastCalculation = false;
        resultEl.textContent = 'Ошибка';
    }
    expressionEl.textContent = shown + ' =';
}

// Remember the display mode between visits; file:// and private mode may forbid storage
function saveSettings() {
    try {
        localStorage.setItem('engineer-settings', JSON.stringify({ degrees: isDegrees, eng: isEngineering }));
    } catch (error) {
        // Storage unavailable: the calculator simply starts in DEG every time
    }
}

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('engineer-settings') || '{}');
        if (typeof saved.degrees === 'boolean') isDegrees = saved.degrees;
        if (typeof saved.eng === 'boolean') isEngineering = saved.eng;
    } catch (error) {
        // Broken or unavailable storage: keep the defaults
    }
}

// Keyboard support
document.addEventListener('keydown', (e) => {
    // Shortcuts with Cmd/Ctrl/Alt (reload, copy, zoom) stay with the browser
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // Decimal comma: the numeric keypad gives ',' in the Russian layout
    const key = e.key === ',' ? '.' : e.key;
    if (/^[0-9]$/.test(key) || ['+', '-', '*', '/', '^', '(', ')', '.', '%', '!'].includes(key)) {
        insertChar(key);
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Backspace') {
        backspace();
    } else if (key === 'Escape') {
        clearAll();
    } else if (key === 'Delete') {
        clearEntry();
    } else {
        return; // Tab, F5, arrows and the rest keep their usual meaning
    }
    e.preventDefault();
});

// Initialize display
loadSettings();
degRadBtn.classList.toggle('active', isDegrees);
degRadBtn.textContent = isDegrees ? 'DEG' : 'RAD';
engBtn.classList.toggle('active', isEngineering);
updateMemoryIndicator();
updateDisplay();
