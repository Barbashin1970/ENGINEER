// Проверки движка счёта: node --test "tests/*.test.js"
// (каталог целиком node --test не принимает: он ищет там файлы тестов по своим правилам)
// В скобках после названия — разрыв из docs/KALKULYATOR-RAZBOR.md, который проверка ловит.
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateExpression, formatResult } = require('../calc-engine.js');

// Expression → text on the display (DEG unless said otherwise)
function calc(expr, degrees = true) {
    return formatResult(evaluateExpression(expr, degrees));
}

function noValue(expr, degrees = true) {
    return !Number.isFinite(evaluateExpression(expr, degrees));
}

test('приоритет операций и скобки', () => {
    assert.equal(calc('2+3*4'), '14');
    assert.equal(calc('(2+3)*4'), '20');
    assert.equal(calc('10-4-3'), '3');
    assert.equal(calc('64/4/2'), '8');
    assert.equal(calc('2^3^2'), '512');
});

test('унарный минус и степень (Р7, Р12)', () => {
    assert.equal(calc('-2^2'), '-4');
    assert.equal(calc('(-2)^2'), '4');
    assert.equal(calc('2^-1'), '0.5');
    assert.equal(calc('2*-3'), '-6');
    assert.equal(calc('5--3'), '8');
});

test('неявное умножение (Р6)', () => {
    assert.equal(calc('2π'), '6.28318530718');
    assert.equal(calc('2(3+4)'), '14');
    assert.equal(calc('(1+1)(2+2)'), '8');
    assert.equal(calc('2sin(30)'), '1');
    assert.equal(calc('1/2π'), '1.57079632679'); // (1/2)·π: тот же приоритет, что у ÷
});

test('проценты как на обычном калькуляторе (Р5)', () => {
    assert.equal(calc('50%'), '0.5');
    assert.equal(calc('200+10%'), '220');
    assert.equal(calc('200-10%'), '180');
    assert.equal(calc('200*10%'), '20');
    assert.equal(calc('200/10%'), '2000');
});

test('факториал любого операнда, без зависания (Р8)', () => {
    assert.equal(calc('0!'), '1');
    assert.equal(calc('5!'), '120');
    assert.equal(calc('(2+1)!'), '6');
    assert.equal(calc('((0.1+0.2)*10)!'), '6'); // 3.0000000000000004 — это 3
    assert.equal(calc('20!'), '2.43290200818E+18');
    assert.ok(noValue('2.5!'));
    assert.ok(noValue('(-1)!'));
    assert.ok(noValue('171!'));
    assert.ok(noValue('1000000000!')); // цикл обрывается на 171, а не идёт до миллиарда
});

test('тригонометрия в градусах (Р3)', () => {
    assert.equal(calc('sin(30)'), '0.5');
    assert.equal(calc('cos(60)'), '0.5');
    assert.equal(calc('tan(45)'), '1');
    assert.equal(calc('sin(180)'), '0'); // а не 1.22464679915E-16
    assert.equal(calc('cos(90)'), '0');
    assert.ok(noValue('tan(90)'));
    assert.ok(noValue('tan(-270)'));
    assert.equal(calc('asin(0.5)'), '30');
    assert.equal(calc('acos(0)'), '90');
    assert.equal(calc('atan(1)'), '45');
});

test('тригонометрия в радианах и обратные функции (Р4)', () => {
    assert.equal(calc('sin(π/2)', false), '1');
    assert.equal(calc('cos(π)', false), '-1');
    assert.equal(calc('sin(π)', false), '0');
    assert.equal(calc('acos(0)', false), '1.57079632679');
    assert.equal(calc('asin(1)', false), '1.57079632679');
    assert.equal(calc('atan(1)', false), '0.785398163397');
});

test('логарифмы, корень, модуль, экспонента', () => {
    assert.equal(calc('log(1000)'), '3');
    assert.equal(calc('ln(e)'), '1');
    assert.equal(calc('exp(1)'), '2.71828182846');
    assert.equal(calc('e^(1)'), '2.71828182846');
    assert.equal(calc('10^(2)'), '100');
    assert.equal(calc('sqrt(16)'), '4');
    assert.equal(calc('abs(-5)'), '5');
    assert.ok(noValue('sqrt(-1)'));
    assert.ok(noValue('log(-1)'));
    assert.ok(noValue('ln(0)'));
    assert.ok(noValue('1/0'));
});

test('незакрытые скобки в конце закрываются (Р9)', () => {
    assert.equal(calc('sin(30'), '0.5');
    assert.equal(calc('2*(3+4'), '14');
    assert.equal(calc('sqrt(sqrt(16'), '2');
});

test('ошибки разбора — исключение, а не число', () => {
    for (const bad of ['', '5+', '*5', '()', '2)', 'sin()', '1.2.3', '5..', 'abc', '5 5', '2E']) {
        assert.throws(() => evaluateExpression(bad, true), SyntaxError, `«${bad}»`);
    }
});

test('вид результата на табло', () => {
    assert.equal(formatResult(0.1 + 0.2), '0.3');
    assert.equal(formatResult(1 / 3), '0.333333333333');
    assert.equal(formatResult(-0), '0');
    assert.equal(formatResult(2e-7), '2E-7');
    assert.equal(formatResult(-2e-7), '-2E-7');
    assert.equal(formatResult(0.000001), '0.000001');
    assert.equal(formatResult(123456789012), '123456789012');
    assert.equal(formatResult(1234567890123), '1.23456789012E+12');
});

test('результат в E-нотации читается обратно (Р10)', () => {
    assert.equal(calc('2E-7+1'), '1.0000002');
    assert.equal(calc('1.5E+12/1E+12'), '1.5');
    assert.equal(calc('2e'), '5.43656365692'); // строчная e — число e, а не порядок
});

test('квадрат, куб и обратное значение применяются ко всему операнду', () => {
    assert.equal(calc('3²'), '9');
    assert.equal(calc('3³'), '27');
    assert.equal(calc('4⁻¹'), '0.25');
    assert.equal(calc('(2+1)²'), '9');
    // постфикс слабее степени: 2^3² — это (2^3)², а не 2^(3²)
    assert.equal(calc('2^3²'), '64');
    assert.equal(calc('5+2^3²'), '69');
    assert.equal(calc('2²^3'), '64');
    assert.equal(calc('2^3^2'), '512'); // правоассоциативная степень не изменилась
    assert.equal(calc('2⁻¹²'), '0.25'); // (1/2)²
    assert.ok(noValue('0⁻¹'));
});

test('mod, nCr и nPr — с приоритетом умножения', () => {
    assert.equal(calc('10mod3'), '1');
    assert.equal(calc('-10mod3'), '-1');
    assert.equal(calc('10mod3+1'), '2');
    assert.equal(calc('5nCr2'), '10');
    assert.equal(calc('5nPr2'), '20');
    assert.equal(calc('100nCr50'), '1.00891344546E+29');
    assert.equal(calc('2*10mod7'), '6');
    assert.ok(noValue('10mod0'));
    assert.ok(noValue('2nCr5'));
    assert.ok(noValue('2.5nCr1'));
});

test('гиперболические функции и кубический корень', () => {
    assert.equal(calc('sinh(0)'), '0');
    assert.equal(calc('cosh(0)'), '1');
    assert.equal(calc('tanh(0)'), '0');
    assert.equal(calc('asinh(0)'), '0');
    assert.equal(calc('acosh(1)'), '0');
    assert.equal(calc('atanh(0.5)'), '0.549306144334');
    assert.equal(calc('cbrt(27)'), '3');
    assert.equal(calc('cbrt(-8)'), '-2');
});

test('корень нечётной степени из отрицательного числа (Р8)', () => {
    assert.equal(calc('(-8)^(1/3)'), '-2');
    assert.equal(calc('(-32)^(1/5)'), '-2');
    assert.ok(noValue('(-8)^(2/3)'));
    assert.ok(noValue('(-8)^0.5'));
});

test('formatResult не печатает Infinity и NaN', () => {
    assert.equal(formatResult(Infinity), 'Ошибка');
    assert.equal(formatResult(-Infinity), 'Ошибка');
    assert.equal(formatResult(NaN), 'Ошибка');
    assert.equal(formatResult(1e308 * 10), 'Ошибка');
});

test('инженерный формат: показатель кратен трём', () => {
    assert.equal(formatResult(1234, 'eng'), '1.234E+3');
    assert.equal(formatResult(0.000123, 'eng'), '123E-6');
    assert.equal(formatResult(999, 'eng'), '999');
    assert.equal(formatResult(-1234, 'eng'), '-1.234E+3');
    assert.equal(formatResult(1, 'eng'), '1');
});

test('длинные выражения: цепочка любой длины, вложенность — с понятным пределом', () => {
    const sum = '1+1+'.repeat(5000) + '1';
    assert.equal(calc(sum), '10001');

    const nested = '('.repeat(400) + '1' + ')'.repeat(400);
    assert.equal(calc(nested), '1');

    const tooDeep = '('.repeat(4000) + '1' + ')'.repeat(4000);
    assert.throws(() => evaluateExpression(tooDeep, true), (error) => {
        assert.ok(error instanceof SyntaxError);
        assert.match(error.message, /Слишком сложное выражение/);
        return true;
    }, 'глубина 4000 не должна ронять стек');
});

