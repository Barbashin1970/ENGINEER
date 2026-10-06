// Calculator engine: turns an expression string into a number without eval().
// Used by script.js in the browser and by tests/calc-engine.test.js in Node.
//
// Grammar, from the weakest operation to the strongest:
//   expression := term (('+' | '-') term)*
//   term       := unary (('*' | '/') unary | unary)*   — the second form is implicit
//                                                      multiplication: 2π, 3(4), 2sin(30)
//   unary      := ('-' | '+') unary | power
//   power      := postfix ('^' unary)?                — right-associative: 2^3^2 = 2^9,
//                                                      and -2^2 = -(2^2)
//   postfix    := primary ('!' | '%')*
//   primary    := number | 'π' | 'e' | function '(' expression ')' | '(' expression ')'
// Closing parentheses missing at the very end are implied: sin(30 = sin(30).
// Numbers may use E-notation with a capital E (2E-7); a lowercase e is Euler's number.

const FUNCTION_NAMES = ['asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs', 'exp'];
const NUMBER_PATTERN = /^(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?/;

// Split an expression into numbers (constants included), function names and signs
function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const rest = expr.slice(i);
        const number = rest.match(NUMBER_PATTERN);
        const name = FUNCTION_NAMES.find((f) => rest.startsWith(f + '('));
        if (number) {
            // 1.2.3 is a typo, not 1.2 × .3
            if (rest[number[0].length] === '.') {
                throw new SyntaxError('Две точки в числе');
            }
            tokens.push({ type: 'number', value: parseFloat(number[0]) });
            i += number[0].length;
        } else if (name) {
            tokens.push({ type: 'function', name });
            i += name.length;
        } else if (rest[0] === 'π' || rest[0] === 'e') {
            tokens.push({ type: 'number', value: rest[0] === 'π' ? Math.PI : Math.E });
            i += 1;
        } else if ('+-*/^!%()'.includes(rest[0])) {
            tokens.push({ type: 'sign', value: rest[0] });
            i += 1;
        } else {
            throw new SyntaxError('Непонятный символ «' + rest[0] + '»');
        }
    }
    return tokens;
}

// Build a tree from tokens: one function per grammar rule
function parseTokens(tokens) {
    let pos = 0;
    const peek = () => tokens[pos];
    const isSign = (token, value) => token !== undefined && token.type === 'sign' && token.value === value;
    const startsOperand = (token) => token !== undefined
        && (token.type === 'number' || token.type === 'function' || isSign(token, '('));

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
            if (isSign(peek(), '*') || isSign(peek(), '/')) {
                const op = tokens[pos++].value;
                node = { type: 'binary', op, left: node, right: readUnary() };
            } else if (startsOperand(peek())) {
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
        return readPower();
    }

    function readPower() {
        const base = readPostfix();
        if (isSign(peek(), '^')) {
            pos++;
            return { type: 'binary', op: '^', left: base, right: readUnary() };
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
        const node = readExpression();
        if (isSign(peek(), ')')) {
            pos++;
        } else if (peek() !== undefined) {
            throw new SyntaxError('Ожидалась «)»');
        }
        return node;
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

function evaluateNode(node, degrees) {
    switch (node.type) {
        case 'number':
            return node.value;
        case 'negate':
            return -evaluateNode(node.arg, degrees);
        case 'percent':
            return evaluateNode(node.arg, degrees) / 100;
        case 'factorial':
            return factorial(evaluateNode(node.arg, degrees));
        case 'function':
            return applyFunction(node.name, evaluateNode(node.arg, degrees), degrees);
        case 'binary':
            return applyBinary(node, degrees);
        default:
            throw new Error('Неизвестный узел ' + node.type);
    }
}

function applyBinary(node, degrees) {
    const left = evaluateNode(node.left, degrees);
    // a + b% is "a plus b percent of a", as on an ordinary calculator: 200 + 10% = 220
    if ((node.op === '+' || node.op === '-') && node.right.type === 'percent') {
        const share = left * evaluateNode(node.right.arg, degrees) / 100;
        return node.op === '+' ? left + share : left - share;
    }
    const right = evaluateNode(node.right, degrees);
    switch (node.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return left / right;
        case '^': return Math.pow(left, right);
        default: throw new Error('Неизвестная операция ' + node.op);
    }
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
        case 'log': return Math.log10(x);
        case 'ln': return Math.log(x);
        case 'sqrt': return Math.sqrt(x);
        case 'abs': return Math.abs(x);
        case 'exp': return Math.exp(x);
        default: throw new Error('Неизвестная функция ' + name);
    }
}

// sin 180° comes out as 1.2e-16 because π is not exact; such a remainder is zero
function trig(value) {
    return Math.abs(value) < 1e-15 ? 0 : value;
}

// n! for whole n ≥ 0 (3.0000000000000004 counts as 3); beyond 170! the value is Infinity
function factorial(n) {
    const k = Math.round(n);
    if (k < 0 || Math.abs(n - k) > 1e-9 * Math.max(1, Math.abs(n))) return NaN;
    let result = 1;
    for (let i = 2; i <= k && result !== Infinity; i++) {
        result *= i;
    }
    return result;
}

// Value of an expression; NaN or ±Infinity when there is no value (1/0, sqrt(-1)).
// Throws SyntaxError when the expression cannot be read.
function evaluateExpression(expr, degrees) {
    return evaluateNode(parseTokens(tokenize(expr)), degrees);
}

// Number for the display: up to 12 significant digits; very large and very small
// numbers in E-notation: 2E-7, 2.43290200818E+18
function formatResult(value) {
    if (value === 0) return '0'; // also turns -0 into 0
    const size = Math.abs(value);
    if (size >= 1e12 || size < 1e-6) {
        const [mantissa, exponent] = value.toExponential(11).split('e');
        return parseFloat(mantissa) + 'E' + exponent;
    }
    return String(parseFloat(value.toPrecision(12)));
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FUNCTION_NAMES, tokenize, parseTokens, evaluateExpression, formatResult, factorial };
}
