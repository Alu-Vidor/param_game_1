import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPolynomial, parseMatrix, parsePolynomial, polynomialDegree } from '../src/lib/polynomial.ts';

test('accepts the original notebook matrix and decimal commas', () => {
  assert.deepEqual(parsePolynomial('2 + 0.1*t'), [2, 0.1]);
  assert.deepEqual(parsePolynomial('1 − 0,05t'), [1, -0.05]);
  assert.deepEqual(parsePolynomial('.5t + 1e-3'), [0.001, 0.5]);
});

test('expands polynomial expressions with implicit multiplication and parentheses', () => {
  assert.deepEqual(parsePolynomial('2(t+1)(t-1)'), [-2, 0, 2]);
  assert.deepEqual(parsePolynomial('(t+1)^3'), [1, 3, 3, 1]);
  assert.deepEqual(parsePolynomial('(2t^2 + 4t)/2'), [0, 2, 1]);
  assert.deepEqual(parsePolynomial('t*t - t^2 + 4'), [4]);
});

test('uses mathematical precedence for unary signs and exponentiation', () => {
  assert.deepEqual(parsePolynomial('-t^2'), [0, 0, -1]);
  assert.deepEqual(parsePolynomial('(-t)**2'), [0, 0, 1]);
  assert.deepEqual(parsePolynomial('t^2^3'), [0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(parsePolynomial('t^0 + +2 - -3'), [6]);
});

test('rejects non-polynomial functions, unsafe code, and invalid denominators', () => {
  for (const source of ['sin(t)', 'globalThis.alert(1)', 't;process.exit()', '1/(t+1)', 't^-1', 't^1.5', 't^t', '1/0', 't^13', '1e999']) {
    assert.throws(() => parsePolynomial(source), Error, source);
  }
});

test('rejects incomplete expressions and malformed numeric input', () => {
  for (const source of ['', '2+', '()', '(t+1', 't)', '2 3', '1,2,3', '1..2', 't/**2']) {
    assert.throws(() => parsePolynomial(source), Error, source);
  }
});

test('matrix errors identify the cell, and actual degree comes from the expressions', () => {
  const matrix = parseMatrix([['1', '2t'], ['t^3', 't-t']]);
  assert.equal(matrix.maxDegree, 3);
  assert.deepEqual(matrix.coefficients[1][1], [0]);
  assert.equal(polynomialDegree([1, 0, 0]), 0);
  assert.throws(() => parseMatrix([['1', '2'], ['0', 'sin(t)']]), /Строка 2, столбец 2/);
  assert.throws(() => parseMatrix([['1'], ['2', '3']]), /одинаковое число/);
});

test('formats coefficients without hiding small but nonzero terms', () => {
  assert.equal(formatPolynomial([2, -1, 3]), '3·t^2 − t + 2');
  assert.equal(formatPolynomial([0]), '0');
  assert.equal(formatPolynomial([1e-8]), '1e-8');
});
