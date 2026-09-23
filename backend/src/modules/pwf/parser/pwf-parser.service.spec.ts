import { PwfParseError, PwfParserService } from './pwf-parser.service.js';

describe('PwfParserService', () => {
  const parser = new PwfParserService();

  it('interprets DBAR, DGBT, DGER and DGEI while keeping byte offsets', () => {
    const source = createValidPwf();
    const parsed = parser.parse(source);

    expect(parsed.anaredeVersion).toBe('12.03.04');
    expect(parsed.compatibility).toBe('supported');
    expect(parsed.lineEnding).toBe('CRLF');
    expect(parsed.studyYear).toBe(2029);
    expect(parsed.buses).toHaveLength(1);
    expect(parsed.buses[0]).toMatchObject({
      number: 123,
      name: 'PARQUE EOL',
      type: 1,
      baseVoltageKv: 230,
      voltageMagnitude: 1,
      activeGenerationMw: 100,
      activeGenerationMinimumMw: 10,
      activeGenerationMaximumMw: 180,
    });
    expect(parsed.generatorGroups[0]).toMatchObject({
      busNumber: 123,
      groupNumber: 1,
      automaticMode: false,
      units: 4,
      unitsOnline: 3,
      activeGenerationPerUnitMw: 25,
      mechanicalLimitPerUnitMw: 50,
    });

    const pg = parsed.buses[0].activeGenerationField;
    expect(
      source
        .subarray(pg.byteOffset, pg.byteOffset + pg.width)
        .toString('latin1'),
    ).toBe('100.0');
  });

  it('marks a structurally readable but unknown version as unverified', () => {
    const source = Buffer.from(
      createValidPwf().toString('latin1').replace('12.03.04', '13.00.00'),
      'latin1',
    );
    const parsed = parser.parse(source);

    expect(parsed.compatibility).toBe('unverified');
    expect(parsed.warnings[0]).toContain('13.00.00');
  });

  it('rejects a file without a usable DBAR block', () => {
    const source = Buffer.from(
      '( Versao do Anarede: 12.03.04\r\nTITU\r\nCASO ANO 2029\r\nFIM\r\n',
      'latin1',
    );

    expect(() => parser.parse(source)).toThrow(PwfParseError);
  });
});

function createValidPwf(): Buffer {
  const dbar = fixedRecord(111, [
    [0, 5, '123', 'right'],
    [6, 7, 'L'],
    [7, 8, '1'],
    [8, 10, '1', 'right'],
    [10, 22, 'PARQUE EOL'],
    [24, 28, '1000', 'right'],
    [32, 37, '100.0', 'right'],
    [37, 42, '5.0', 'right'],
    [42, 47, '-20.0', 'right'],
    [47, 52, '40.0', 'right'],
    [73, 76, '5', 'right'],
  ]);
  const dger = fixedRecord(27, [
    [0, 5, '123', 'right'],
    [8, 14, '10.0', 'right'],
    [15, 21, '180.0', 'right'],
  ]);
  const dgei = fixedRecord(91, [
    [0, 5, '123', 'right'],
    [7, 8, 'N'],
    [9, 11, '1', 'right'],
    [12, 13, 'L'],
    [13, 16, '4', 'right'],
    [16, 19, '3', 'right'],
    [19, 22, '1', 'right'],
    [22, 27, '25.0', 'right'],
    [27, 32, '2.0', 'right'],
    [69, 74, '55.0', 'right'],
    [74, 80, '50.0', 'right'],
    [80, 86, '5.0', 'right'],
  ]);
  const content = [
    '(',
    '( Versao do Anarede: 12.03.04',
    'TITU',
    '** CASO MÁXIMA DIURNA ** ANO 2029',
    'DGBT',
    ' 1  230.',
    '99999',
    'DBAR',
    '(Num)OETGb(   nome   )Gl( V)( A)( Pg)',
    dbar,
    '99999',
    'DGER',
    dger,
    '99999',
    'DGEI',
    dgei,
    '99999',
    'FIM',
    '',
  ].join('\r\n');
  return Buffer.from(content, 'latin1');
}

type Field = [
  start: number,
  end: number,
  value: string,
  alignment?: 'left' | 'right',
];

function fixedRecord(width: number, fields: Field[]): string {
  const output = Array<string>(width).fill(' ');
  for (const [start, end, value, alignment = 'left'] of fields) {
    const fieldWidth = end - start;
    const formatted =
      alignment === 'right'
        ? value.padStart(fieldWidth)
        : value.padEnd(fieldWidth);
    output.splice(start, fieldWidth, ...formatted.slice(0, fieldWidth));
  }
  return output.join('');
}
