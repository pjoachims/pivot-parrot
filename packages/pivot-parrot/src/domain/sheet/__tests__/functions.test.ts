import { describe, it, expect } from 'vitest';
import { completionName, functionMatches, functionSlot, toEngineFormula } from '../functions';

describe('toEngineFormula', () => {
  it('turns German names and AVG into the engine names', () => {
    expect(toEngineFormula('=SUMME(B2:B5)')).toBe('=SUM(B2:B5)');
    expect(toEngineFormula('=MITTELWERT(B2,B3)/AVG(C2,C3)')).toBe('=AVERAGE(B2,B3)/AVERAGE(C2,C3)');
    expect(toEngineFormula('=LÄNGE(A2)+ANZAHL2(A2,A3)')).toBe('=LEN(A2)+COUNTA(A2,A3)');
    expect(toEngineFormula('=summe(b2)')).toBe('=SUM(b2)');
  });

  it('maps dotted names, English and German, to the engine key', () => {
    expect(toEngineFormula('=STDEV.S(B2,B3)+STABW.S(B2,B3)+STABW.N(B2,B3)')).toBe('=STDEVS(B2,B3)+STDEVS(B2,B3)+STDEVP(B2,B3)');
  });

  it('turns semicolons into commas, nested calls included', () => {
    expect(toEngineFormula('=WENN(SUMME(B2;B3)>100;RUNDEN(B2/3;1);0)')).toBe('=IF(SUM(B2,B3)>100,ROUND(B2/3,1),0)');
  });

  it('leaves quoted text alone, escaped quotes included', () => {
    expect(toEngineFormula('=WENN(B2>1;"SUMME(a;b)";"x""SUMME(;""")')).toBe('=IF(B2>1,"SUMME(a;b)","x""SUMME(;""")');
  });

  it('leaves English names, cell references and unknown names as they are', () => {
    expect(toEngineFormula('=SUM(B2,B3)*2')).toBe('=SUM(B2,B3)*2');
    expect(toEngineFormula('=SUMME1(B2)+SUM1+XSUMME(B2)')).toBe('=SUMME1(B2)+SUM1+XSUMME(B2)');
    expect(toEngineFormula('=SUMME+B2')).toBe('=SUMME+B2');
  });
});

describe('functionMatches', () => {
  const names = (prefix: string) => functionMatches(prefix).map(f => f.name);

  it('matches English names first, then German ones', () => {
    expect(names('mi')).toEqual(['MIN', 'AVERAGE']);
    expect(names('SU')).toEqual(['SUM']);
    expect(names('SUMM')).toEqual(['SUM']);
    expect(names('ROUND')).toEqual(['ROUND', 'ROUNDUP', 'ROUNDDOWN']);
    expect(names('stabw.')).toEqual(['STDEV.S', 'STDEV.P']);
  });

  it('matches nothing for an empty or unknown prefix', () => {
    expect(names('')).toEqual([]);
    expect(names('XYZ')).toEqual([]);
  });

  it('inserts the German name only where the German name alone was typed', () => {
    const [min, average] = functionMatches('MI');
    expect(completionName(min, 'MI')).toBe('MIN');
    expect(completionName(average, 'MI')).toBe('MITTELWERT');
    expect(completionName(functionMatches('A')[0], 'A')).toBe('AVERAGE');
  });
});

describe('functionSlot', () => {
  const slot = (text: string, caret = text.length) => functionSlot(text, caret);

  it('finds the partial name where a function may start', () => {
    expect(slot('=SU')).toEqual([1, 3]);
    expect(slot('=B2+MIT')).toEqual([4, 7]);
    expect(slot('=WENN(B2>1;SU')).toEqual([11, 13]);
    expect(slot('=SUM(B2, ab')).toEqual([9, 11]);
    expect(slot('=STABW.')).toEqual([1, 7]);
    expect(slot('=ZÄ')).toEqual([1, 3]);
  });

  it('finds nothing without a name, in text, mid-word, after a colon or on a cell reference', () => {
    expect(slot('=')).toBeNull();
    expect(slot('SU')).toBeNull();
    expect(slot('=SUM(')).toBeNull();
    expect(slot('="SU')).toBeNull();
    expect(slot('=SUM(B2:B')).toBeNull();
    expect(slot('=B2')).toBeNull();
    expect(slot('=$B$2')).toBeNull();
    expect(slot('=SUMME(B2)', 3)).toBeNull();
  });
});
