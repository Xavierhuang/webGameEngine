/**
 * Two-way serializer between Blockly workspace JSON (Blockly.serialization
 * format) and lingplay's LogicBlock[] model. Pure — no Blockly import, no DOM —
 * so it runs in the node test suite.
 *
 * Relies on the naming conventions in ./definitions (field/input names match
 * LogicBlock input keys; statement inputs are 'children'/'elseChildren';
 * expression blocks are 'expr_<op>' with arg0..argN + optional 'value' field).
 */

import type { Expr, ExprValue, LogicBlock } from '../../types/game';
import { HAT_TYPES } from '../runtime/interpreter';
import { BLOCK_SPECS } from './definitions';

type BJson = Record<string, any>;

// ---------------------------------------------------------------------------
// Blockly JSON -> LogicBlock[]
// ---------------------------------------------------------------------------

export function blocklyToLogic(workspaceJson: BJson): LogicBlock[] {
  const tops: BJson[] = workspaceJson?.blocks?.blocks ?? [];
  return tops.flatMap((b) => chainToLogic(b));
}

function chainToLogic(block: BJson | undefined): LogicBlock[] {
  const out: LogicBlock[] = [];
  let current = block;
  while (current) {
    out.push(blockToLogic(current));
    current = current.next?.block;
  }
  return out;
}

function blockToLogic(b: BJson): LogicBlock {
  if (b.type === 'procedures_defnoreturn') {
    const params: string[] = (b.extraState?.params ?? []).map((p: any) => String(typeof p === 'string' ? p : p.name));
    return strip({
      id: b.id,
      block_type: 'define_custom_block',
      inputs: { name: String(b.fields?.NAME ?? ''), params } as unknown as LogicBlock['inputs'],
      children: chainToLogicOrUndefined(b.inputs?.STACK?.block),
    });
  }
  if (b.type === 'procedures_callnoreturn') {
    const paramNames: string[] = (b.extraState?.params ?? []).map((p: any) => String(typeof p === 'string' ? p : p.name));
    const inputs: Record<string, Expr | ExprValue> = { name: String(b.extraState?.name ?? '') };
    paramNames.forEach((p, i) => {
      const e = inputExpr(b.inputs?.[`ARG${i}`]);
      if (e !== undefined) inputs[p] = e;
    });
    return strip({ id: b.id, block_type: 'call_custom_block', inputs });
  }

  const spec = BLOCK_SPECS[b.type];
  const inputs: Record<string, Expr | ExprValue> = {};
  if (spec) {
    for (const f of spec.fields) {
      if (b.fields?.[f] !== undefined) inputs[f] = b.fields[f];
    }
    for (const v of spec.values) {
      const e = inputExpr(b.inputs?.[v]);
      if (e !== undefined) inputs[v] = e;
    }
  } else if (b.fields) {
    // Unknown block type: preserve fields so nothing is silently lost.
    for (const [k, v] of Object.entries(b.fields)) inputs[k] = v as ExprValue;
  }
  const out: LogicBlock = { id: b.id, block_type: b.type, inputs };
  if (spec) {
    for (const s of spec.statements) {
      const kids = chainToLogicOrUndefined(b.inputs?.[s]?.block);
      if (s === 'children') out.children = kids;
      else if (s === 'elseChildren') out.elseChildren = kids;
    }
  }
  return strip(out);
}

function chainToLogicOrUndefined(block: BJson | undefined): LogicBlock[] | undefined {
  if (!block) return undefined;
  const chain = chainToLogic(block);
  return chain.length ? chain : undefined;
}

function inputExpr(conn: BJson | undefined): Expr | ExprValue | undefined {
  const inner = conn?.block ?? conn?.shadow;
  if (!inner) return undefined;
  return exprFromBlockly(inner);
}

function exprFromBlockly(b: BJson): Expr | ExprValue {
  if (b.type === 'expr_number' || b.type === 'math_number') return Number(b.fields?.NUM ?? 0);
  if (b.type === 'expr_text' || b.type === 'text') return String(b.fields?.TEXT ?? '');
  const op = b.type.startsWith('expr_') ? b.type.slice(5) : b.type;
  const out: Expr = { op };
  if (b.fields?.value !== undefined) out.value = b.fields.value;
  const spec = BLOCK_SPECS[b.type];
  const valueInputs = spec?.values ?? [];
  if (valueInputs.length > 0) {
    out.args = valueInputs.map((name) => {
      const e = inputExpr(b.inputs?.[name]);
      if (e === undefined) return { op: 'literal', value: 0 } as Expr;
      return typeof e === 'object' ? e : ({ op: 'literal', value: e } as Expr);
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// LogicBlock[] -> Blockly JSON
// ---------------------------------------------------------------------------

export function logicToBlockly(blocks: LogicBlock[]): BJson {
  const tops: BJson[] = [];
  let currentTop: BJson | null = null;
  for (const lb of blocks ?? []) {
    const b = logicBlockToBlockly(lb);
    if (HAT_TYPES.has(lb.block_type) || !currentTop) {
      tops.push(b);
      currentTop = b;
    } else {
      currentTop.next = { block: b };
      currentTop = b;
    }
  }
  return { blocks: { languageVersion: 0, blocks: tops } };
}

function logicBlockToBlockly(lb: LogicBlock): BJson {
  const inputs = lb.inputs ?? {};
  if (lb.block_type === 'define_custom_block') {
    const params: string[] = Array.isArray(inputs.params)
      ? (inputs.params as unknown[]).map(String)
      : [];
    const out: BJson = {
      type: 'procedures_defnoreturn',
      id: lb.id,
      fields: { NAME: String(inputs.name ?? '') },
      extraState: { params: params.map((name) => ({ name, id: name })) },
    };
    const stack = blocksToChain(lb.children);
    if (stack) out.inputs = { STACK: { block: stack } };
    return out;
  }
  if (lb.block_type === 'call_custom_block') {
    const paramNames = Object.keys(inputs).filter((k) => k !== 'name');
    const out: BJson = {
      type: 'procedures_callnoreturn',
      id: lb.id,
      extraState: { name: String(inputs.name ?? ''), params: paramNames },
    };
    const argInputs: BJson = {};
    paramNames.forEach((p, i) => {
      const conn = exprToBlocklyConn(inputs[p]);
      if (conn) argInputs[`ARG${i}`] = conn;
    });
    if (Object.keys(argInputs).length) out.inputs = argInputs;
    return out;
  }

  const spec = BLOCK_SPECS[lb.block_type];
  const out: BJson = { type: lb.block_type, id: lb.id };
  if (spec) {
    const fields: BJson = {};
    const ins: BJson = {};
    for (const [key, v] of Object.entries(inputs)) {
      if (key === 'params') continue;
      if (spec.fields.includes(key)) fields[key] = v;
      else if (spec.values.includes(key)) {
        const conn = exprToBlocklyConn(v as Expr | ExprValue);
        if (conn) ins[key] = conn;
      } else if (typeof v !== 'object') {
        fields[key] = v; // unknown key: preserve as a field
      }
    }
    if (Object.keys(fields).length) out.fields = fields;
    if (lb.children?.length) ins.children = { block: blocksToChain(lb.children) };
    if (lb.elseChildren?.length) ins.elseChildren = { block: blocksToChain(lb.elseChildren) };
    if (Object.keys(ins).length) out.inputs = ins;
  }
  return out;
}

function blocksToChain(blocks: LogicBlock[] | undefined): BJson | undefined {
  if (!blocks?.length) return undefined;
  const converted = blocks.map(logicBlockToBlockly);
  for (let i = 0; i < converted.length - 1; i++) {
    converted[i].next = { block: converted[i + 1] };
  }
  return converted[0];
}

function exprToBlocklyConn(e: Expr | ExprValue | undefined): BJson | undefined {
  if (e === undefined || e === null) return undefined;
  if (typeof e !== 'object') return { shadow: literalBlock(e) };
  if (e.op === 'literal') return { shadow: literalBlock(e.value ?? 0) };
  return { block: exprToBlockly(e) };
}

function exprToBlockly(e: Expr): BJson {
  const out: BJson = { type: `expr_${e.op}`, id: genId() };
  if (e.value !== undefined) out.fields = { value: e.value };
  if (e.args?.length) {
    const ins: BJson = {};
    e.args.forEach((arg, i) => {
      const conn = exprToBlocklyConn(arg);
      if (conn) ins[`arg${i}`] = conn;
    });
    if (Object.keys(ins).length) out.inputs = ins;
  }
  return out;
}

function literalBlock(v: ExprValue): BJson {
  if (typeof v === 'boolean') return { type: 'expr_number', id: genId(), fields: { NUM: v ? 1 : 0 } };
  if (typeof v === 'number') return { type: 'expr_number', id: genId(), fields: { NUM: v } };
  return { type: 'expr_text', id: genId(), fields: { TEXT: String(v) } };
}

function genId(): string {
  return Math.random().toString(36).slice(2, 12);
}

function strip<T extends Record<string, any>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

// ---------------------------------------------------------------------------
// DB rows -> LogicBlock[] (editor load path)
// ---------------------------------------------------------------------------

/**
 * Normalize logic_blocks table rows (as returned by the project GET route)
 * into LogicBlock[]. Legacy rows carry parameters inside block_data; new rows
 * fold inputs/children/elseChildren there too. A legacy on_key_press hat with
 * an `action` gets its synthesized body block appended right after the hat so
 * the editor shows (and re-saves) it as an explicit block.
 */
export function normalizeDbBlocks(rows: any[]): LogicBlock[] {
  const sorted = [...(rows ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const out: LogicBlock[] = [];
  for (const row of sorted) {
    const data = typeof row.block_data === 'string' ? JSON.parse(row.block_data || '{}') : row.block_data ?? {};
    const inputs: Record<string, any> = { ...(data.inputs ?? {}), ...(row.inputs ?? {}) };
    // Fold leftover legacy scalars (key, action, direction, ...) into inputs.
    for (const [k, v] of Object.entries(data)) {
      if (k === 'inputs' || k === 'children' || k === 'elseChildren' || k === 'parameter') continue;
      if ((v === null || typeof v !== 'object') && inputs[k] === undefined) inputs[k] = v;
    }
    for (const [k, v] of Object.entries(data.parameter ?? {})) {
      if ((v === null || typeof v !== 'object') && inputs[k] === undefined) inputs[k] = v;
    }
    const block: LogicBlock = strip({
      id: row.id,
      block_type: row.block_type,
      category: row.category ?? undefined,
      inputs: Object.keys(inputs).length ? inputs : undefined,
      children: row.children ?? data.children,
      elseChildren: row.elseChildren ?? data.elseChildren,
    });
    out.push(block);
    const legacy = legacyBodyBlock(block);
    if (legacy) out.push(legacy);
  }
  return out;
}

/** Mirror of the interpreter's legacy hat-body synthesis (move/jump from hat action). */
function legacyBodyBlock(hat: LogicBlock): LogicBlock | null {
  if (hat.block_type !== 'on_key_press' || hat.children?.length) return null;
  const inputs = hat.inputs ?? {};
  const action = String(inputs.action ?? '');
  const key = String(inputs.key ?? inputs.direction ?? '').toUpperCase();
  const mk = (direction: string): LogicBlock => ({
    id: `${hat.id}:legacy`,
    block_type: 'move',
    inputs: { direction, distance: 500 },
  });
  switch (action) {
    case 'move_up': return mk('up');
    case 'move_down': return mk('down');
    case 'move_left': return mk('left');
    case 'move_right': return mk('right');
    case 'jump': return { id: `${hat.id}:legacy`, block_type: 'jump' };
  }
  if (key === 'UP' || key === 'ARROWUP') return mk('up');
  if (key === 'DOWN' || key === 'ARROWDOWN') return mk('down');
  if (key === 'LEFT' || key === 'ARROWLEFT') return mk('left');
  if (key === 'RIGHT' || key === 'ARROWRIGHT') return mk('right');
  if (key === 'SPACE') return { id: `${hat.id}:legacy`, block_type: 'jump' };
  return null;
}
