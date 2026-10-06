// Calculator state
let expression = '';         // what is typed, internal form: 2*π+sin(30
let isDegrees = true;
let isInv = false;
let lastCalculation = false; // expression holds the result of «=»

// DOM elements
const expressionEl = document.getElementById('expression'); // history line: 2×π+sin(30) =
const resultEl = document.getElementById('result');         // main display
const degRadBtn = document.getElementById('degRadBtn');
const invBtn = document.getElementById('invBtn');

// What the scientific keys insert in INV mode (|x| has no inverse)
const INVERSE = {
    'sin(': 'asin(',
    'cos(': 'acos(',
    'tan(': 'atan(',
    'log(': '10^(',
    'ln(': 'e^(',
    'sqrt(': '^2',
    'exp(': 'ln(',
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
    return /[\d.)πe!%]$/.test(expression);
}

// After «=» a new number starts from scratch; an operator continues the result
function startNewEntry() {
    if (lastCalculation) {
        expression = '';
        lastCalculation = false;
    }
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
    }
    expression += digit;
    updateDisplay();
}

// Decimal point: one per number; a point without digits before it becomes 0.
function insertPoint() {
    startNewEntry();
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
    lastCalculation = false;
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
    lastCalculation = false;
    if (endsWithOperand()) {
        expression += sign;
        updateDisplay();
    }
}

// Insert function
function insertFunction(func) {
    const text = isInv && INVERSE[func] ? INVERSE[func] : func;
    if (text === '^2') {
        // x² squares the operand already typed, including the result of «=»
        lastCalculation = false;
        if (endsWithOperand()) expression += text;
    } else {
        startNewEntry();
        // 10^( right after a digit would merge into one number: 2 → 210^(
        if (/^\d/.test(text) && /[\d.]$/.test(expression)) expression += '*';
        expression += text;
    }
    updateDisplay();
}

// Insert constant
function insertConstant(constant) {
    startNewEntry();
    expression += constant === 'pi' ? 'π' : 'e';
    updateDisplay();
}

// Clear all
function clearAll() {
    expression = '';
    lastCalculation = false;
    expressionEl.textContent = '';
    updateDisplay();
}

// Clear entry: the last number, constant or function opening; after «=» — the result
function clearEntry() {
    if (lastCalculation) {
        expression = '';
        lastCalculation = false;
    } else {
        const opening = expression.match(FUNCTION_OPENING);
        const operand = expression.match(/(?:(?:\d+\.?\d*|\.\d*)(?:E[+-]?\d+)?|[πe])$/);
        const entry = opening || operand;
        if (entry) expression = expression.slice(0, -entry[0].length);
    }
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

// Index where the last operand begins: a number, a constant or a group (...) with its function
function lastOperandStart() {
    let end = expression.length;
    while (end > 0 && '!%'.includes(expression[end - 1])) end--;
    const head = expression.slice(0, end);
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

// Expression as shown: × ÷ − √ sin⁻¹ instead of the internal * / - sqrt asin
function prettify(text) {
    return text
        .replace(/\*/g, '×')
        .replace(/\//g, '÷')
        .replace(/-/g, '−')
        .replace(/sqrt\(/g, '√(')
        .replace(/a(sin|cos|tan)\(/g, '$1⁻¹(');
}

// Update display: the main display always shows what is typed
function updateDisplay() {
    resultEl.textContent = expression ? prettify(expression) : '0';
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
        expression = formatResult(value);
        lastCalculation = true;
        resultEl.textContent = prettify(expression);
    } catch (error) {
        // 1÷0, √−1, unfinished expression: show the error, next input starts from scratch
        expression = '';
        lastCalculation = false;
        resultEl.textContent = 'Ошибка';
    }
    expressionEl.textContent = shown + ' =';
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
degRadBtn.classList.toggle('active', isDegrees);
updateDisplay();
