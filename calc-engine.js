// Calculator engine: turns an expression string into a number without eval().
// Used by script.js in the browser and by tests/calc-engine.test.js in Node.
//
// Grammar, from the weakest operation to the strongest:
//   expression := term (('+' | '-') term)*
//   term       := suffix (('*' | '/' | 'mod' | 'nCr' | 'nPr') suffix | suffix)*
//                 — the second form is implicit multiplication: 2π, 3(4), 2sin(30)
//   unary      := ('-' | '+') unary | suffix
//   suffix     := power ('²' | '³' | '⁻¹' | '^' exponent)*
//                 — x², x³ and 1/x bind weaker than ^, so 2^3 x² is (2^3)² = 64
//   exponent   := ('-' | '+') exponent | power
//   power      := postfix ('^' exponent)?   — right-associative: 2^3^2 = 2^9 = 512
//   postfix    := primary ('!' | '%')*
//   primary    := number | 'π' | 'e' | function '(' expression ')' | '(' expression ')'
// Closing parentheses missing at the very end are implied: sin(30 = sin(30).
// Numbers may use E-notation with a capital E (2E-7); a lowercase e is Euler's number.
//
// mod, nCr and nPr are infix words with the same priority as × and ÷:
// 10 mod 3 = 1, 5 nCr 2 = 10, 5 nPr 2 = 20.

// Longer names must come first: they are alternated in a RegExp, and "sin" would
// otherwise swallow the tail of "sinh" in FUNCTION_NAME_AT_END (script.js).
const FUNCTION_NAMES = [
    'asinh', 'acosh', 'atanh',
    'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh',
    'sin', 'cos', 'tan',
    'log', 'ln', 'sqrt', 'cbrt', 'abs', 'exp',
];

const NUMBER_PATTERN = /(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?/y;
const FUNCTION_PATTERN = new RegExp('(?:' + FUNCTION_NAMES.join('|') + ')\\(', 'y');
const WORD_OPERATOR_PATTERN = /(?:mod|nCr|nPr)/y;
const SIGNS = '+-*/^!%()';
const SUFFIXES = ['²', '³', '⁻¹'];

// The parser is recursive; without a limit a deeply nested input would end with
// "Maximum call stack size exceeded" instead of a message a person can read.
const MAX_DEPTH = 500;

// Split an expression into numbers (constants included), function names and signs.
// Sticky regular expressions read from a moving index instead of copying the rest
// of the string on every token — the old rest.match() made tokenizing quadratic.
function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];

        NUMBER_PATTERN.lastIndex = i;
        const number = NUMBER_PATTERN.exec(expr);
        if (number) {
            // 1.2.3 is a typo, not 1.2 × .3
            if (expr[i + number[0].length] === '.') {
                throw new SyntaxError('Две точки в числе');
            }
            tokens.push({ type: 'number', value: parseFloat(number[0]) });
            i += number[0].length;
            continue;
        }

        const suffix = SUFFIXES.find((s) => expr.startsWith(s, i));
        if (suffix) {
            tokens.push({ type: 'sign', value: suffix });
            i += suffix.length;
            continue;
        }

        FUNCTION_PATTERN.lastIndex = i;
        const fn = FUNCTION_PATTERN.exec(expr);
        if (fn) {
            tokens.push({ type: 'function', name: fn[0].slice(0, -1) });
            i += fn[0].length - 1; // the '(' stays for readPrimary()
            continue;
        }

        WORD_OPERATOR_PATTERN.lastIndex = i;
        const word = WORD_OPERATOR_PATTERN.exec(expr);
        if (word) {
            tokens.push({ type: 'sign', value: word[0] });
            i += word[0].length;
            continue;
        }

        if (ch === 'π' || ch === 'e') {
            tokens.push({ type: 'number', value: ch === 'π' ? Math.PI : Math.E });
            i += 1;
            continue;
        }

        if (SIGNS.includes(ch)) {
            tokens.push({ type: 'sign', value: ch });
            i += 1;
            continue;
        }

        throw new SyntaxError('Непонятный символ «' + ch + '»');
    }
    return tokens;
}

// Build a tree from tokens: one function per grammar rule
function parseTokens(tokens) {
    let pos = 0;
    let depth = 0;
    const peek = () => tokens[pos];
    const isSign = (token, value) => token !== undefined && token.type === 'sign' && token.value === value;
    const startsOperand = (token) => token !== undefined
        && (token.type === 'number' || token.type === 'function' || isSign(token, '('));

    function guard() {
        depth += 1;
        if (depth > MAX_DEPTH) {
            throw new SyntaxError('Слишком сложное выражение: больше ' + MAX_DEPTH + ' уровней вложенности');
        }
    }

    function unguard() {
        depth -= 1;
    }

    function readExpression() {
        let node = readTerm();
        while (isSign(peek(), '+') || isSign(peek(), '-')) {
            const op = tokens[pos++].value;
            node = { type: 'binary', op, left: node, right: readTerm() };
        }
        return node;
    }

    function readTerm() {
        let node = readUnary();
        for (;;) {
            const token = peek();
            if (isSign(token, '*') || isSign(token, '/')
                || isSign(token, 'mod') || isSign(token, 'nCr') || isSign(token, 'nPr')) {
                const op = tokens[pos++].value;
                node = { type: 'binary', op, left: node, right: readUnary() };
            } else if (startsOperand(token)) {
                node = { type: 'binary', op: '*', left: node, right: readUnary() };
            } else {
                return node;
            }
        }
    }

    function readUnary() {
        if (isSign(peek(), '-') || isSign(peek(), '+')) {
            const op = tokens[pos++].value;
            const arg = readUnary();
            return op === '-' ? { type: 'negate', arg } : arg;
        }
        return readSuffix();
    }

    // Postfix square, cube and reciprocal. They are applied after ^ on purpose:
    // 2 ^ 3 x² must give (2^3)² = 64, not 2^(3²) = 512.
    function readSuffix() {
        let node = readPower();
        for (;;) {
            const token = peek();
            if (isSign(token, '²') || isSign(token, '³') || isSign(token, '⁻¹')) {
                node = { type: 'suffix', op: tokens[pos++].value, arg: node };
            } else if (isSign(token, '^')) {
                pos++;
                node = { type: 'binary', op: '^', left: node, right: readExponent() };
            } else {
                return node;
            }
        }
    }

    // The right side of ^ never takes a postfix suffix of its own, so that suffix
    // after a power belongs to the whole power: 2^3² = (2^3)².
    function readExponent() {
        guard();
        try {
            if (isSign(peek(), '-') || isSign(peek(), '+')) {
                const op = tokens[pos++].value;
                const arg = readExponent();
                return op === '-' ? { type: 'negate', arg } : arg;
            }
            return readPower();
        } finally {
            unguard();
        }
    }

    function readPower() {
        const base = readPostfix();
        if (isSign(peek(), '^')) {
            pos++;
            return { type: 'binary', op: '^', left: base, right: readExponent() };
        }
        return base;
    }

    function readPostfix() {
        let node = readPrimary();
        while (isSign(peek(), '!') || isSign(peek(), '%')) {
            node = { type: tokens[pos++].value === '!' ? 'factorial' : 'percent', arg: node };
        }
        return node;
    }

    function readPrimary() {
        const token = tokens[pos++];
        if (token === undefined) {
            throw new SyntaxError('Выражение не закончено');
        }
        if (token.type === 'number') {
            return { type: 'number', value: token.value };
        }
        if (token.type === 'function') {
            pos++; // the '(' that tokenize() found right after the name
            return { type: 'function', name: token.name, arg: readGroup() };
        }
        if (isSign(token, '(')) {
            return readGroup();
        }
        throw new SyntaxError('Неожиданный знак «' + token.value + '»');
    }

    // Expression up to ')'; at the very end of input the ')' may be missing
    function readGroup() {
        guard();
        try {
            const node = readExpression();
            if (isSign(peek(), ')')) {
                pos++;
            } else if (peek() !== undefined) {
                throw new SyntaxError('Ожидалась «)»');
            }
            return node;
        } finally {
            unguard();
        }
    }

    if (tokens.length === 0) {
        throw new SyntaxError('Пустое выражение');
    }
    const tree = readExpression();
    if (pos < tokens.length) {
        throw new SyntaxError('Лишний знак «' + tokens[pos].value + '»');
    }
    return tree;
}

// Evaluate the tree without recursion: a chain like 1+1+1+… builds a tree as deep
// as the chain is long, and recursive evaluation ran out of stack on ~2000 terms.
function evaluateNode(root, degrees) {
    const work = [{ node: root, stage: 0 }];
    const stack = [];

    while (work.length > 0) {
        const frame = work[work.length - 1];
        const node = frame.node;

        switch (node.type) {
            case 'number':
                stack.push(node.value);
                work.pop();
                break;
            case 'negate':
            case 'percent':
            case 'factorial':
            case 'suffix':
            case 'function':
                if (frame.stage === 0) {
                    frame.stage = 1;
                    work.push({ node: node.arg, stage: 0 });
                } else {
                    work.pop();
                    stack.push(applyUnary(node, stack.pop(), degrees));
                }
                break;
            case 'binary':
                if (frame.stage === 0) {
                    frame.stage = 1;
                    work.push({ node: node.left, stage: 0 });
                } else if (frame.stage === 1) {
                    frame.stage = 2;
                    work.push({ node: node.right, stage: 0 });
                } else {
                    work.pop();
                    const right = stack.pop();
                    const left = stack.pop();
                    stack.push(applyBinary(node.op, left, right, node.right));
                }
                break;
            default:
                throw new Error('Неизвестный узел ' + node.type);
        }
    }
    return stack[0];
}

function applyUnary(node, value, degrees) {
    switch (node.type) {
        case 'negate': return -value;
        case 'percent': return value / 100;
        case 'factorial': return factorial(value);
        case 'suffix':
            if (node.op === '²') return value * value;
            if (node.op === '³') return value * value * value;
            return 1 / value; // '⁻¹'
        case 'function': return applyFunction(node.name, value, degrees);
        default: throw new Error('Неизвестный узел ' + node.type);
    }
}

function applyBinary(op, left, right, rightNode) {
    // a + b% is "a plus b percent of a", as on an ordinary calculator: 200 + 10% = 220
    if ((op === '+' || op === '-') && rightNode.type === 'percent') {
        const share = left * right;
        return op === '+' ? left + share : left - share;
    }
    switch (op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '^': return power(left, right);
        case 'mod': return left % right;
        case 'nCr': return combinations(left, right);
        case 'nPr': return permutations(left, right);
        default: throw new Error('Неизвестная операция ' + op);
    }
}

// Math.pow(-8, 1/3) is NaN, although a real cube root exists. Accept a negative
// base when the exponent is 1/odd, so that (-8)^(1/3) = −2.
function power(base, exponent) {
    if (base < 0 && !Number.isInteger(exponent)) {
        const inverse = 1 / exponent;
        const rounded = Math.round(inverse);
        const isOddRoot = Math.abs(inverse - rounded) < 1e-9 && Math.abs(rounded) % 2 === 1;
        if (isOddRoot) return -Math.pow(-base, exponent);
    }
    return Math.pow(base, exponent);
}

function applyFunction(name, x, degrees) {
    const unit = degrees ? Math.PI / 180 : 1; // one degree in radians, or 1 in RAD mode
    switch (name) {
        case 'sin': return trig(Math.sin(x * unit));
        case 'cos': return trig(Math.cos(x * unit));
        case 'tan':
            // tan 90°, tan 270°, ... does not exist (in radians π/2 is never exact)
            if (degrees && Math.abs(x % 180) === 90) return NaN;
            return trig(Math.tan(x * unit));
        case 'asin': return Math.asin(x) / unit;
        case 'acos': return Math.acos(x) / unit;
        case 'atan': return Math.atan(x) / unit;
        case 'sinh': return Math.sinh(x);
        case 'cosh': return Math.cosh(x);
        case 'tanh': return Math.tanh(x);
        case 'asinh': return Math.asinh(x);
        case 'acosh': return Math.acosh(x);
        case 'atanh': return Math.atanh(x);
        case 'log': return Math.log10(x);
        case 'ln': return Math.log(x);
        case 'sqrt': return Math.sqrt(x);
        case 'cbrt': return Math.cbrt(x);
        case 'abs': return Math.abs(x);
        case 'exp': return Math.exp(x);
        default: throw new Error('Неизвестная функция ' + name);
    }
}

// sin 180° comes out as 1.2e-16 because π is not exact; such a remainder is zero
function trig(value) {
    return Math.abs(value) < 1e-15 ? 0 : value;
}

function wholeNumber(value) {
    const rounded = Math.round(value);
    return Math.abs(value - rounded) < 1e-9 * Math.max(1, Math.abs(value)) ? rounded : null;
}

// n! for whole n ≥ 0 (3.0000000000000004 counts as 3); beyond 170! the value is Infinity
function factorial(n) {
    const k = wholeNumber(n);
    if (k === null || k < 0) return NaN;
    let result = 1;
    for (let i = 2; i <= k && result !== Infinity; i++) {
        result *= i;
    }
    return result;
}

// nCr without building n!: the product is divided step by step, so 100 nCr 50
// stays finite and exact enough for the 12 digits on the display.
function combinations(n, r) {
    const total = wholeNumber(n);
    const chosen = wholeNumber(r);
    if (total === null || chosen === null || total < 0 || chosen < 0 || chosen > total) return NaN;
    const k = Math.min(chosen, total - chosen);
    let result = 1;
    for (let i = 1; i <= k; i++) {
        result = result * (total - k + i) / i;
    }
    return result > 1e15 ? result : Math.round(result);
}

// nPr = n × (n−1) × … × (n−r+1)
function permutations(n, r) {
    const total = wholeNumber(n);
    const chosen = wholeNumber(r);
    if (total === null || chosen === null || total < 0 || chosen < 0 || chosen > total) return NaN;
    let result = 1;
    for (let i = 0; i < chosen; i++) {
        result *= total - i;
    }
    return result;
}

// Value of an expression; NaN or ±Infinity when there is no value (1/0, sqrt(-1)).
// Throws SyntaxError when the expression cannot be read.
function evaluateExpression(expr, degrees) {
    return evaluateNode(parseTokens(tokenize(expr)), degrees);
}

const DISPLAY_DIGITS = 12;

// Number for the display: up to 12 significant digits; very large and very small
// numbers in E-notation: 2E-7, 2.43290200818E+18.
// A non-finite value is not a result: it must never reach the screen as text.
// style 'eng' keeps the exponent a multiple of three (1.234E+3, 123E-6).
function formatResult(value, style) {
    if (!Number.isFinite(value)) return 'Ошибка';
    if (value === 0) return '0'; // also turns -0 into 0
    if (style === 'eng') return formatEngineering(value);

    const size = Math.abs(value);
    if (size >= 1e12 || size < 1e-6) {
        const [mantissa, exponent] = value.toExponential(DISPLAY_DIGITS - 1).split('e');
        return parseFloat(mantissa) + 'E' + exponent;
    }
    return String(parseFloat(value.toPrecision(DISPLAY_DIGITS)));
}

function formatEngineering(value) {
    let exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
    let mantissa = parseFloat((value / Math.pow(10, exponent)).toPrecision(DISPLAY_DIGITS));
    if (Math.abs(mantissa) >= 1000) {
        exponent += 3;
        mantissa = parseFloat((value / Math.pow(10, exponent)).toPrecision(DISPLAY_DIGITS));
    }
    if (exponent === 0) return String(mantissa);
    return mantissa + 'E' + (exponent > 0 ? '+' : '') + exponent;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FUNCTION_NAMES, tokenize, parseTokens, evaluateExpression,
        formatResult, formatEngineering, factorial, combinations, permutations,
    };
}
