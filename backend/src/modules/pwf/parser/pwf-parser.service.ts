import { Injectable } from '@nestjs/common';
import type {
  ParsedPwfDocument,
  PwfBus,
  PwfFieldReference,
  PwfGeneratorGroup,
  PwfLineEnding,
} from '../domain/pwf.types.js';

const SUPPORTED_ANAREDE_VERSION = '12.3.4';
const RECOGNIZED_PWF_CODES = new Set([
  'TITU',
  'DAGR',
  'DARE',
  'DBAR',
  'DBSH',
  'DCAI',
  'DCBA',
  'DCCV',
  'DCER',
  'DCLI',
  'DCMT',
  'DCNV',
  'DCSC',
  'DCTE',
  'DCTG',
  'DCTR',
  'DELO',
  'DGBT',
  'DGEI',
  'DGER',
  'DGLT',
  'DLIN',
  'DOPC',
  'DREF',
  'DSHL',
  'DTPF',
  'DVSC',
  'EXLF',
]);

interface BufferLine {
  lineNumber: number;
  startByte: number;
  content: Buffer;
  text: string;
  ending: 'CRLF' | 'LF' | 'NONE';
}

export class PwfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PwfParseError';
  }
}

@Injectable()
export class PwfParserService {
  parse(buffer: Buffer): ParsedPwfDocument {
    this.validateInputBytes(buffer);

    const lines = splitBufferLines(buffer);
    const lineEnding = detectLineEnding(lines);
    const allText = lines.map((line) => line.text).join('\n');
    const versionMatch = allText.match(
      /^\(\s*Versao do Anarede:\s*([0-9.]+)/im,
    );

    if (!versionMatch) {
      throw new PwfParseError('O cabeçalho não informa a versão do ANAREDE.');
    }

    if (!lines.some((line) => line.text.trim() === 'FIM')) {
      throw new PwfParseError('O arquivo não possui o terminador FIM.');
    }

    const anaredeVersion = versionMatch[1];
    const compatibility =
      normalizeVersion(anaredeVersion) === SUPPORTED_ANAREDE_VERSION
        ? 'supported'
        : 'unverified';
    const warnings: string[] = [];

    if (compatibility === 'unverified') {
      warnings.push(
        `A versão ${anaredeVersion} foi interpretada estruturalmente, mas ainda não foi homologada.`,
      );
    }
    if (lineEnding === 'MIXED') {
      warnings.push('O arquivo mistura finais de linha CRLF e LF.');
    }

    const blocks = findBlocks(lines);
    const title = parseTitle(lines);
    const studyYear = parseStudyYear(title);
    const baseVoltages = parseBaseVoltages(lines);
    const generatorLimits = parseGeneratorLimits(lines);
    const buses = parseBuses(lines, baseVoltages, generatorLimits);
    const generatorGroups = parseGeneratorGroups(lines);

    if (buses.length === 0) {
      throw new PwfParseError(
        'O bloco DBAR está ausente ou não contém registros válidos.',
      );
    }

    const duplicateBus = firstDuplicate(buses.map((bus) => bus.number));
    if (duplicateBus !== undefined) {
      throw new PwfParseError(
        `A barra ${duplicateBus} aparece mais de uma vez no DBAR e o caso é ambíguo para edição.`,
      );
    }

    const duplicateGroup = firstDuplicate(
      generatorGroups.map((group) => `${group.busNumber}:${group.groupNumber}`),
    );
    if (duplicateGroup !== undefined) {
      throw new PwfParseError(
        `O grupo DGEI ${duplicateGroup} aparece mais de uma vez e o caso é ambíguo para edição.`,
      );
    }

    const knownBuses = new Set(buses.map((bus) => bus.number));
    for (const group of generatorGroups) {
      if (!knownBuses.has(group.busNumber)) {
        warnings.push(
          `O grupo DGEI ${group.busNumber}:${group.groupNumber} referencia uma barra inexistente no DBAR.`,
        );
      }
    }

    return {
      anaredeVersion,
      compatibility,
      encoding: 'latin1',
      lineEnding,
      title,
      studyYear,
      blocks,
      buses,
      generatorGroups,
      warnings,
    };
  }

  private validateInputBytes(buffer: Buffer): void {
    if (buffer.length === 0) {
      throw new PwfParseError('O arquivo PWF está vazio.');
    }
    if (buffer.includes(0)) {
      throw new PwfParseError(
        'O arquivo contém bytes NUL e parece ser binário, não um PWF textual.',
      );
    }
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xef &&
      buffer[1] === 0xbb &&
      buffer[2] === 0xbf
    ) {
      throw new PwfParseError(
        'Arquivos UTF-8 com BOM não são suportados; utilize o formato Latin-1 do ANAREDE.',
      );
    }

    const hasNonAscii = buffer.some((byte) => byte >= 0x80);
    if (hasNonAscii && isValidUtf8(buffer)) {
      throw new PwfParseError(
        'O arquivo parece usar UTF-8 multibyte; utilize o formato Latin-1 para preservar as colunas fixas.',
      );
    }
  }
}

function splitBufferLines(buffer: Buffer): BufferLine[] {
  const lines: BufferLine[] = [];
  let start = 0;
  let lineNumber = 1;

  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] !== 0x0a) continue;

    const hasCarriageReturn = index > start && buffer[index - 1] === 0x0d;
    const contentEnd = hasCarriageReturn ? index - 1 : index;
    const content = buffer.subarray(start, contentEnd);
    lines.push({
      lineNumber,
      startByte: start,
      content,
      text: content.toString('latin1'),
      ending: hasCarriageReturn ? 'CRLF' : 'LF',
    });
    start = index + 1;
    lineNumber += 1;
  }

  if (start < buffer.length || buffer.length === 0) {
    const content = buffer.subarray(start);
    lines.push({
      lineNumber,
      startByte: start,
      content,
      text: content.toString('latin1'),
      ending: 'NONE',
    });
  }

  return lines;
}

function detectLineEnding(lines: BufferLine[]): PwfLineEnding {
  const hasCrlf = lines.some((line) => line.ending === 'CRLF');
  const hasLf = lines.some((line) => line.ending === 'LF');
  if (hasCrlf && hasLf) return 'MIXED';
  if (hasCrlf) return 'CRLF';
  if (hasLf) return 'LF';
  return 'NONE';
}

function isValidUtf8(buffer: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function normalizeVersion(version: string): string {
  return version
    .split('.')
    .map((part) => String(Number(part)))
    .join('.');
}

function findBlocks(lines: BufferLine[]): string[] {
  const blocks: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.text.match(/^([A-Z][A-Z0-9]{3})(?:\s|$)/);
    if (!match || !RECOGNIZED_PWF_CODES.has(match[1]) || seen.has(match[1])) {
      continue;
    }
    seen.add(match[1]);
    blocks.push(match[1]);
  }
  return blocks;
}

function parseTitle(lines: BufferLine[]): string | undefined {
  const titleIndex = lines.findIndex((line) => /^TITU(?:\s|$)/.test(line.text));
  if (titleIndex < 0) return undefined;

  for (let index = titleIndex + 1; index < lines.length; index += 1) {
    const text = lines[index].text.trim();
    if (!text || text.startsWith('(')) continue;
    return text;
  }
  return undefined;
}

function parseStudyYear(title?: string): number | undefined {
  if (!title) return undefined;
  const match = title.match(/\bANO\s+((?:19|20)\d{2})\b/i);
  return match ? Number(match[1]) : undefined;
}

function blockRecords(lines: BufferLine[], code: string): BufferLine[] {
  const records: BufferLine[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!new RegExp(`^${code}(?:\\s|$)`).test(lines[index].text)) continue;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (line.text.startsWith('99999')) {
        index = cursor;
        break;
      }
      if (!line.text.trim() || line.text.startsWith('(')) continue;
      records.push(line);
    }
  }

  return records;
}

function parseBaseVoltages(lines: BufferLine[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const line of blockRecords(lines, 'DGBT')) {
    const group = parseOptionalIdentifier(line.text.slice(0, 2));
    const voltage = parseOptionalNumber(line.text.slice(3, 8));
    if (group !== undefined && voltage !== undefined) {
      result.set(group, voltage);
    }
  }
  return result;
}

function parseGeneratorLimits(
  lines: BufferLine[],
): Map<number, { minimum?: number; maximum?: number }> {
  const result = new Map<number, { minimum?: number; maximum?: number }>();
  for (const line of blockRecords(lines, 'DGER')) {
    const busNumber = parseRequiredInteger(
      line.text.slice(0, 5),
      'número da barra DGER',
      line.lineNumber,
    );
    result.set(busNumber, {
      minimum: parseOptionalNumber(line.text.slice(8, 14)),
      maximum: parseOptionalNumber(line.text.slice(15, 21)),
    });
  }
  return result;
}

function parseBuses(
  lines: BufferLine[],
  baseVoltages: Map<string, number>,
  generatorLimits: Map<number, { minimum?: number; maximum?: number }>,
): PwfBus[] {
  return blockRecords(lines, 'DBAR').map((line) => {
    if (line.content.length < 37) {
      throw new PwfParseError(
        `Registro DBAR curto demais na linha ${line.lineNumber}.`,
      );
    }

    const number = parseRequiredInteger(
      line.text.slice(0, 5),
      'número da barra DBAR',
      line.lineNumber,
    );
    const typeValue = parseOptionalInteger(line.text.slice(7, 8)) ?? 0;
    if (![0, 1, 2, 3].includes(typeValue)) {
      throw new PwfParseError(
        `Tipo de barra inválido na linha ${line.lineNumber}: ${typeValue}.`,
      );
    }

    const baseVoltageGroup = parseOptionalIdentifier(line.text.slice(8, 10));
    const operation = textField(line, 5, 6, 'A');
    const state = textField(line, 6, 7, 'L');
    const activeGeneration = numericField(line, 32, 37, 0);
    const limits = generatorLimits.get(number);

    return {
      number,
      name: line.text.slice(10, 22).trimEnd(),
      status: state.value,
      type: typeValue as 0 | 1 | 2 | 3,
      baseVoltageGroup,
      baseVoltageKv:
        baseVoltageGroup === undefined
          ? undefined
          : baseVoltages.get(baseVoltageGroup),
      voltageMagnitude: parseOptionalImplicitNumber(line.text.slice(24, 28), 1),
      voltageAngleDegrees: parseOptionalNumber(line.text.slice(28, 32)),
      activeGenerationMw: activeGeneration.value,
      reactiveGenerationMvar: parseOptionalNumber(line.text.slice(37, 42)) ?? 0,
      reactiveMinimumMvar: parseOptionalNumber(line.text.slice(42, 47)),
      reactiveMaximumMvar: parseOptionalNumber(line.text.slice(47, 52)),
      activeGenerationMinimumMw: limits?.minimum,
      activeGenerationMaximumMw: limits?.maximum,
      activeLoadMw: parseOptionalNumber(line.text.slice(58, 63)) ?? 0,
      reactiveLoadMvar: parseOptionalNumber(line.text.slice(63, 68)) ?? 0,
      area: parseOptionalInteger(line.text.slice(73, 76)),
      lineNumber: line.lineNumber,
      operationField: operation,
      stateField: state,
      activeGenerationField: activeGeneration,
    };
  });
}

function parseGeneratorGroups(lines: BufferLine[]): PwfGeneratorGroup[] {
  return blockRecords(lines, 'DGEI').map((line) => {
    if (line.content.length < 27) {
      throw new PwfParseError(
        `Registro DGEI curto demais na linha ${line.lineNumber}.`,
      );
    }

    const activeGeneration = numericField(line, 22, 27, 0);
    const state = line.text.slice(12, 13).trim().toUpperCase();

    return {
      busNumber: parseRequiredInteger(
        line.text.slice(0, 5),
        'número da barra DGEI',
        line.lineNumber,
      ),
      operation: line.text.slice(6, 7).trim() || 'A',
      automaticMode: line.text.slice(7, 8).trim().toUpperCase() === 'S',
      groupNumber: parseRequiredInteger(
        line.text.slice(9, 11),
        'número do grupo DGEI',
        line.lineNumber,
      ),
      status: state === 'D' ? 'off' : 'on',
      units: parseOptionalInteger(line.text.slice(13, 16)) ?? 1,
      unitsOnline: parseOptionalInteger(line.text.slice(16, 19)) ?? 1,
      minimumUnitsOnline: parseOptionalInteger(line.text.slice(19, 22)) ?? 1,
      activeGenerationPerUnitMw: activeGeneration.value,
      reactiveGenerationPerUnitMvar:
        parseOptionalNumber(line.text.slice(27, 32)) ?? 0,
      reactiveMinimumPerUnitMvar: parseOptionalNumber(line.text.slice(32, 37)),
      reactiveMaximumPerUnitMvar: parseOptionalNumber(line.text.slice(37, 42)),
      apparentPowerPerUnitMva: parseOptionalImplicitNumber(
        line.text.slice(69, 74),
        3,
      ),
      mechanicalLimitPerUnitMw: parseOptionalImplicitNumber(
        line.text.slice(74, 80),
        3,
      ),
      activeMinimumPerUnitMw: parseOptionalNumber(line.text.slice(80, 86)),
      lineNumber: line.lineNumber,
      activeGenerationField: activeGeneration,
    };
  });
}

function numericField(
  line: BufferLine,
  start: number,
  end: number,
  defaultValue: number,
): PwfFieldReference<number> {
  const rawValue = line.text.slice(start, end);
  return {
    value: parseOptionalNumber(rawValue) ?? defaultValue,
    byteOffset: line.startByte + start,
    width: end - start,
    rawValue,
  };
}

function textField(
  line: BufferLine,
  start: number,
  end: number,
  defaultValue: string,
): PwfFieldReference<string> {
  const rawValue = line.text.slice(start, end);
  return {
    value: rawValue.trim() || defaultValue,
    byteOffset: line.startByte + start,
    width: end - start,
    rawValue,
  };
}

function parseRequiredInteger(
  value: string,
  field: string,
  lineNumber: number,
): number {
  const parsed = parseOptionalInteger(value);
  if (parsed === undefined) {
    throw new PwfParseError(
      `Não foi possível ler ${field} na linha ${lineNumber}.`,
    );
  }
  return parsed;
}

function parseOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^[+-]?\d+$/.test(trimmed)) return undefined;
  return Number.parseInt(trimmed, 10);
}

function parseOptionalIdentifier(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalImplicitNumber(
  value: string,
  integerWidth: number,
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes('.') || /[Ee]/.test(trimmed)) {
    return parseOptionalNumber(trimmed);
  }
  if (trimmed === '99999' || trimmed === '-9999') {
    return Number(trimmed);
  }

  const withDecimal = `${value.slice(0, integerWidth)}.${value.slice(integerWidth)}`;
  return parseOptionalNumber(withDecimal);
}

function firstDuplicate<T>(items: T[]): T | undefined {
  const seen = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return undefined;
}
