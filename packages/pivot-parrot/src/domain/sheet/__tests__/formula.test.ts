import { describe, it, expect } from 'vitest';
import { formulaReferences, putReference, rangeAddress, referenceSlot, spanOf, step } from '../formula';

const at = (text: string) => referenceSlot(text, text.length);

describe('referenceSlot', () => {
  it('opens where a reference may go: after =, an operator, (, a comma or a range colon', () => {
    for (const text of ['=', '=B3/', '=SUM(', '=SUM(B3,', '=B3 + ', '=B3:', '=IF(B3>']) {
      expect(at(text)).toEqual([text.length, text.length]);
    }
  });

  it('takes the reference right before the caret, so the next pick replaces it', () => {
    expect(at('=B3')).toEqual([1, 3]);
    expect(at('=B3/H7')).toEqual([4, 6]);
    expect(at('=SUM(B3:B7')).toEqual([5, 10]);
    expect(at('=$b$3')).toEqual([1, 5]);
  });

  it('stays shut for text, after a number or a name, inside quotes and in the middle of a token', () => {
    expect(at('abc')).toBeNull();
    expect(at('=2')).toBeNull();
    expect(at('=SUM')).toBeNull();
    expect(at('=B3)')).toBeNull();
    expect(at('=IF(B3>0,"a')).toBeNull();
    expect(at('=IF(B3>0,"a",')).toEqual([13, 13]);
    expect(referenceSlot('=B3+C4', 4)).toBeNull();
    expect(referenceSlot('=B3+)', 4)).toEqual([4, 4]);
  });
});

describe('putReference', () => {
  it('inserts at an empty slot and replaces a picked reference, caret after it', () => {
    expect(putReference('=B3/', [4, 4], 'H7')).toEqual({ text: '=B3/H7', caret: 6 });
    expect(putReference('=B3/H7', [4, 6], 'H8')).toEqual({ text: '=B3/H8', caret: 6 });
    expect(putReference('=SUM()', [5, 5], 'B3:B7')).toEqual({ text: '=SUM(B3:B7)', caret: 10 });
  });
});

describe('formulaReferences', () => {
  it('lists cells and ranges in order, lower case too', () => {
    expect(formulaReferences('=b3/H7+SUM($C$1:C4)')).toEqual([
      { x0: 1, y0: 2, x1: 1, y1: 2 },
      { x0: 7, y0: 6, x1: 7, y1: 6 },
      { x0: 2, y0: 0, x1: 2, y1: 3 }
    ]);
  });

  it('a range written backwards is the same rectangle', () => {
    expect(formulaReferences('=SUM(C4:A1)')).toEqual([{ x0: 0, y0: 0, x1: 2, y1: 3 }]);
  });

  it('skips quoted text, function names with digits and non-formulas', () => {
    expect(formulaReferences('=IF(A1>0,"B2","")')).toEqual([{ x0: 0, y0: 0, x1: 0, y1: 0 }]);
    expect(formulaReferences('=LOG10(A1)')).toEqual([{ x0: 0, y0: 0, x1: 0, y1: 0 }]);
    expect(formulaReferences('B3')).toEqual([]);
  });
});

describe('addresses and steps', () => {
  it('names a cell or a range', () => {
    expect(rangeAddress(spanOf({ x: 1, y: 2 }, { x: 1, y: 2 }))).toBe('B3');
    expect(rangeAddress(spanOf({ x: 7, y: 6 }, { x: 1, y: 2 }))).toBe('B3:H7');
  });

  it('moves one cell and stops at the edges', () => {
    expect(step({ x: 0, y: 0 }, 'ArrowLeft', 5, 5)).toEqual({ x: 0, y: 0 });
    expect(step({ x: 0, y: 0 }, 'ArrowDown', 5, 5)).toEqual({ x: 0, y: 1 });
    expect(step({ x: 4, y: 4 }, 'ArrowRight', 5, 5)).toEqual({ x: 4, y: 4 });
  });
});
