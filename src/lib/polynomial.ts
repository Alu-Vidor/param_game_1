/** Polynomial coefficients are stored in ascending order: [constant, t, t², …]. */
const MAX_DEGREE = 12;
const MAX_INPUT_LENGTH = 2000;

type Token = { kind: 'number'; value: number } | { kind: 't' | '+' | '-' | '*' | '/' | '^' | '(' | ')' | 'end' };

function normalize(values: number[]): number[] {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Слишком большие числа в формуле. Уменьшите коэффициенты или степень.');
  }
  while (values.length > 1 && values[values.length - 1] === 0) values.pop();
  if (values.length > MAX_DEGREE + 1) {
    throw new Error(`Максимальная поддерживаемая степень многочлена — ${MAX_DEGREE}.`);
  }
  return values.length ? values.map((value) => Object.is(value, -0) ? 0 : value) : [0];
}

function add(left: number[], right: number[], sign = 1): number[] {
  return normalize(Array.from({ length: Math.max(left.length, right.length) }, (_, i) => (left[i] ?? 0) + sign * (right[i] ?? 0)));
}

function multiply(left: number[], right: number[]): number[] {
  const product = Array(left.length + right.length - 1).fill(0) as number[];
  left.forEach((a, i) => right.forEach((b, j) => { product[i + j] += a * b; }));
  return normalize(product);
}

function tokenize(input: string): Token[] {
  if (!input.trim()) throw new Error('Введите число или многочлен от t.');
  if (input.length > MAX_INPUT_LENGTH) throw new Error('Слишком длинная формула. Сократите её.');
  const source = input.replace(/[−–—]/g, '-').replace(/[·×]/g, '*').replace(/\*\*/g, '^');
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }
    const number = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (number) {
      const value = Number(number[0].replace(',', '.'));
      if (!Number.isFinite(value)) throw new Error('Коэффициенты должны быть конечными числами.');
      tokens.push({ kind: 'number', value });
      index += number[0].length;
      continue;
    }
    if ('t+-*/^()'.includes(char)) {
      tokens.push({ kind: char as Exclude<Token['kind'], 'number' | 'end'> });
      index++;
      continue;
    }
    throw new Error(`Недопустимый символ «${char}». Используйте числа, t, +, −, *, /, ^ и скобки.`);
  }
  tokens.push({ kind: 'end' });
  return tokens;
}

/** Parse arithmetic into a polynomial without evaluating JavaScript or Python. */
export function parsePolynomial(input: string): number[] {
  const tokens = tokenize(input);
  let cursor = 0;
  let depth = 0;
  const peek = () => tokens[cursor].kind;

  function expression(): number[] {
    let value = product();
    while (peek() === '+' || peek() === '-') {
      const sign = tokens[cursor++].kind === '+' ? 1 : -1;
      value = add(value, product(), sign);
    }
    return value;
  }

  function product(): number[] {
    let value = unary();
    while (peek() === '*' || peek() === '/' || peek() === 't' || peek() === '(') {
      const operator = peek();
      if (operator === '*' || operator === '/') cursor++;
      const right = unary();
      if (operator === '/') {
        if (right.length !== 1) throw new Error('Делить можно только на постоянное число. Элемент матрицы должен быть многочленом.');
        if (right[0] === 0) throw new Error('Деление на ноль недопустимо.');
        value = normalize(value.map((coefficient) => coefficient / right[0]));
      } else {
        value = multiply(value, right);
      }
    }
    return value;
  }

  function unary(): number[] {
    if (++depth > 100) throw new Error('Слишком много вложенных операций или скобок.');
    let value: number[];
    if (peek() === '+') { cursor++; value = unary(); }
    else if (peek() === '-') { cursor++; value = unary().map((coefficient) => -coefficient); }
    else value = power();
    depth--;
    return value;
  }

  function power(): number[] {
    let value = primary();
    if (peek() === '^') {
      cursor++;
      const exponent = unary();
      if (exponent.length !== 1 || !Number.isInteger(exponent[0]) || exponent[0] < 0 || exponent[0] > MAX_DEGREE) {
        throw new Error(`Степень должна быть целым числом от 0 до ${MAX_DEGREE}.`);
      }
      const base = value;
      value = [1];
      for (let i = 0; i < exponent[0]; i++) value = multiply(value, base);
    }
    return value;
  }

  function primary(): number[] {
    const token = tokens[cursor];
    if (token.kind === 'number') { cursor++; return [token.value]; }
    if (token.kind === 't') { cursor++; return [0, 1]; }
    if (token.kind === '(') {
      cursor++;
      const value = expression();
      if (peek() !== ')') throw new Error('Не хватает закрывающей скобки «)».');
      cursor++;
      return value;
    }
    throw new Error('Некорректная формула. После знака операции укажите число, t или выражение в скобках.');
  }

  const result = expression();
  if (peek() !== 'end') {
    throw new Error(peek() === ')' ? 'Лишняя закрывающая скобка «)».' : 'Между числами нужен знак операции.');
  }
  return normalize(result);
}

export function polynomialDegree(coefficients: number[]): number {
  for (let index = coefficients.length - 1; index > 0; index--) {
    if (coefficients[index] !== 0) return index;
  }
  return 0;
}

export function formatPolynomial(coefficients: number[], digits = 4): string {
  const precision = Math.max(0, Math.min(12, Math.floor(digits)));
  const terms: string[] = [];
  for (let exponent = coefficients.length - 1; exponent >= 0; exponent--) {
    const coefficient = coefficients[exponent];
    if (coefficient === 0) continue;
    const absolute = Math.abs(coefficient);
    const formatted = absolute < 10 ** -precision || absolute >= 1e10
      ? absolute.toExponential(precision).replace(/\.?0+e/, 'e')
      : Number(absolute.toFixed(precision)).toString();
    const magnitude = exponent > 0 && absolute === 1 ? '' : formatted;
    const variable = exponent === 0 ? '' : exponent === 1 ? 't' : `t^${exponent}`;
    const term = `${magnitude}${magnitude && variable ? '·' : ''}${variable}`;
    const prefix = terms.length ? (coefficient < 0 ? ' − ' : ' + ') : (coefficient < 0 ? '−' : '');
    terms.push(prefix + term);
  }
  return terms.join('') || '0';
}

export function parseMatrix(matrix: string[][]): { coefficients: number[][][]; maxDegree: number } {
  if (!matrix.length || !matrix[0]?.length) throw new Error('Матрица не должна быть пустой.');
  const width = matrix[0].length;
  let maxDegree = 0;
  const coefficients = matrix.map((row, rowIndex) => {
    if (row.length !== width) throw new Error('Во всех строках матрицы должно быть одинаковое число элементов.');
    return row.map((cell, columnIndex) => {
      try {
        const result = parsePolynomial(cell);
        maxDegree = Math.max(maxDegree, polynomialDegree(result));
        return result;
      } catch (error) {
        throw new Error(`Строка ${rowIndex + 1}, столбец ${columnIndex + 1}: ${error instanceof Error ? error.message : 'Некорректная формула.'}`);
      }
    });
  });
  return { coefficients, maxDegree };
}
