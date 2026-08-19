const ts = require('typescript');

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const ACTOR_IMPORT = '@/lib/auth/actor';
const ACTOR_NAMES = new Set(['resolveActor', 'resolveCurrentActor']);
const BOUNDARY_IMPORTS = new Map([
  ['@/lib/auth/access', new Set([
    'requireProjectView',
    'requireProjectEdit',
    'requireResourceView',
    'requireResourceEdit',
  ])],
  ['@/lib/auth/admin', new Set(['requireAdmin'])],
  ['@/lib/auth/publicProjects', new Set(['listPublicProjects'])],
  ['@/lib/safety/reportSubmission.server', new Set(['submitReport'])],
]);
const MYSQL_IMPORTS = new Set(['@/lib/mysql/server', '@/lib/mysql/client']);
const FILESYSTEM_IMPORTS = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);

function importsByLocalName(sourceFile) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) imports.set(clause.name.text, { moduleName, importedName: 'default' });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, {
          moduleName,
          importedName: element.propertyName?.text || element.name.text,
        });
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { moduleName, importedName: '*' });
    }
  }
  return imports;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function entryPoints(sourceFile) {
  const entries = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.body) continue;
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      entries.push({ label: 'default', body: statement.body });
      continue;
    }
    const name = statement.name?.text;
    if (name && HTTP_METHODS.has(name)) entries.push({ label: name, body: statement.body });
  }
  return entries;
}

function literalBoolean(node) {
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  return null;
}

function calledImport(expression, imports) {
  if (ts.isIdentifier(expression)) return imports.get(expression.text) || null;
  if (ts.isPropertyAccessExpression(expression)) {
    let root = expression.expression;
    while (ts.isPropertyAccessExpression(root)) root = root.expression;
    return ts.isIdentifier(root) ? imports.get(root.text) || null : null;
  }
  return null;
}

function actorVariable(call) {
  let parent = call.parent;
  if (ts.isAwaitExpression(parent)) parent = parent.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? parent.name.text
    : null;
}

function inspectEntry(entry, imports, expectedBoundary) {
  const actorCalls = [];
  const boundaryCalls = [];
  const effects = [];

  function visit(node, nestedFunctionDepth = 0) {
    if (ts.isIfStatement(node)) {
      const known = literalBoolean(node.expression);
      if (known === false) {
        if (node.elseStatement) visit(node.elseStatement, nestedFunctionDepth);
        return;
      }
      if (known === true) {
        visit(node.thenStatement, nestedFunctionDepth);
        return;
      }
    }

    let childDepth = nestedFunctionDepth;
    if (node !== entry.body && ts.isFunctionLike(node)) childDepth += 1;

    if (ts.isCallExpression(node)) {
      const binding = calledImport(node.expression, imports);
      if (binding) {
        if (
          childDepth === 0 &&
          binding.moduleName === ACTOR_IMPORT &&
          ACTOR_NAMES.has(binding.importedName)
        ) {
          actorCalls.push({ node, position: node.getStart(), variable: actorVariable(node) });
        }

        const boundaryNames = BOUNDARY_IMPORTS.get(binding.moduleName);
        if (childDepth === 0 && boundaryNames?.has(binding.importedName)) {
          boundaryCalls.push({
            node,
            position: node.getStart(),
            name: binding.importedName,
            firstArgument: ts.isIdentifier(node.arguments[0]) ? node.arguments[0].text : null,
          });
        }

        if (
          MYSQL_IMPORTS.has(binding.moduleName) ||
          FILESYSTEM_IMPORTS.has(binding.moduleName) ||
          (binding.moduleName === '@/lib/safety/moderation' && binding.importedName === 'moderateText')
        ) {
          effects.push({ position: node.getStart(), moduleName: binding.moduleName });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, childDepth));
  }

  visit(entry.body);
  const problems = [];
  if (actorCalls.length !== 1) {
    problems.push(`${entry.label}: expected exactly one canonical actor call, found ${actorCalls.length}`);
  }

  const expectedCalls = boundaryCalls.filter((call) => call.name === expectedBoundary);
  if (expectedBoundary === 'actorOnly') {
    if (boundaryCalls.length !== 0) {
      problems.push(`${entry.label}: actor-only entry point has unexpected boundary calls`);
    }
  } else {
    if (expectedCalls.length !== 1) {
      problems.push(`${entry.label}: expected exactly one ${expectedBoundary} call, found ${expectedCalls.length}`);
    }
    const unexpected = boundaryCalls.filter((call) => call.name !== expectedBoundary);
    if (unexpected.length) {
      problems.push(`${entry.label}: unexpected boundary call(s): ${unexpected.map((call) => call.name).join(', ')}`);
    }
  }

  if (actorCalls.length === 1) {
    const actor = actorCalls[0];
    const boundary = expectedBoundary === 'actorOnly' ? null : expectedCalls[0];
    if (boundary && actor.position >= boundary.position) {
      problems.push(`${entry.label}: boundary call occurs before actor resolution`);
    }
    if (
      boundary &&
      expectedBoundary !== 'listPublicProjects' &&
      boundary.firstArgument !== actor.variable
    ) {
      problems.push(`${entry.label}: ${expectedBoundary} is not bound to the resolved Actor`);
    }

    const authorizationPosition = boundary?.position ?? actor.position;
    const earlyEffect = effects.find((effect) => effect.position < authorizationPosition);
    if (earlyEffect) {
      problems.push(`${entry.label}: privileged ${earlyEffect.moduleName} call occurs before authorization`);
    }
  }

  return problems;
}

/** Analyze only exported HTTP handlers or the default page entry point. */
function analyzeSource(source, filename, expectations) {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const imports = importsByLocalName(sourceFile);
  const entries = entryPoints(sourceFile);
  const found = new Set(entries.map((entry) => entry.label));
  const problems = [];

  for (const [label, expectedBoundary] of Object.entries(expectations)) {
    const entry = entries.find((candidate) => candidate.label === label);
    if (!entry) {
      problems.push(`${label}: protected entry point not found`);
      continue;
    }
    problems.push(...inspectEntry(entry, imports, expectedBoundary));
  }
  for (const label of found) {
    if (!(label in expectations)) problems.push(`${label}: exported entry point is missing from the manifest`);
  }
  return problems;
}

module.exports = { analyzeSource };
