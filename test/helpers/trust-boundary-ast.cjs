const ts = require('typescript');

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
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
const PRE_AUTH_SAFE_IMPORTS = new Map([
  ['@/lib/i18n/server', new Set(['getTranslator'])],
  ['@/lib/safety/rateLimit', new Set(['clientKey', 'rateLimit'])],
]);

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
    if (ts.isFunctionDeclaration(statement) && statement.body) {
      if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        entries.push({ label: 'default', body: statement.body });
        continue;
      }
      const name = statement.name?.text;
      if (name && HTTP_METHODS.has(name)) entries.push({ label: name, body: statement.body });
    } else if (
      ts.isVariableStatement(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !HTTP_METHODS.has(declaration.name.text)) continue;
        let initializer = declaration.initializer;
        while (initializer && ts.isParenthesizedExpression(initializer)) {
          initializer = initializer.expression;
        }
        if (
          initializer &&
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          ts.isBlock(initializer.body)
        ) {
          entries.push({ label: declaration.name.text, body: initializer.body });
        } else {
          entries.push({ label: declaration.name.text, body: null });
        }
      }
    }
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

function isCanonicalActor(binding) {
  return binding.moduleName === ACTOR_IMPORT && ACTOR_NAMES.has(binding.importedName);
}

function isCanonicalBoundary(binding) {
  return Boolean(BOUNDARY_IMPORTS.get(binding.moduleName)?.has(binding.importedName));
}

function isPreAuthorizationSafe(binding) {
  return Boolean(PRE_AUTH_SAFE_IMPORTS.get(binding.moduleName)?.has(binding.importedName));
}

function isPrivilegedEffect(binding) {
  if (isCanonicalActor(binding) || isCanonicalBoundary(binding) || isPreAuthorizationSafe(binding)) {
    return false;
  }
  return (
    binding.moduleName.startsWith('@/') ||
    MYSQL_IMPORTS.has(binding.moduleName) ||
    FILESYSTEM_IMPORTS.has(binding.moduleName) ||
    (binding.moduleName === '@/lib/safety/moderation' && binding.importedName === 'moderateText')
  );
}


function inspectEntry(entry, imports, expectedBoundary) {
  if (!entry.body) return [`${entry.label}: exported handler must be an inline function`];
  const actorCalls = [];
  const boundaryCalls = [];
  const effects = [];

  function visit(node, conditional = false) {
    if (ts.isIfStatement(node)) {
      const known = literalBoolean(node.expression);
      if (known === false) {
        if (node.elseStatement) visit(node.elseStatement, conditional);
        return;
      }
      if (known === true) {
        visit(node.thenStatement, conditional);
        return;
      }
      visit(node.expression, conditional);
      visit(node.thenStatement, true);
      if (node.elseStatement) visit(node.elseStatement, true);
      return;
    }

    if (
      ts.isConditionalExpression(node) ||
      (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isSwitchStatement(node) ||
      ts.isCaseClause(node) ||
      ts.isDefaultClause(node) ||
      ts.isCatchClause(node) ||
      (node !== entry.body && ts.isFunctionLike(node))
    ) {
      ts.forEachChild(node, (child) => visit(child, true));
      return;
    }

    if (ts.isTryStatement(node)) {
      visit(node.tryBlock, conditional);
      if (node.catchClause) visit(node.catchClause, true);
      if (node.finallyBlock) visit(node.finallyBlock, true);
      return;
    }

    if (ts.isCallExpression(node)) {
      const binding = calledImport(node.expression, imports);
      if (binding) {
        if (isCanonicalActor(binding)) {
          actorCalls.push({
            node,
            position: node.getStart(),
            variable: actorVariable(node),
            conditional,
          });
        }

        const boundaryNames = BOUNDARY_IMPORTS.get(binding.moduleName);
        if (boundaryNames?.has(binding.importedName)) {
          // Awaited = `await guard(...)` with nothing chained between the call
          // and the await. Assignment or use in a condition is fine — the throw
          // still propagates out of `await`. But `.catch(...)` / `.then(...)`
          // between the call and the await makes `node.parent` a
          // PropertyAccessExpression, which fails this check. So does
          // `Promise.all([guard(...), ...])`, `void guard(...)`, and a bare
          // call with no await at all.
          const awaited = ts.isAwaitExpression(node.parent);
          boundaryCalls.push({
            node,
            position: node.getStart(),
            name: binding.importedName,
            firstArgument: ts.isIdentifier(node.arguments[0]) ? node.arguments[0].text : null,
            conditional,
            awaited,
          });
        }

        if (isPrivilegedEffect(binding)) {
          effects.push({ position: node.getStart(), moduleName: binding.moduleName });
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, conditional));
  }

  visit(entry.body);
  const problems = [];
  if (actorCalls.length !== 1) {
    problems.push(`${entry.label}: expected exactly one canonical actor call, found ${actorCalls.length}`);
  } else if (actorCalls[0].conditional) {
    problems.push(`${entry.label}: canonical actor call is conditional and does not dominate privileged effects`);
  }

  const expectedCalls = boundaryCalls.filter((call) => call.name === expectedBoundary);
  if (expectedBoundary === 'actorOnly') {
    if (boundaryCalls.length !== 0) {
      problems.push(`${entry.label}: actor-only entry point has unexpected boundary calls`);
    }
  } else {
    if (expectedCalls.length !== 1) {
      problems.push(`${entry.label}: expected exactly one ${expectedBoundary} call, found ${expectedCalls.length}`);
    } else if (expectedCalls[0].conditional) {
      problems.push(`${entry.label}: ${expectedBoundary} call is conditional and does not dominate privileged effects`);
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
    // Shape check — the boundary call must be directly awaited so its rejection
    // propagates. `.catch(...)` / `.then(...)` chained *before* await make
    // `node.parent` a PropertyAccessExpression rather than an AwaitExpression,
    // so `.catch` swallowing (`await guard(...).catch(() => null)`) fails here
    // even though the surrounding expression uses `await`. `Promise.all([
    // guard(...), ...])`, `void guard(...)`, and a bare non-awaited call all
    // fail for the same reason: their parent isn't `AwaitExpression`.
    //
    // Assignment (`const x = await guard(...)`) and use in a condition
    // (`if (await guard(...))`) are safe — the throw exits `await` before the
    // consumer sees a value — so this check does not require a bare statement.
    //
    // Wrapping the guard in a try/catch is NOT flagged here even when the
    // catch doesn't rethrow. The wrapping catch typically converts guard
    // rejections into a 403/404 response (`if (error instanceof AccessError)
    // return NextResponse.json(...)`), which is the intended handler contract.
    // Detecting the difference between that and a genuine swallow-and-continue
    // requires per-resource data-flow beyond what an AST-only gate can prove
    // without producing false positives on the codebase's shared "wrap the
    // whole handler in one try" pattern.
    if (boundary && !boundary.awaited) {
      problems.push(`${entry.label}: ${expectedBoundary} must be directly awaited so a rejection halts the handler`);
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
