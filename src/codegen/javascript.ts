/**
 * Intent Language - JavaScript Code Generator
 * 
 * Generates JavaScript code from the Intent AST.
 * Includes runtime contract checking when verification level is 'runtime'.
 */

import * as AST from '../parser/ast';
import { AnalysisResult } from '../analyzer/analyzer';
import { Type, typeToString } from '../analyzer/types';

export interface GeneratorOptions {
  target: 'javascript' | 'typescript';
  moduleSystem: 'esm' | 'commonjs';
  runtimeContracts: boolean;
  sourceMap: boolean;
  minify: boolean;
}

const DEFAULT_OPTIONS: GeneratorOptions = {
  target: 'javascript',
  moduleSystem: 'esm',
  runtimeContracts: true,
  sourceMap: false,
  minify: false,
};

export class JavaScriptGenerator {
  private output: string[] = [];
  private indentLevel = 0;
  private options: GeneratorOptions;
  private analysisResult: AnalysisResult;
  private currentFunction: AST.FunctionDeclaration | null = null;

  constructor(analysisResult: AnalysisResult, options: Partial<GeneratorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.analysisResult = analysisResult;
  }

  generate(program: AST.Program): string {
    this.output = [];
    
    // Add runtime helpers if contracts are enabled
    if (this.options.runtimeContracts) {
      this.emitRuntimeHelpers();
    }
    
    // Generate code for each statement
    for (const stmt of program.statements) {
      this.generateStatement(stmt);
      this.emit('');
    }
    
    return this.output.join('\n');
  }

  private emitRuntimeHelpers(): void {
    this.emit('// Intent Runtime Helpers');
    this.emit('const __intent = {');
    this.indent();
    
    // Contract assertion
    this.emit('assert(condition, message, location) {');
    this.indent();
    this.emit('if (!condition) {');
    this.indent();
    this.emit('throw new Error(`Contract violation at ${location}: ${message}`);');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('},');
    
    // Requires (precondition)
    this.emit('requires(condition, message, location) {');
    this.indent();
    this.emit('if (!condition) {');
    this.indent();
    this.emit('throw new Error(`Precondition failed at ${location}: ${message}`);');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('},');
    
    // Ensures (postcondition)
    this.emit('ensures(condition, message, location) {');
    this.indent();
    this.emit('if (!condition) {');
    this.indent();
    this.emit('throw new Error(`Postcondition failed at ${location}: ${message}`);');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('},');
    
    // Invariant
    this.emit('invariant(condition, message, location) {');
    this.indent();
    this.emit('if (!condition) {');
    this.indent();
    this.emit('throw new Error(`Invariant violated at ${location}: ${message}`);');
    this.dedent();
    this.emit('}');
    this.dedent();
    this.emit('},');
    
    // Deep clone for old()
    this.emit('clone(obj) {');
    this.indent();
    this.emit('if (obj === null || typeof obj !== "object") return obj;');
    this.emit('if (Array.isArray(obj)) return obj.map(x => __intent.clone(x));');
    this.emit('const result = {};');
    this.emit('for (const key of Object.keys(obj)) {');
    this.indent();
    this.emit('result[key] = __intent.clone(obj[key]);');
    this.dedent();
    this.emit('}');
    this.emit('return result;');
    this.dedent();
    this.emit('},');
    
    // Result type helpers
    this.emit('Ok(value) { return { ok: true, value }; },');
    this.emit('Err(error) { return { ok: false, error }; },');
    this.emit('isOk(result) { return result.ok === true; },');
    this.emit('isErr(result) { return result.ok === false; },');
    this.emit('unwrap(result) {');
    this.indent();
    this.emit('if (result.ok) return result.value;');
    this.emit('throw new Error(`Unwrap called on Err: ${result.error}`);');
    this.dedent();
    this.emit('},');
    
    // Option type helpers
    this.emit('Some(value) { return { some: true, value }; },');
    this.emit('None() { return { some: false }; },');
    this.emit('isSome(opt) { return opt.some === true; },');
    this.emit('isNone(opt) { return opt.some === false; },');
    
    this.dedent();
    this.emit('};');
    this.emit('');
  }

  private generateStatement(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'ExpressionStatement':
        this.emit(this.generateExpression(stmt.expression) + ';');
        break;
      
      case 'ReturnStatement':
        this.generateReturnStatement(stmt);
        break;
      
      case 'IfStatement':
        this.generateIfStatement(stmt);
        break;
      
      case 'WhileStatement':
        this.generateWhileStatement(stmt);
        break;
      
      case 'ForStatement':
        this.generateForStatement(stmt);
        break;
      
      case 'MatchStatement':
        this.generateMatchStatement(stmt);
        break;
      
      case 'BlockStatement':
        this.generateBlockStatement(stmt);
        break;
      
      case 'FunctionDeclaration':
        this.generateFunctionDeclaration(stmt);
        break;
      
      case 'VariableDeclaration':
        this.generateVariableDeclaration(stmt);
        break;
      
      case 'StructDeclaration':
        this.generateStructDeclaration(stmt);
        break;
      
      case 'EnumDeclaration':
        this.generateEnumDeclaration(stmt);
        break;
      
      case 'TraitDeclaration':
        // Traits become interfaces in TypeScript, or are omitted in JS
        if (this.options.target === 'typescript') {
          this.generateTraitDeclaration(stmt);
        }
        break;
      
      case 'ImplDeclaration':
        this.generateImplDeclaration(stmt);
        break;
      
      case 'EffectDeclaration':
        this.generateEffectDeclaration(stmt);
        break;
      
      case 'ImportDeclaration':
        this.generateImportDeclaration(stmt);
        break;
      
      case 'ExportDeclaration':
        this.generateExportDeclaration(stmt);
        break;
      
      case 'ContractDeclaration':
      case 'IntentDeclaration':
      case 'CapabilityDeclaration':
        // These are compile-time constructs, no runtime code needed
        break;
    }
  }

  private generateReturnStatement(stmt: AST.ReturnStatement): void {
    if (this.currentFunction && this.options.runtimeContracts) {
      // Check postconditions before returning
      const ensures = this.getEnsuresAnnotations(this.currentFunction);
      if (ensures.length > 0 && stmt.value) {
        const resultVar = '__result';
        this.emit(`const ${resultVar} = ${this.generateExpression(stmt.value)};`);
        
        for (const condition of ensures) {
          const condCode = this.generateExpression(condition)
            .replace(/\bresult\b/g, resultVar);
          const loc = `${stmt.location.line}:${stmt.location.column}`;
          this.emit(`__intent.ensures(${condCode}, ${JSON.stringify(this.exprToString(condition))}, "${loc}");`);
        }
        
        this.emit(`return ${resultVar};`);
        return;
      }
    }
    
    if (stmt.value) {
      this.emit(`return ${this.generateExpression(stmt.value)};`);
    } else {
      this.emit('return;');
    }
  }

  private generateIfStatement(stmt: AST.IfStatement): void {
    this.emit(`if (${this.generateExpression(stmt.condition)}) {`);
    this.indent();
    for (const s of stmt.thenBranch.statements) {
      this.generateStatement(s);
    }
    this.dedent();
    
    if (stmt.elseBranch) {
      if (stmt.elseBranch.kind === 'IfStatement') {
        this.output[this.output.length - 1] += ' else';
        this.generateIfStatement(stmt.elseBranch);
      } else {
        this.emit('} else {');
        this.indent();
        for (const s of stmt.elseBranch.statements) {
          this.generateStatement(s);
        }
        this.dedent();
        this.emit('}');
      }
    } else {
      this.emit('}');
    }
  }

  private generateWhileStatement(stmt: AST.WhileStatement): void {
    this.emit(`while (${this.generateExpression(stmt.condition)}) {`);
    this.indent();
    
    // Check loop invariants at start of each iteration
    if (this.options.runtimeContracts) {
      for (const inv of stmt.invariants) {
        if (inv.kind === 'InvariantAnnotation') {
          const condCode = this.generateExpression(inv.condition);
          const loc = `${inv.location.line}:${inv.location.column}`;
          this.emit(`__intent.invariant(${condCode}, "loop invariant", "${loc}");`);
        }
      }
    }
    
    for (const s of stmt.body.statements) {
      this.generateStatement(s);
    }
    this.dedent();
    this.emit('}');
  }

  private generateForStatement(stmt: AST.ForStatement): void {
    this.emit(`for (const ${stmt.variable.name} of ${this.generateExpression(stmt.iterable)}) {`);
    this.indent();
    
    // Check loop invariants
    if (this.options.runtimeContracts) {
      for (const inv of stmt.invariants) {
        if (inv.kind === 'InvariantAnnotation') {
          const condCode = this.generateExpression(inv.condition);
          const loc = `${inv.location.line}:${inv.location.column}`;
          this.emit(`__intent.invariant(${condCode}, "loop invariant", "${loc}");`);
        }
      }
    }
    
    for (const s of stmt.body.statements) {
      this.generateStatement(s);
    }
    this.dedent();
    this.emit('}');
  }

  private generateMatchStatement(stmt: AST.MatchStatement): void {
    const subject = this.generateExpression(stmt.subject);
    const subjectVar = '__match_subject';
    
    this.emit(`const ${subjectVar} = ${subject};`);
    this.emit(`(() => {`);
    this.indent();
    
    for (let i = 0; i < stmt.arms.length; i++) {
      const arm = stmt.arms[i];
      const isLast = i === stmt.arms.length - 1;
      
      const patternCheck = this.generatePatternCheck(arm.pattern, subjectVar);
      const bindings = this.generatePatternBindings(arm.pattern, subjectVar);
      
      if (isLast && arm.pattern.kind === 'WildcardPattern') {
        // Default case
        if (bindings) this.emit(bindings);
        this.emit(`return ${this.generateExpression(arm.body)};`);
      } else {
        let condition = patternCheck;
        if (arm.guard) {
          condition += ` && (${this.generateExpression(arm.guard)})`;
        }
        
        this.emit(`if (${condition}) {`);
        this.indent();
        if (bindings) this.emit(bindings);
        this.emit(`return ${this.generateExpression(arm.body)};`);
        this.dedent();
        this.emit('}');
      }
    }
    
    this.emit('throw new Error("Match not exhaustive");');
    this.dedent();
    this.emit('})();');
  }

  private generatePatternCheck(pattern: AST.Pattern, subject: string): string {
    switch (pattern.kind) {
      case 'WildcardPattern':
        return 'true';
      
      case 'LiteralPattern':
        const value = pattern.value.kind === 'Literal' 
          ? JSON.stringify(pattern.value.value)
          : this.generateExpression(pattern.value);
        return `${subject} === ${value}`;
      
      case 'IdentifierPattern':
        return 'true';
      
      case 'TuplePattern':
        const tupleChecks = pattern.elements.map((e, i) => 
          this.generatePatternCheck(e, `${subject}[${i}]`)
        );
        return tupleChecks.join(' && ') || 'true';
      
      case 'EnumPattern':
        let check = `${subject}.__variant === "${pattern.variant.name}"`;
        if (pattern.fields) {
          const fieldChecks = pattern.fields.map((f, i) =>
            this.generatePatternCheck(f, `${subject}.__fields[${i}]`)
          );
          if (fieldChecks.length > 0) {
            check += ` && ${fieldChecks.join(' && ')}`;
          }
        }
        return check;
      
      case 'StructPattern':
        const structChecks = pattern.fields.map(f =>
          this.generatePatternCheck(f.pattern, `${subject}.${f.name.name}`)
        );
        return structChecks.join(' && ') || 'true';
      
      default:
        return 'true';
    }
  }

  private generatePatternBindings(pattern: AST.Pattern, subject: string): string | null {
    switch (pattern.kind) {
      case 'IdentifierPattern':
        return `const ${pattern.name.name} = ${subject};`;
      
      case 'TuplePattern': {
        const bindings = pattern.elements.map((e, i) =>
          this.generatePatternBindings(e, `${subject}[${i}]`)
        ).filter(Boolean);
        return bindings.length > 0 ? bindings.join('\n') : null;
      }
      
      case 'EnumPattern': {
        if (pattern.fields) {
          const bindings = pattern.fields.map((f, i) =>
            this.generatePatternBindings(f, `${subject}.__fields[${i}]`)
          ).filter(Boolean);
          return bindings.length > 0 ? bindings.join('\n') : null;
        }
        return null;
      }
      
      case 'StructPattern': {
        const bindings = pattern.fields.map(f =>
          this.generatePatternBindings(f.pattern, `${subject}.${f.name.name}`)
        ).filter(Boolean);
        return bindings.length > 0 ? bindings.join('\n') : null;
      }
      
      default:
        return null;
    }
  }

  private generateBlockStatement(block: AST.BlockStatement): void {
    this.emit('{');
    this.indent();
    for (const stmt of block.statements) {
      this.generateStatement(stmt);
    }
    this.dedent();
    this.emit('}');
  }

  private generateFunctionDeclaration(decl: AST.FunctionDeclaration): void {
    this.currentFunction = decl;
    
    const params = decl.parameters.map(p => p.name.name).join(', ');
    const prefix = decl.isExported ? 'export ' : '';
    const asyncPrefix = this.hasIOEffect(decl) ? 'async ' : '';
    
    this.emit(`${prefix}${asyncPrefix}function ${decl.name.name}(${params}) {`);
    this.indent();
    
    // Generate precondition checks
    if (this.options.runtimeContracts) {
      const requires = this.getRequiresAnnotations(decl);
      for (const condition of requires) {
        const condCode = this.generateExpression(condition);
        const loc = `${decl.location.line}:${decl.location.column}`;
        this.emit(`__intent.requires(${condCode}, ${JSON.stringify(this.exprToString(condition))}, "${loc}");`);
      }
      
      // Save old values for postconditions
      const oldExprs = this.collectOldExpressions(decl);
      for (const [name, expr] of oldExprs) {
        this.emit(`const ${name} = __intent.clone(${this.generateExpression(expr)});`);
      }
    }
    
    // Generate body
    if (decl.body) {
      for (const stmt of decl.body.statements) {
        this.generateStatement(stmt);
      }
    }
    
    this.dedent();
    this.emit('}');
    
    this.currentFunction = null;
  }

  private generateVariableDeclaration(decl: AST.VariableDeclaration): void {
    const keyword = decl.isMutable ? 'let' : 'const';
    const prefix = decl.isExported ? 'export ' : '';
    
    if (decl.initializer) {
      this.emit(`${prefix}${keyword} ${decl.name.name} = ${this.generateExpression(decl.initializer)};`);
    } else {
      this.emit(`${prefix}${keyword} ${decl.name.name};`);
    }
  }

  private generateStructDeclaration(decl: AST.StructDeclaration): void {
    const prefix = decl.isExported ? 'export ' : '';
    const className = decl.name.name;
    
    this.emit(`${prefix}class ${className} {`);
    this.indent();
    
    // Constructor
    const params = decl.fields.map(f => f.name.name).join(', ');
    this.emit(`constructor(${params}) {`);
    this.indent();
    
    for (const field of decl.fields) {
      this.emit(`this.${field.name.name} = ${field.name.name};`);
    }
    
    // Check invariants in constructor
    if (this.options.runtimeContracts && decl.invariants.length > 0) {
      this.emit('');
      for (const inv of decl.invariants) {
        if (inv.kind === 'InvariantAnnotation') {
          const condCode = this.generateExpression(inv.condition)
            .replace(/\b(\w+)\b/g, (match) => {
              if (decl.fields.some(f => f.name.name === match)) {
                return `this.${match}`;
              }
              return match;
            });
          const loc = `${inv.location.line}:${inv.location.column}`;
          this.emit(`__intent.invariant(${condCode}, "struct invariant", "${loc}");`);
        }
      }
    }
    
    this.dedent();
    this.emit('}');
    
    this.dedent();
    this.emit('}');
  }

  private generateEnumDeclaration(decl: AST.EnumDeclaration): void {
    const prefix = decl.isExported ? 'export ' : '';
    const enumName = decl.name.name;
    
    this.emit(`${prefix}const ${enumName} = {`);
    this.indent();
    
    for (const variant of decl.variants) {
      if (variant.fields && variant.fields.length > 0) {
        // Variant with fields
        const params = variant.fields.map((_, i) => `_${i}`).join(', ');
        this.emit(`${variant.name.name}(${params}) {`);
        this.indent();
        this.emit(`return { __variant: "${variant.name.name}", __fields: [${params}] };`);
        this.dedent();
        this.emit('},');
      } else {
        // Unit variant
        this.emit(`${variant.name.name}: { __variant: "${variant.name.name}" },`);
      }
    }
    
    this.dedent();
    this.emit('};');
  }

  private generateTraitDeclaration(decl: AST.TraitDeclaration): void {
    // TypeScript interface generation
    const prefix = decl.isExported ? 'export ' : '';
    this.emit(`${prefix}// interface ${decl.name.name}`);
  }

  private generateImplDeclaration(decl: AST.ImplDeclaration): void {
    // Add methods to prototype or as static methods
    const typeName = this.typeExprToName(decl.forType);
    
    for (const method of decl.methods) {
      const params = method.parameters.map(p => p.name.name).join(', ');
      this.emit(`${typeName}.prototype.${method.name.name} = function(${params}) {`);
      this.indent();
      
      if (method.body) {
        for (const stmt of method.body.statements) {
          this.generateStatement(stmt);
        }
      }
      
      this.dedent();
      this.emit('};');
    }
  }

  private generateEffectDeclaration(decl: AST.EffectDeclaration): void {
    const prefix = decl.isExported ? 'export ' : '';
    const effectName = decl.name.name;
    
    this.emit(`${prefix}const ${effectName} = {`);
    this.indent();
    
    for (const method of decl.methods) {
      const params = method.parameters.map(p => p.name.name).join(', ');
      
      if (effectName === 'IO') {
        // Special handling for IO effect
        if (method.name.name === 'read') {
          this.emit(`async read() { return await require('readline').question(''); },`);
        } else if (method.name.name === 'write') {
          this.emit(`write(s) { console.log(s); },`);
        } else {
          this.emit(`${method.name.name}(${params}) { /* Effect handler */ },`);
        }
      } else {
        this.emit(`${method.name.name}(${params}) { /* Effect handler */ },`);
      }
    }
    
    this.dedent();
    this.emit('};');
  }

  private generateImportDeclaration(decl: AST.ImportDeclaration): void {
    const path = decl.path.join('/');
    
    if (this.options.moduleSystem === 'esm') {
      if (decl.isWildcard) {
        this.emit(`import * as ${decl.path[decl.path.length - 1]} from './${path}.js';`);
      } else {
        const imports = decl.imports.map(i => 
          i.alias ? `${i.name.name} as ${i.alias.name}` : i.name.name
        ).join(', ');
        this.emit(`import { ${imports} } from './${path}.js';`);
      }
    } else {
      if (decl.isWildcard) {
        this.emit(`const ${decl.path[decl.path.length - 1]} = require('./${path}');`);
      } else {
        const imports = decl.imports.map(i => 
          i.alias ? `${i.name.name}: ${i.alias.name}` : i.name.name
        ).join(', ');
        this.emit(`const { ${imports} } = require('./${path}');`);
      }
    }
  }

  private generateExportDeclaration(decl: AST.ExportDeclaration): void {
    // The export keyword is added by the individual declaration generators
    this.generateStatement(decl.declaration);
  }

  // ============================================================================
  // Expression Generation
  // ============================================================================

  private generateExpression(expr: AST.Expression): string {
    switch (expr.kind) {
      case 'Identifier':
        return expr.name;
      
      case 'Literal':
        return this.generateLiteral(expr);
      
      case 'BinaryExpression':
        return this.generateBinaryExpression(expr);
      
      case 'UnaryExpression':
        return this.generateUnaryExpression(expr);
      
      case 'CallExpression':
        return this.generateCallExpression(expr);
      
      case 'MemberExpression':
        return this.generateMemberExpression(expr);
      
      case 'IndexExpression':
        return `${this.generateExpression(expr.object)}[${this.generateExpression(expr.index)}]`;
      
      case 'IfExpression':
        return this.generateIfExpression(expr);
      
      case 'MatchExpression':
        return this.generateMatchExpression(expr);
      
      case 'BlockExpression':
        return this.generateBlockExpression(expr);
      
      case 'LambdaExpression':
        return this.generateLambdaExpression(expr);
      
      case 'ArrayExpression':
        return `[${expr.elements.map(e => this.generateExpression(e)).join(', ')}]`;
      
      case 'TupleExpression':
        return `[${expr.elements.map(e => this.generateExpression(e)).join(', ')}]`;
      
      case 'StructExpression':
        return this.generateStructExpression(expr);
      
      case 'OldExpression':
        return this.generateOldExpression(expr);
      
      case 'ForallExpression':
        return this.generateForallExpression(expr);
      
      case 'ExistsExpression':
        return this.generateExistsExpression(expr);
      
      case 'TryExpression':
        return this.generateTryExpression(expr);
      
      case 'AssignmentExpression':
        return `${this.generateExpression(expr.left)} ${expr.operator} ${this.generateExpression(expr.right)}`;
      
      case 'RangeExpression':
        return this.generateRangeExpression(expr);
      
      default:
        return '/* unsupported expression */';
    }
  }

  private generateLiteral(expr: AST.Literal): string {
    switch (expr.literalKind) {
      case 'string':
        return JSON.stringify(expr.value);
      case 'char':
        return JSON.stringify(expr.value);
      case 'boolean':
        return String(expr.value);
      case 'nil':
        return 'null';
      case 'integer':
      case 'float':
        return String(expr.value);
      default:
        return 'null';
    }
  }

  private generateBinaryExpression(expr: AST.BinaryExpression): string {
    const left = this.generateExpression(expr.left);
    const right = this.generateExpression(expr.right);
    
    if (expr.operator === '**') {
      return `Math.pow(${left}, ${right})`;
    }
    
    return `(${left} ${expr.operator} ${right})`;
  }

  private generateUnaryExpression(expr: AST.UnaryExpression): string {
    const operand = this.generateExpression(expr.operand);
    
    if (expr.operator === '&' || expr.operator === '*') {
      // Reference/dereference - in JS, just return the value
      return operand;
    }
    
    return `${expr.operator}${operand}`;
  }

  private generateCallExpression(expr: AST.CallExpression): string {
    const callee = this.generateExpression(expr.callee);
    const args = expr.arguments.map(a => this.generateExpression(a)).join(', ');
    return `${callee}(${args})`;
  }

  private generateMemberExpression(expr: AST.MemberExpression): string {
    const object = this.generateExpression(expr.object);
    return `${object}.${expr.property.name}`;
  }

  private generateIfExpression(expr: AST.IfExpression): string {
    const cond = this.generateExpression(expr.condition);
    const then = this.generateBlockExpression(expr.thenBranch);
    
    if (expr.elseBranch) {
      if (expr.elseBranch.kind === 'IfExpression') {
        return `(${cond} ? ${then} : ${this.generateIfExpression(expr.elseBranch)})`;
      } else {
        const els = this.generateBlockExpression(expr.elseBranch);
        return `(${cond} ? ${then} : ${els})`;
      }
    }
    
    return `(${cond} ? ${then} : undefined)`;
  }

  private generateMatchExpression(expr: AST.MatchExpression): string {
    // Generate as IIFE with switch-like logic
    const subject = this.generateExpression(expr.subject);
    const subjectVar = '__m';
    
    const arms = expr.arms.map(arm => {
      const pattern = this.generatePatternCheck(arm.pattern, subjectVar);
      const bindings = this.generatePatternBindings(arm.pattern, subjectVar);
      const body = this.generateExpression(arm.body);
      
      if (arm.guard) {
        const guard = this.generateExpression(arm.guard);
        return `if (${pattern} && ${guard}) { ${bindings || ''} return ${body}; }`;
      }
      return `if (${pattern}) { ${bindings || ''} return ${body}; }`;
    }).join(' ');
    
    return `((__m) => { ${arms} throw new Error("Match not exhaustive"); })(${subject})`;
  }

  private generateBlockExpression(expr: AST.BlockExpression): string {
    if (expr.statements.length === 0 && expr.expression) {
      return this.generateExpression(expr.expression);
    }
    
    // Generate as IIFE
    const stmts = expr.statements.map(s => {
      const output: string[] = [];
      // Capture output temporarily
      const savedOutput = this.output;
      this.output = output;
      this.generateStatement(s);
      this.output = savedOutput;
      return output.join('\n');
    }).join(' ');
    
    if (expr.expression) {
      const result = this.generateExpression(expr.expression);
      return `(() => { ${stmts} return ${result}; })()`;
    }
    
    return `(() => { ${stmts} })()`;
  }

  private generateLambdaExpression(expr: AST.LambdaExpression): string {
    const params = expr.parameters.map(p => p.name.name).join(', ');
    const body = this.generateExpression(expr.body);
    return `(${params}) => ${body}`;
  }

  private generateStructExpression(expr: AST.StructExpression): string {
    const fields = expr.fields.map(f => 
      `${f.name.name}: ${this.generateExpression(f.value)}`
    ).join(', ');
    
    if (expr.spread) {
      return `{ ...${this.generateExpression(expr.spread)}, ${fields} }`;
    }
    
    return `new ${expr.type.name}(${expr.fields.map(f => this.generateExpression(f.value)).join(', ')})`;
  }

  private generateOldExpression(expr: AST.OldExpression): string {
    // References a saved value from before the function executed
    const inner = this.exprToString(expr.expression);
    return `__old_${inner.replace(/[.\[\]]/g, '_')}`;
  }

  private generateForallExpression(expr: AST.ForallExpression): string {
    // Convert to array every() check
    const bindings = expr.bindings;
    const condition = this.generateExpression(expr.condition);
    
    if (bindings.length === 1 && bindings[0].range) {
      const range = this.generateExpression(bindings[0].range);
      return `${range}.every(${bindings[0].name.name} => ${condition})`;
    }
    
    // For index-based forall, assume we're checking array indices
    return `/* forall */ true`;
  }

  private generateExistsExpression(expr: AST.ExistsExpression): string {
    // Convert to array some() check
    const bindings = expr.bindings;
    const condition = this.generateExpression(expr.condition);
    
    if (bindings.length === 1 && bindings[0].range) {
      const range = this.generateExpression(bindings[0].range);
      return `${range}.some(${bindings[0].name.name} => ${condition})`;
    }
    
    return `/* exists */ false`;
  }

  private generateTryExpression(expr: AST.TryExpression): string {
    const inner = this.generateExpression(expr.expression);
    return `__intent.unwrap(${inner})`;
  }

  private generateRangeExpression(expr: AST.RangeExpression): string {
    // Generate array for range
    if (expr.start && expr.end) {
      const start = this.generateExpression(expr.start);
      const end = this.generateExpression(expr.end);
      if (expr.isInclusive) {
        return `Array.from({ length: ${end} - ${start} + 1 }, (_, i) => ${start} + i)`;
      }
      return `Array.from({ length: ${end} - ${start} }, (_, i) => ${start} + i)`;
    }
    return '[]';
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private getRequiresAnnotations(decl: AST.FunctionDeclaration): AST.Expression[] {
    return decl.annotations
      .filter((a): a is AST.RequiresAnnotation => a.kind === 'RequiresAnnotation')
      .map(a => a.condition);
  }

  private getEnsuresAnnotations(decl: AST.FunctionDeclaration): AST.Expression[] {
    return decl.annotations
      .filter((a): a is AST.EnsuresAnnotation => a.kind === 'EnsuresAnnotation')
      .map(a => a.condition);
  }

  private collectOldExpressions(decl: AST.FunctionDeclaration): Map<string, AST.Expression> {
    const oldExprs = new Map<string, AST.Expression>();
    
    const findOld = (expr: AST.Expression): void => {
      if (expr.kind === 'OldExpression') {
        const name = `__old_${this.exprToString(expr.expression).replace(/[.\[\]]/g, '_')}`;
        oldExprs.set(name, expr.expression);
      }
      // Recursively check sub-expressions
      // (simplified - would need full traversal)
    };
    
    for (const ann of decl.annotations) {
      if (ann.kind === 'EnsuresAnnotation') {
        this.traverseExpression(ann.condition, findOld);
      }
    }
    
    return oldExprs;
  }

  private traverseExpression(expr: AST.Expression, visitor: (e: AST.Expression) => void): void {
    visitor(expr);
    
    switch (expr.kind) {
      case 'BinaryExpression':
        this.traverseExpression(expr.left, visitor);
        this.traverseExpression(expr.right, visitor);
        break;
      case 'UnaryExpression':
        this.traverseExpression(expr.operand, visitor);
        break;
      case 'CallExpression':
        this.traverseExpression(expr.callee, visitor);
        expr.arguments.forEach(a => this.traverseExpression(a, visitor));
        break;
      case 'MemberExpression':
        this.traverseExpression(expr.object, visitor);
        break;
      case 'IndexExpression':
        this.traverseExpression(expr.object, visitor);
        this.traverseExpression(expr.index, visitor);
        break;
      case 'OldExpression':
        this.traverseExpression(expr.expression, visitor);
        break;
      // ... other cases
    }
  }

  private hasIOEffect(decl: AST.FunctionDeclaration): boolean {
    for (const ann of decl.annotations) {
      if (ann.kind === 'EffectAnnotation') {
        for (const eff of ann.effects) {
          if (eff.kind === 'NamedType' && eff.name.name === 'IO') {
            return true;
          }
        }
      }
    }
    return false;
  }

  private typeExprToName(typeExpr: AST.TypeExpression): string {
    if (typeExpr.kind === 'NamedType') {
      return typeExpr.name.name;
    }
    if (typeExpr.kind === 'GenericType' && typeExpr.base.kind === 'NamedType') {
      return typeExpr.base.name.name;
    }
    return 'Object';
  }

  private exprToString(expr: AST.Expression): string {
    switch (expr.kind) {
      case 'Identifier':
        return expr.name;
      case 'Literal':
        return String(expr.value);
      case 'MemberExpression':
        return `${this.exprToString(expr.object)}.${expr.property.name}`;
      case 'BinaryExpression':
        return `${this.exprToString(expr.left)} ${expr.operator} ${this.exprToString(expr.right)}`;
      default:
        return '<expr>';
    }
  }

  private emit(line: string): void {
    const indent = '  '.repeat(this.indentLevel);
    this.output.push(indent + line);
  }

  private indent(): void {
    this.indentLevel++;
  }

  private dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }
}

export function generateJavaScript(
  program: AST.Program,
  analysisResult: AnalysisResult,
  options?: Partial<GeneratorOptions>
): string {
  const generator = new JavaScriptGenerator(analysisResult, options);
  return generator.generate(program);
}
