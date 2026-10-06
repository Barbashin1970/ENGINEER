// Calculator state
let expression = '';
let result = '0';
let isDegrees = true;
let isInv = false;
let lastCalculation = false;

// DOM elements
const expressionEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const degRadBtn = document.getElementById('degRadBtn');
const invBtn = document.getElementById('invBtn');

// Insert character
function insertChar(char) {
    if (lastCalculation && !isOperator(char)) {
        expression = '';
        lastCalculation = false;
    } else {
        lastCalculation = false;
    }
    
    // Prevent multiple operators in a row (except minus for negative numbers)
    if (isOperator(char) && isOperator(expression.slice(-1))) {
        expression = expression.slice(0, -1);
    }
    
    expression += char;
    updateDisplay();
}

// Insert operator
function insertOperator(op) {
    insertChar(op);
}

// Check if character is an operator
function isOperator(char) {
    return ['+', '-', '*', '/', '^', '%'].includes(char);
}

// Insert function
function insertFunction(func) {
    if (lastCalculation) {
        expression = '';
        lastCalculation = false;
    }
    
    if (isInv) {
        // Inverse functions
        switch(func) {
            case 'sin(':
                expression += 'asin(';
                break;
            case 'cos(':
                expression += 'acos(';
                break;
            case 'tan(':
                expression += 'atan(';
                break;
            case 'log(':
                expression += '10^';
                break;
            case 'ln(':
                expression += 'e^';
                break;
            case 'sqrt(':
                expression += '^2';
                break;
            case 'abs(':
                expression += '';
                break;
            case 'exp(':
                expression += 'log(';
                break;
            default:
                expression += func;
        }
    } else {
        expression += func;
    }
    
    updateDisplay();
}

// Insert constant
function insertConstant(constant) {
    if (lastCalculation) {
        expression = '';
        lastCalculation = false;
    }
    
    switch(constant) {
        case 'pi':
            expression += 'π';
            break;
        case 'e':
            expression += 'e';
            break;
    }
    
    updateDisplay();
}

// Clear all
function clearAll() {
    expression = '';
    result = '0';
    lastCalculation = false;
    updateDisplay();
    resultEl.textContent = '0';
}

// Clear entry
function clearEntry() {
    // Remove last number or function from expression
    const match = expression.match(/([\d.]+|[\w]+\()$/);
    if (match) {
        expression = expression.slice(0, -match[0].length);
    }
    updateDisplay();
}

// Backspace
function backspace() {
    if (lastCalculation) {
        clearAll();
        return;
    }
    
    // Check if ending with a function
    const funcMatch = expression.match(/([\w]+\($/);
    if (funcMatch) {
        expression = expression.slice(0, -funcMatch[0].length);
    } else {
        expression = expression.slice(0, -1);
    }
    
    updateDisplay();
}

// Toggle sign
function toggleSign() {
    if (expression === '' || expression === '0') {
        expression = '-';
    } else if (expression.startsWith('-')) {
        expression = expression.slice(1);
    } else {
        expression = '-' + expression;
    }
    updateDisplay();
}

// Toggle degree/radian
function toggleDegRad() {
    isDegrees = !isDegrees;
    degRadBtn.classList.toggle('active', isDegrees);
    degRadBtn.textContent = isDegrees ? 'DEG' : 'RAD';
}

// Toggle inverse
function toggleInv() {
    isInv = !isInv;
    invBtn.classList.toggle('active', isInv);
}

// Update display
function updateDisplay() {
    expressionEl.textContent = expression;
}

// Calculate factorial
function factorial(n) {
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

// Calculate
function calculate() {
    if (!expression) return;
    
    try {
        let evalExpr = expression;
        
        // Replace constants
        evalExpr = evalExpr.replace(/π/g, '(Math.PI)');
        evalExpr = evalExpr.replace(/e(?![xp])/g, '(Math.E)');
        
        // Handle factorial
        evalExpr = evalExpr.replace(/(\d+)!/g, 'factorial($1)');
        
        // Handle power operator
        evalExpr = evalExpr.replace(/\^/g, '**');
        
        // Handle trigonometric functions
        if (isDegrees) {
            evalExpr = evalExpr.replace(/sin\(/g, 'sinDeg(');
            evalExpr = evalExpr.replace(/cos\(/g, 'cosDeg(');
            evalExpr = evalExpr.replace(/tan\(/g, 'tanDeg(');
            evalExpr = evalExpr.replace(/asin\(/g, 'asinDeg(');
            evalExpr = evalExpr.replace(/acos\(/g, 'acosDeg(');
            evalExpr = evalExpr.replace(/atan\(/g, 'atanDeg(');
        } else {
            evalExpr = evalExpr.replace(/sin\(/g, 'Math.sin(');
            evalExpr = evalExpr.replace(/cos\(/g, 'Math.cos(');
            evalExpr = evalExpr.replace(/tan\(/g, 'Math.tan(');
            evalExpr = evalExpr.replace(/asin\(/g, 'Math.asin(');
            evalExpr = evalExpr.replace(/acos\(/g, 'Math.acos(');
            evalExpr = evalExpr.replace(/atan\(/g, 'Math.atan(');
        }
        
        // Handle other functions
        evalExpr = evalExpr.replace(/log\(/g, 'Math.log10(');
        evalExpr = evalExpr.replace(/ln\(/g, 'Math.log(');
        evalExpr = evalExpr.replace(/sqrt\(/g, 'Math.sqrt(');
        evalExpr = evalExpr.replace(/abs\(/g, 'Math.abs(');
        evalExpr = evalExpr.replace(/exp\(/g, 'Math.exp(');
        
        // Evaluate
        let evalResult = eval(evalExpr);
        
        // Format result
        if (typeof evalResult === 'number') {
            if (Number.isFinite(evalResult)) {
                // Round to avoid floating point errors
                evalResult = parseFloat(evalResult.toPrecision(12));
                
                // Check if it's an integer
                if (Number.isInteger(evalResult)) {
                    result = evalResult.toString();
                } else {
                    result = evalResult.toString();
                }
            } else {
                result = 'Ошибка';
            }
        } else {
            result = 'Ошибка';
        }
        
        // Update display
        expressionEl.textContent = expression + ' =';
        resultEl.textContent = result;
        
        // Update expression for potential continued calculation
        expression = result;
        lastCalculation = true;
        
    } catch (error) {
        resultEl.textContent = 'Ошибка';
        expression = '';
    }
}

// Keyboard support
document.addEventListener('keydown', (e) => {
    e.preventDefault();
    
    const key = e.key;
    
    if (/^[0-9]$/.test(key)) {
        insertChar(key);
    } else if (['+', '-', '*', '/', '(', ')', '.', '%', '^'].includes(key)) {
        insertChar(key);
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Backspace') {
        backspace();
    } else if (key === 'Escape') {
        clearAll();
    } else if (key === 'Delete') {
        clearEntry();
    }
});

// Initialize display
updateDisplay();
