// Проверки движка счёта: node --test tests/
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
