/** Names and explanations of module roles, shared by the legend and the module probe. */

import type { QrSymbol } from './qr/encoder';
import { Role, type RoleId } from './qr/matrix';

export interface RoleMeta {
  id: RoleId;
  name: string;
  plural: string;
  /** One sentence on what the region is for. */
  purpose: string;
}

export const ROLES: RoleMeta[] = [
  {
    id: Role.Finder,
    name: 'Finder pattern',
    plural: 'Finder patterns',
    purpose:
      'Three 7×7 targets with a 1:1:3:1:1 profile from any angle, so a camera can find the code and its orientation.',
  },
  {
    id: Role.Separator,
    name: 'Separator',
    plural: 'Separators',
    purpose: 'A one-module light border that keeps each finder pattern distinct from the data.',
  },
  {
    id: Role.Timing,
    name: 'Timing pattern',
    plural: 'Timing patterns',
    purpose: 'Alternating dark and light modules on row 6 and column 6 that give the module pitch.',
  },
  {
    id: Role.Alignment,
    name: 'Alignment pattern',
    plural: 'Alignment patterns',
    purpose:
      '5×5 targets (version 2 and up) that let a reader correct for perspective and curvature.',
  },
  {
    id: Role.Format,
    name: 'Format information',
    plural: 'Format information',
    purpose: 'Error-correction level and mask number, BCH-protected, stored twice.',
  },
  {
    id: Role.Version,
    name: 'Version information',
    plural: 'Version information',
    purpose: 'The version number (7 and up), BCH-protected, stored twice.',
  },
  {
    id: Role.DarkModule,
    name: 'Dark module',
    plural: 'Dark module',
    purpose: 'A single module that is always dark, beside the bottom-left finder.',
  },
  {
    id: Role.Data,
    name: 'Data codeword',
    plural: 'Data codewords',
    purpose:
      'The message itself: mode, length, characters, terminator and padding, 8 bits per codeword.',
  },
  {
    id: Role.Ec,
    name: 'Error-correction codeword',
    plural: 'EC codewords',
    purpose: 'Reed–Solomon check symbols computed from the data codewords of the same block.',
  },
  {
    id: Role.Remainder,
    name: 'Remainder bit',
    plural: 'Remainder bits',
    purpose: 'Leftover modules after the last codeword; always 0 before masking.',
  },
];

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

export const hex2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

export interface ProbeInfo {
  row: number;
  col: number;
  role: RoleMeta;
  /** Short label, e.g. "Data codeword". */
  title: string;
  /** Detail line, e.g. "Bit 3 of codeword 12 in block 2". */
  detail: string;
  /** Codeword index in the final sequence, when the module belongs to one. */
  sequence: number | null;
  block: number | null;
}

const FORMAT_FIELDS = (bit: number) =>
  bit >= 13 ? 'error-correction level' : bit >= 10 ? 'mask pattern' : 'BCH check bit';

export function probe(symbol: QrSymbol, index: number): ProbeInfo {
  const { size } = symbol;
  const row = Math.floor(index / size);
  const col = index % size;
  const roleId = symbol.roles[index] as RoleId;
  const role = ROLE_BY_ID.get(roleId) ?? ROLES[0];
  let detail = role.purpose;
  let sequence: number | null = null;
  let block: number | null = null;

  if (roleId === Role.Data || roleId === Role.Ec) {
    const seq = symbol.codewordAt[index];
    const info = symbol.codewordInfo[seq];
    const bit = symbol.bitAt[index];
    const b = symbol.blocks[info.block];
    sequence = seq;
    block = info.block;
    const value = info.isEc ? b.ec[info.indexInBlock - b.data.length] : b.data[info.indexInBlock];
    const n = info.isEc ? info.indexInBlock - b.data.length + 1 : info.indexInBlock + 1;
    const kind = info.isEc ? 'EC codeword' : 'data codeword';
    detail = `Bit ${bit} of ${kind} ${n} in block ${info.block + 1} · value 0x${hex2(value)} · #${seq + 1} of ${symbol.codewords.length} in the placement order`;
  } else if (roleId === Role.Format || roleId === Role.Version) {
    const bit = symbol.geometry.infoBit[index];
    const copy = symbol.geometry.infoCopy[index];
    const total = roleId === Role.Format ? 14 : 17;
    const value = roleId === Role.Format ? symbol.formatBits : (symbol.versionBits ?? 0);
    const field =
      roleId === Role.Format
        ? ` (${FORMAT_FIELDS(bit)})`
        : bit >= 12
          ? ' (version number)'
          : ' (BCH check bit)';
    detail = `Bit ${bit} of ${total}…0${field}, copy ${copy} · value ${(value >>> bit) & 1}`;
  } else if (roleId === Role.Remainder) {
    detail = `${role.purpose} Version ${symbol.version} has ${symbol.geometry.path.length - symbol.codewords.length * 8}.`;
  }
  return { row, col, role, title: role.name, detail, sequence, block };
}
