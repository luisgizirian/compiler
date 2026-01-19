/**
 * Intent Language - Semantic Analyzer
 * 
 * Performs semantic analysis on the AST including:
 * - Type checking and inference
 * - Name resolution
 * - Contract validation
 * - Effect system verification
 * - Capability checking
 */

import * as AST from '../parser/ast';
import {
  Type,
  StructType,
  EnumType,
  FunctionType,
  EffectType,
  CapabilityType,
  PRIMITIVES,
  VOID_TYPE,
  NEVER_TYPE,
  UNKNOWN_TYPE,
  typeEquals,
  isAssignableTo,
  typeToString,
  isNumeric,
  isBoolean,
  isInteger,
  createTypeVariable,
} from './types';
import { SymbolTable, ContractSymbol, IntentSymbol } from './symbols';
import { SourceLocation } from '../lexer/token';

export interface SemanticError {
  message: string;
  location: SourceLocation;
  severity: 'error' | 'warning' | 'info';
}

export interface AnalysisResult {
  errors: SemanticError[];
  warnings: SemanticError[];
  symbolTable: SymbolTable;
  typeMap: Map<AST.AnyNode, Type>;
}

export class SemanticAnalyzer {
  private errors: SemanticError[] = [];
  private warnings: SemanticError[] = [];
  private symbolTable: SymbolTable;
  private typeMap: Map<AST.AnyNode, Type> = new Map();
  private currentModule = 'main';
  private currentFunction: AST.FunctionDeclaration | null = null;
  private inContractContext = false;

  constructor() {
    this.symbolTable = new SymbolTable();
    this.initBuiltinTypes();
  }

  private initBuiltinTypes(): void {
    // Register primitive types
    for (const [name, type] of Object.entries(PRIMITIVES)) {
      this.symbolTable.defineType(name, type);
    }
    
    // Register Void and Never
    this.symbolTable.defineType('Void', VOID_TYPE);
    this.symbolTable.defineType('Never', NEVER_TYPE);
  }

  analyze(program: AST.Program): AnalysisResult {
    // First pass: collect all declarations
    this.collectDeclarations(program);
    
    // Second pass: analyze all declarations fully
    this.analyzeProgram(program);

    return {
      errors: this.errors,
      warnings: this.warnings,
      symbolTable: this.symbolTable,
      typeMap: this.typeMap,
    };
  }

  private collectDeclarations(program: AST.Program): void {
    for (const stmt of program.statements) {
      this.collectDeclaration(stmt);
    }
  }

  private collectDeclaration(stmt: AST.Statement): void {
    switch (stmt.kind) {
      case 'FunctionDeclaration':
        this.collectFunctionDeclaration(stmt);
        break;
      case 'StructDeclaration':
        this.collectStructDeclaration(stmt);
        break;
      case 'EnumDeclaration':
        this.collectEnumDeclaration(stmt);
        break;
      case 'TraitDeclaration':
        this.collectTraitDeclaration(stmt);
        break;
      case 'ContractDeclaration':
        this.collectContractDeclaration(stmt);
        break;
      case 'IntentDeclaration':
        this.collectIntentDeclaration(stmt);
        break;
      case 'EffectDeclaration':
        this.collectEffectDeclaration(stmt);
        break;
      case 'CapabilityDeclaration':
        this.collectCapabilityDeclaration(stmt);
        break;
      case 'ExportDeclaration':
        this.collectDeclaration(stmt.declaration);
        break;
    }
  }

  private collectFunctionDeclaration(decl: AST.FunctionDeclaration): void {
    const funcType = this.createFunctionType(decl);
    this.symbolTable.define(
      decl.name.name,
      funcType,
      'function',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  private collectStructDeclaration(decl: AST.StructDeclaration): void {
    const genericParams = decl.genericParams.map(p => 
      createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
    );
    
    const structType: StructType = {
      kind: 'struct',
      name: decl.name.name,
      fields: new Map(),
      genericParams,
      invariants: [],
      module: this.currentModule,
    };
    
    // Collect fields
    for (const field of decl.fields) {
      structType.fields.set(field.name.name, this.resolveType(field.type));
    }
    
    this.symbolTable.defineType(decl.name.name, structType);
    this.symbolTable.define(
      decl.name.name,
      structType,
      'struct',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  private collectEnumDeclaration(decl: AST.EnumDeclaration): void {
    const genericParams = decl.genericParams.map(p =>
      createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
    );
    
    const enumType: EnumType = {
      kind: 'enum',
      name: decl.name.name,
      variants: new Map(),
      genericParams,
      module: this.currentModule,
    };
    
    for (const variant of decl.variants) {
      const fields = variant.fields?.map(f => this.resolveType(f)) || null;
      enumType.variants.set(variant.name.name, fields);
    }
    
    this.symbolTable.defineType(decl.name.name, enumType);
    this.symbolTable.define(
      decl.name.name,
      enumType,
      'enum',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  private collectTraitDeclaration(decl: AST.TraitDeclaration): void {
    const genericParams = decl.genericParams.map(p =>
      createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
    );
    
    const traitType: Type = {
      kind: 'trait',
      name: decl.name.name,
      methods: new Map(),
      supertraits: [],
      genericParams,
      module: this.currentModule,
    };
    
    this.symbolTable.defineType(decl.name.name, traitType);
    this.symbolTable.define(
      decl.name.name,
      traitType,
      'trait',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  private collectContractDeclaration(decl: AST.ContractDeclaration): void {
    const contract: ContractSymbol = {
      name: decl.name.name,
      genericParams: decl.genericParams.map(p =>
        createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
      ),
      requires: [],
      ensures: [],
      invariants: [],
      module: this.currentModule,
    };
    
    for (const ann of decl.annotations) {
      switch (ann.kind) {
        case 'RequiresAnnotation':
          contract.requires.push(this.expressionToString(ann.condition));
          break;
        case 'EnsuresAnnotation':
          contract.ensures.push(this.expressionToString(ann.condition));
          break;
        case 'InvariantAnnotation':
          contract.invariants.push(this.expressionToString(ann.condition));
          break;
      }
    }
    
    this.symbolTable.defineContract(contract);
  }

  private collectIntentDeclaration(decl: AST.IntentDeclaration): void {
    const intent: IntentSymbol = {
      name: decl.name.name,
      genericParams: decl.genericParams.map(p =>
        createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
      ),
      ensures: [],
      module: this.currentModule,
    };
    
    for (const ann of decl.annotations) {
      if (ann.kind === 'EnsuresAnnotation') {
        intent.ensures.push(this.expressionToString(ann.condition));
      }
    }
    
    this.symbolTable.defineIntent(intent);
  }

  private collectEffectDeclaration(decl: AST.EffectDeclaration): void {
    const effectType: EffectType = {
      kind: 'effect',
      name: decl.name.name,
      methods: new Map(),
      genericParams: decl.genericParams.map(p =>
        createTypeVariable(p.name.name, p.bounds.map(b => this.resolveType(b)))
      ),
      module: this.currentModule,
    };
    
    for (const method of decl.methods) {
      effectType.methods.set(method.name.name, this.createFunctionType(method));
    }
    
    this.symbolTable.defineType(decl.name.name, effectType);
    this.symbolTable.define(
      decl.name.name,
      effectType,
      'effect',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  private collectCapabilityDeclaration(decl: AST.CapabilityDeclaration): void {
    const capType: CapabilityType = {
      kind: 'capability',
      name: decl.name.name,
      permissions: new Map(),
      module: this.currentModule,
    };
    
    for (const field of decl.fields) {
      capType.permissions.set(field.name.name, this.resolveType(field.type));
    }
    
    this.symbolTable.defineType(decl.name.name, capType);
    this.symbolTable.define(
      decl.name.name,
      capType,
      'capability',
      decl.location,
      { isExported: decl.isExported, module: this.currentModule }
    );
  }

  // ============================================================================
  // Analysis Pass
  // ============================================================================

  private analyzeProgram(program: AST.Program): void {
    for (const stmt of program.statements) {
      this.analyzeStatement(stmt);
    }
  }

  private analyzeStatement(stmt: AST.Statement): Type {
    switch (stmt.kind) {
      case 'ExpressionStatement':
        return this.analyzeExpression(stmt.expression);
      
      case 'ReturnStatement':
        return this.analyzeReturnStatement(stmt);
      
      case 'IfStatement':
        return this.analyzeIfStatement(stmt);
      
      case 'WhileStatement':
        return this.analyzeWhileStatement(stmt);
      
      case 'ForStatement':
        return this.analyzeForStatement(stmt);
      
      case 'MatchStatement':
        return this.analyzeMatchStatement(stmt);
      
      case 'BlockStatement':
        return this.analyzeBlockStatement(stmt);
      
      case 'FunctionDeclaration':
        return this.analyzeFunctionDeclaration(stmt);
      
      case 'VariableDeclaration':
        return this.analyzeVariableDeclaration(stmt);
      
      case 'StructDeclaration':
        return this.analyzeStructDeclaration(stmt);
      
      case 'EnumDeclaration':
        return this.analyzeEnumDeclaration(stmt);
      
      case 'TraitDeclaration':
        return this.analyzeTraitDeclaration(stmt);
      
      case 'ImplDeclaration':
        return this.analyzeImplDeclaration(stmt);
      
      case 'ContractDeclaration':
      case 'IntentDeclaration':
      case 'EffectDeclaration':
      case 'CapabilityDeclaration':
        // Already processed in collect phase
        return VOID_TYPE;
      
      case 'ImportDeclaration':
        return this.analyzeImportDeclaration(stmt);
      
      case 'ExportDeclaration':
        return this.analyzeStatement(stmt.declaration);
      
      default:
        return VOID_TYPE;
    }
  }

  private analyzeReturnStatement(stmt: AST.ReturnStatement): Type {
    if (!this.currentFunction) {
      this.error(stmt.location, 'Return statement outside of function');
      return NEVER_TYPE;
    }
    
    const expectedType = this.resolveType(this.currentFunction.returnType);
    
    if (stmt.value) {
      const actualType = this.analyzeExpression(stmt.value);
      
      if (!isAssignableTo(actualType, expectedType)) {
        this.error(
          stmt.location,
          `Return type mismatch: expected ${typeToString(expectedType)}, got ${typeToString(actualType)}`
        );
      }
      
      return actualType;
    } else {
      if (expectedType.kind !== 'void') {
        this.error(
          stmt.location,
          `Missing return value: expected ${typeToString(expectedType)}`
        );
      }
      return VOID_TYPE;
    }
  }

  private analyzeIfStatement(stmt: AST.IfStatement): Type {
    const condType = this.analyzeExpression(stmt.condition);
    
    if (!isBoolean(condType)) {
      this.error(
        stmt.condition.location,
        `Condition must be Bool, got ${typeToString(condType)}`
      );
    }
    
    this.analyzeBlockStatement(stmt.thenBranch);
    
    if (stmt.elseBranch) {
      if (stmt.elseBranch.kind === 'IfStatement') {
        this.analyzeIfStatement(stmt.elseBranch);
      } else {
        this.analyzeBlockStatement(stmt.elseBranch);
      }
    }
    
    return VOID_TYPE;
  }

  private analyzeWhileStatement(stmt: AST.WhileStatement): Type {
    const condType = this.analyzeExpression(stmt.condition);
    
    if (!isBoolean(condType)) {
      this.error(
        stmt.condition.location,
        `Condition must be Bool, got ${typeToString(condType)}`
      );
    }
    
    // Analyze loop invariants
    this.inContractContext = true;
    for (const inv of stmt.invariants) {
      if (inv.kind === 'InvariantAnnotation') {
        const invType = this.analyzeExpression(inv.condition);
        if (!isBoolean(invType)) {
          this.error(
            inv.location,
            `Loop invariant must be Bool, got ${typeToString(invType)}`
          );
        }
      }
    }
    this.inContractContext = false;
    
    this.symbolTable.enterScope('while', 'loop');
    this.analyzeBlockStatement(stmt.body);
    this.symbolTable.exitScope();
    
    return VOID_TYPE;
  }

  private analyzeForStatement(stmt: AST.ForStatement): Type {
    const iterType = this.analyzeExpression(stmt.iterable);
    
    // Determine element type from iterable
    let elementType: Type = UNKNOWN_TYPE;
    
    if (iterType.kind === 'array') {
      elementType = iterType.elementType;
    } else if (iterType.kind === 'generic' && iterType.base.kind === 'struct') {
      // Could be an iterator
      elementType = iterType.arguments[0] || UNKNOWN_TYPE;
    }
    
    this.symbolTable.enterScope('for', 'loop');
    this.symbolTable.define(
      stmt.variable.name,
      elementType,
      'variable',
      stmt.variable.location,
      { isMutable: false }
    );
    
    // Analyze loop invariants
    this.inContractContext = true;
    for (const inv of stmt.invariants) {
      if (inv.kind === 'InvariantAnnotation') {
        const invType = this.analyzeExpression(inv.condition);
        if (!isBoolean(invType)) {
          this.error(
            inv.location,
            `Loop invariant must be Bool, got ${typeToString(invType)}`
          );
        }
      }
    }
    this.inContractContext = false;
    
    this.analyzeBlockStatement(stmt.body);
    this.symbolTable.exitScope();
    
    return VOID_TYPE;
  }

  private analyzeMatchStatement(stmt: AST.MatchStatement): Type {
    const subjectType = this.analyzeExpression(stmt.subject);
    
    for (const arm of stmt.arms) {
      this.analyzeMatchArm(arm, subjectType);
    }
    
    return VOID_TYPE;
  }

  private analyzeMatchArm(arm: AST.MatchArm, subjectType: Type): Type {
    this.symbolTable.enterScope('match-arm', 'block');
    
    this.analyzePattern(arm.pattern, subjectType);
    
    if (arm.guard) {
      const guardType = this.analyzeExpression(arm.guard);
      if (!isBoolean(guardType)) {
        this.error(
          arm.guard.location,
          `Match guard must be Bool, got ${typeToString(guardType)}`
        );
      }
    }
    
    const bodyType = this.analyzeExpression(arm.body);
    
    this.symbolTable.exitScope();
    return bodyType;
  }

  private analyzePattern(pattern: AST.Pattern, expectedType: Type): void {
    switch (pattern.kind) {
      case 'WildcardPattern':
        // Matches anything
        break;
      
      case 'LiteralPattern':
        const litType = this.analyzeLiteral(pattern.value);
        if (!isAssignableTo(litType, expectedType)) {
          this.error(
            pattern.location,
            `Pattern type mismatch: expected ${typeToString(expectedType)}, got ${typeToString(litType)}`
          );
        }
        break;
      
      case 'IdentifierPattern':
        this.symbolTable.define(
          pattern.name.name,
          expectedType,
          'variable',
          pattern.location,
          { isMutable: pattern.isMutable }
        );
        break;
      
      case 'TuplePattern':
        if (expectedType.kind !== 'tuple') {
          this.error(pattern.location, `Expected tuple type for tuple pattern`);
          return;
        }
        if (pattern.elements.length !== expectedType.elements.length) {
          this.error(
            pattern.location,
            `Tuple pattern has ${pattern.elements.length} elements, expected ${expectedType.elements.length}`
          );
          return;
        }
        for (let i = 0; i < pattern.elements.length; i++) {
          this.analyzePattern(pattern.elements[i], expectedType.elements[i]);
        }
        break;
      
      case 'EnumPattern':
        if (expectedType.kind !== 'enum') {
          this.error(pattern.location, `Expected enum type for enum pattern`);
          return;
        }
        const variantFields = expectedType.variants.get(pattern.variant.name);
        if (variantFields === undefined) {
          this.error(
            pattern.location,
            `Unknown variant ${pattern.variant.name} in enum ${expectedType.name}`
          );
          return;
        }
        if (pattern.fields && variantFields) {
          if (pattern.fields.length !== variantFields.length) {
            this.error(
              pattern.location,
              `Variant ${pattern.variant.name} has ${variantFields.length} fields, got ${pattern.fields.length}`
            );
            return;
          }
          for (let i = 0; i < pattern.fields.length; i++) {
            this.analyzePattern(pattern.fields[i], variantFields[i]);
          }
        }
        break;
      
      case 'StructPattern':
        if (expectedType.kind !== 'struct') {
          this.error(pattern.location, `Expected struct type for struct pattern`);
          return;
        }
        for (const field of pattern.fields) {
          const fieldType = expectedType.fields.get(field.name.name);
          if (!fieldType) {
            this.error(
              field.location,
              `Unknown field ${field.name.name} in struct ${expectedType.name}`
            );
            continue;
          }
          this.analyzePattern(field.pattern, fieldType);
        }
        break;
    }
  }

  private analyzeBlockStatement(block: AST.BlockStatement): Type {
    this.symbolTable.enterScope('block', 'block');
    
    let lastType: Type = VOID_TYPE;
    for (const stmt of block.statements) {
      lastType = this.analyzeStatement(stmt);
    }
    
    this.symbolTable.exitScope();
    return lastType;
  }

  private analyzeFunctionDeclaration(decl: AST.FunctionDeclaration): Type {
    const funcType = this.symbolTable.lookup(decl.name.name)?.type;
    if (!funcType || funcType.kind !== 'function') {
      return VOID_TYPE;
    }
    
    this.currentFunction = decl;
    this.symbolTable.enterScope(decl.name.name, 'function');
    
    // Define generic type parameters
    for (const param of decl.genericParams) {
      const typeVar = createTypeVariable(
        param.name.name,
        param.bounds.map(b => this.resolveType(b))
      );
      this.symbolTable.defineType(param.name.name, typeVar);
    }
    
    // Define parameters
    for (const param of decl.parameters) {
      const paramType = this.resolveType(param.type);
      this.symbolTable.define(
        param.name.name,
        paramType,
        'parameter',
        param.location,
        { isMutable: param.isMutable }
      );
    }
    
    // Check effect annotations
    const declaredEffects = new Set<string>();
    for (const ann of decl.annotations) {
      if (ann.kind === 'EffectAnnotation') {
        for (const eff of ann.effects) {
          if (eff.kind === 'NamedType') {
            declaredEffects.add(eff.name.name);
          }
        }
      }
    }
    this.symbolTable.setEffects(Array.from(declaredEffects));
    
    // Check contract annotations
    this.inContractContext = true;
    for (const ann of decl.annotations) {
      this.analyzeAnnotation(ann);
    }
    this.inContractContext = false;
    
    // Analyze function body
    if (decl.body) {
      this.analyzeBlockStatement(decl.body);
    }
    
    this.symbolTable.exitScope();
    this.symbolTable.clearEffects();
    this.currentFunction = null;
    
    return funcType;
  }

  private analyzeVariableDeclaration(decl: AST.VariableDeclaration): Type {
    let varType: Type = UNKNOWN_TYPE;
    
    if (decl.type) {
      varType = this.resolveType(decl.type);
    }
    
    if (decl.initializer) {
      const initType = this.analyzeExpression(decl.initializer);
      
      if (varType.kind === 'unknown') {
        varType = initType;
      } else if (!isAssignableTo(initType, varType)) {
        this.error(
          decl.location,
          `Cannot assign ${typeToString(initType)} to ${typeToString(varType)}`
        );
      }
    } else if (varType.kind === 'unknown') {
      this.error(decl.location, 'Cannot infer type without initializer');
    }
    
    this.symbolTable.define(
      decl.name.name,
      varType,
      'variable',
      decl.location,
      { isMutable: decl.isMutable, isExported: decl.isExported }
    );
    
    return varType;
  }

  private analyzeStructDeclaration(decl: AST.StructDeclaration): Type {
    const structType = this.symbolTable.lookupType(decl.name.name);
    if (!structType || structType.kind !== 'struct') {
      return VOID_TYPE;
    }
    
    // Analyze invariants
    this.inContractContext = true;
    for (const inv of decl.invariants) {
      if (inv.kind === 'InvariantAnnotation') {
        const invType = this.analyzeExpression(inv.condition);
        if (!isBoolean(invType)) {
          this.error(
            inv.location,
            `Invariant must be Bool, got ${typeToString(invType)}`
          );
        }
      }
    }
    this.inContractContext = false;
    
    return structType;
  }

  private analyzeEnumDeclaration(decl: AST.EnumDeclaration): Type {
    const enumType = this.symbolTable.lookupType(decl.name.name);
    return enumType || VOID_TYPE;
  }

  private analyzeTraitDeclaration(decl: AST.TraitDeclaration): Type {
    const traitType = this.symbolTable.lookupType(decl.name.name);
    if (!traitType || traitType.kind !== 'trait') {
      return VOID_TYPE;
    }
    
    // Analyze trait methods
    for (const method of decl.methods) {
      this.analyzeFunctionDeclaration(method);
    }
    
    return traitType;
  }

  private analyzeImplDeclaration(decl: AST.ImplDeclaration): Type {
    const forType = this.resolveType(decl.forType);
    
    if (decl.trait) {
      const traitType = this.resolveType(decl.trait);
      if (traitType.kind !== 'trait') {
        this.error(decl.location, `Expected trait type`);
      }
    }
    
    // Analyze impl methods
    for (const method of decl.methods) {
      this.currentFunction = method;
      this.symbolTable.enterScope(`impl_${method.name.name}`, 'function');
      
      // Add self parameter
      this.symbolTable.define('self', forType, 'parameter', method.location, { isMutable: false });
      
      // Define parameters
      for (const param of method.parameters) {
        const paramType = this.resolveType(param.type);
        this.symbolTable.define(
          param.name.name,
          paramType,
          'parameter',
          param.location,
          { isMutable: param.isMutable }
        );
      }
      
      if (method.body) {
        this.analyzeBlockStatement(method.body);
      }
      
      this.symbolTable.exitScope();
      this.currentFunction = null;
    }
    
    return VOID_TYPE;
  }

  private analyzeImportDeclaration(decl: AST.ImportDeclaration): Type {
    // For now, just register the imports as symbols
    for (const spec of decl.imports) {
      const name = spec.alias?.name || spec.name.name;
      // Would need module resolution to get actual types
      this.symbolTable.define(
        name,
        UNKNOWN_TYPE,
        'module',
        spec.location,
        { isExported: false }
      );
    }
    return VOID_TYPE;
  }

  private analyzeAnnotation(ann: AST.Annotation): void {
    switch (ann.kind) {
      case 'RequiresAnnotation':
        const reqType = this.analyzeExpression(ann.condition);
        if (!isBoolean(reqType)) {
          this.error(
            ann.location,
            `Requires condition must be Bool, got ${typeToString(reqType)}`
          );
        }
        break;
      
      case 'EnsuresAnnotation':
        const ensType = this.analyzeExpression(ann.condition);
        if (!isBoolean(ensType)) {
          this.error(
            ann.location,
            `Ensures condition must be Bool, got ${typeToString(ensType)}`
          );
        }
        break;
      
      case 'InvariantAnnotation':
        const invType = this.analyzeExpression(ann.condition);
        if (!isBoolean(invType)) {
          this.error(
            ann.location,
            `Invariant must be Bool, got ${typeToString(invType)}`
          );
        }
        break;
      
      case 'ContractAnnotation':
        const contract = this.symbolTable.lookupContract(ann.contract.name);
        if (!contract) {
          this.error(ann.location, `Unknown contract: ${ann.contract.name}`);
        }
        break;
      
      case 'IntentAnnotation':
        const intent = this.symbolTable.lookupIntent(ann.intent.name);
        if (!intent) {
          this.error(ann.location, `Unknown intent: ${ann.intent.name}`);
        }
        break;
      
      case 'EffectAnnotation':
        for (const eff of ann.effects) {
          const effType = this.resolveType(eff);
          if (effType.kind !== 'effect') {
            this.warning(ann.location, `${typeToString(effType)} is not an effect type`);
          }
        }
        break;
      
      case 'CapabilityAnnotation':
        const capType = this.symbolTable.lookupType(ann.capability.name);
        if (!capType || capType.kind !== 'capability') {
          this.error(ann.location, `Unknown capability: ${ann.capability.name}`);
        }
        break;
    }
  }

  // ============================================================================
  // Expression Analysis
  // ============================================================================

  private analyzeExpression(expr: AST.Expression): Type {
    let type: Type;
    
    switch (expr.kind) {
      case 'Identifier':
        type = this.analyzeIdentifier(expr);
        break;
      
      case 'Literal':
        type = this.analyzeLiteral(expr);
        break;
      
      case 'BinaryExpression':
        type = this.analyzeBinaryExpression(expr);
        break;
      
      case 'UnaryExpression':
        type = this.analyzeUnaryExpression(expr);
        break;
      
      case 'CallExpression':
        type = this.analyzeCallExpression(expr);
        break;
      
      case 'MemberExpression':
        type = this.analyzeMemberExpression(expr);
        break;
      
      case 'IndexExpression':
        type = this.analyzeIndexExpression(expr);
        break;
      
      case 'IfExpression':
        type = this.analyzeIfExpression(expr);
        break;
      
      case 'MatchExpression':
        type = this.analyzeMatchExpression(expr);
        break;
      
      case 'BlockExpression':
        type = this.analyzeBlockExpression(expr);
        break;
      
      case 'LambdaExpression':
        type = this.analyzeLambdaExpression(expr);
        break;
      
      case 'ArrayExpression':
        type = this.analyzeArrayExpression(expr);
        break;
      
      case 'TupleExpression':
        type = this.analyzeTupleExpression(expr);
        break;
      
      case 'StructExpression':
        type = this.analyzeStructExpression(expr);
        break;
      
      case 'OldExpression':
        type = this.analyzeOldExpression(expr);
        break;
      
      case 'ForallExpression':
        type = this.analyzeForallExpression(expr);
        break;
      
      case 'ExistsExpression':
        type = this.analyzeExistsExpression(expr);
        break;
      
      case 'TryExpression':
        type = this.analyzeTryExpression(expr);
        break;
      
      case 'AssignmentExpression':
        type = this.analyzeAssignmentExpression(expr);
        break;
      
      default:
        type = UNKNOWN_TYPE;
    }
    
    this.typeMap.set(expr, type);
    return type;
  }

  private analyzeIdentifier(expr: AST.Identifier): Type {
    // Special case for 'result' in ensures clauses
    if (expr.name === 'result' && this.inContractContext && this.currentFunction) {
      return this.resolveType(this.currentFunction.returnType);
    }
    
    const symbol = this.symbolTable.lookup(expr.name);
    if (!symbol) {
      this.error(expr.location, `Undefined identifier: ${expr.name}`);
      return UNKNOWN_TYPE;
    }
    return symbol.type;
  }

  private analyzeLiteral(expr: AST.Literal): Type {
    switch (expr.literalKind) {
      case 'integer':
        return PRIMITIVES['Int'];
      case 'float':
        return PRIMITIVES['Float64'];
      case 'string':
        return PRIMITIVES['String'];
      case 'char':
        return PRIMITIVES['Char'];
      case 'boolean':
        return PRIMITIVES['Bool'];
      case 'nil':
        return VOID_TYPE;
      default:
        return UNKNOWN_TYPE;
    }
  }

  private analyzeBinaryExpression(expr: AST.BinaryExpression): Type {
    const leftType = this.analyzeExpression(expr.left);
    const rightType = this.analyzeExpression(expr.right);
    
    switch (expr.operator) {
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case '**':
        if (!isNumeric(leftType) || !isNumeric(rightType)) {
          this.error(
            expr.location,
            `Arithmetic operators require numeric types, got ${typeToString(leftType)} and ${typeToString(rightType)}`
          );
          return UNKNOWN_TYPE;
        }
        // Return the wider type
        return this.widenNumericTypes(leftType, rightType);
      
      case '==':
      case '!=':
        if (!isAssignableTo(leftType, rightType) && !isAssignableTo(rightType, leftType)) {
          this.error(
            expr.location,
            `Cannot compare ${typeToString(leftType)} with ${typeToString(rightType)}`
          );
        }
        return PRIMITIVES['Bool'];
      
      case '<':
      case '>':
      case '<=':
      case '>=':
        if (!isNumeric(leftType) || !isNumeric(rightType)) {
          this.error(
            expr.location,
            `Comparison operators require numeric types, got ${typeToString(leftType)} and ${typeToString(rightType)}`
          );
        }
        return PRIMITIVES['Bool'];
      
      case '&&':
      case '||':
        if (!isBoolean(leftType) || !isBoolean(rightType)) {
          this.error(
            expr.location,
            `Logical operators require Bool types, got ${typeToString(leftType)} and ${typeToString(rightType)}`
          );
        }
        return PRIMITIVES['Bool'];
      
      case '&':
      case '|':
      case '^':
      case '<<':
      case '>>':
        if (!isInteger(leftType) || !isInteger(rightType)) {
          this.error(
            expr.location,
            `Bitwise operators require integer types, got ${typeToString(leftType)} and ${typeToString(rightType)}`
          );
        }
        return leftType;
      
      default:
        return UNKNOWN_TYPE;
    }
  }

  private widenNumericTypes(a: Type, b: Type): Type {
    if (a.kind !== 'primitive' || b.kind !== 'primitive') return UNKNOWN_TYPE;
    
    // Float is wider than Int
    if (a.name.startsWith('Float') || b.name.startsWith('Float')) {
      return a.name === 'Float64' || b.name === 'Float64'
        ? PRIMITIVES['Float64']
        : PRIMITIVES['Float32'];
    }
    
    // Return the larger integer type
    const sizeA = parseInt(a.name.replace(/\D/g, '') || '64');
    const sizeB = parseInt(b.name.replace(/\D/g, '') || '64');
    return sizeA >= sizeB ? a : b;
  }

  private analyzeUnaryExpression(expr: AST.UnaryExpression): Type {
    const operandType = this.analyzeExpression(expr.operand);
    
    switch (expr.operator) {
      case '-':
        if (!isNumeric(operandType)) {
          this.error(
            expr.location,
            `Unary minus requires numeric type, got ${typeToString(operandType)}`
          );
        }
        return operandType;
      
      case '!':
        if (!isBoolean(operandType)) {
          this.error(
            expr.location,
            `Logical not requires Bool, got ${typeToString(operandType)}`
          );
        }
        return PRIMITIVES['Bool'];
      
      case '~':
        if (!isInteger(operandType)) {
          this.error(
            expr.location,
            `Bitwise not requires integer type, got ${typeToString(operandType)}`
          );
        }
        return operandType;
      
      case '&':
        return {
          kind: 'reference',
          inner: operandType,
          isMutable: false,
        };
      
      case '*':
        if (operandType.kind !== 'reference') {
          this.error(
            expr.location,
            `Cannot dereference non-reference type ${typeToString(operandType)}`
          );
          return UNKNOWN_TYPE;
        }
        return operandType.inner;
      
      default:
        return UNKNOWN_TYPE;
    }
  }

  private analyzeCallExpression(expr: AST.CallExpression): Type {
    const calleeType = this.analyzeExpression(expr.callee);
    
    if (calleeType.kind !== 'function') {
      // Could be a struct constructor
      if (calleeType.kind === 'struct' || calleeType.kind === 'enum') {
        return calleeType;
      }
      this.error(
        expr.location,
        `Cannot call non-function type ${typeToString(calleeType)}`
      );
      return UNKNOWN_TYPE;
    }
    
    // Check argument count
    if (expr.arguments.length !== calleeType.parameters.length) {
      this.error(
        expr.location,
        `Expected ${calleeType.parameters.length} arguments, got ${expr.arguments.length}`
      );
    }
    
    // Check argument types
    for (let i = 0; i < Math.min(expr.arguments.length, calleeType.parameters.length); i++) {
      const argType = this.analyzeExpression(expr.arguments[i]);
      const paramType = calleeType.parameters[i].type;
      
      if (!isAssignableTo(argType, paramType)) {
        this.error(
          expr.arguments[i].location,
          `Argument type mismatch: expected ${typeToString(paramType)}, got ${typeToString(argType)}`
        );
      }
    }
    
    // Check effect requirements
    if (calleeType.effects.length > 0) {
      const activeEffects = this.symbolTable.getActiveEffects();
      for (const effect of calleeType.effects) {
        if (!activeEffects.has(effect.name)) {
          this.error(
            expr.location,
            `Function requires effect ${effect.name} which is not declared in current context`
          );
        }
      }
    }
    
    return calleeType.returnType;
  }

  private analyzeMemberExpression(expr: AST.MemberExpression): Type {
    const objectType = this.analyzeExpression(expr.object);
    
    // Handle effect method calls (e.g., IO.write)
    if (objectType.kind === 'effect') {
      const method = objectType.methods.get(expr.property.name);
      if (!method) {
        this.error(
          expr.location,
          `Effect ${objectType.name} has no method ${expr.property.name}`
        );
        return UNKNOWN_TYPE;
      }
      return method;
    }
    
    // Handle struct field access
    if (objectType.kind === 'struct') {
      const fieldType = objectType.fields.get(expr.property.name);
      if (!fieldType) {
        this.error(
          expr.location,
          `Struct ${objectType.name} has no field ${expr.property.name}`
        );
        return UNKNOWN_TYPE;
      }
      return fieldType;
    }
    
    // Handle reference types
    if (objectType.kind === 'reference') {
      const innerType = objectType.inner;
      if (innerType.kind === 'struct') {
        const fieldType = innerType.fields.get(expr.property.name);
        if (!fieldType) {
          this.error(
            expr.location,
            `Struct ${innerType.name} has no field ${expr.property.name}`
          );
          return UNKNOWN_TYPE;
        }
        return fieldType;
      }
    }
    
    this.error(
      expr.location,
      `Cannot access member ${expr.property.name} on ${typeToString(objectType)}`
    );
    return UNKNOWN_TYPE;
  }

  private analyzeIndexExpression(expr: AST.IndexExpression): Type {
    const objectType = this.analyzeExpression(expr.object);
    const indexType = this.analyzeExpression(expr.index);
    
    if (objectType.kind === 'array') {
      if (!isInteger(indexType)) {
        this.error(
          expr.index.location,
          `Array index must be integer, got ${typeToString(indexType)}`
        );
      }
      return objectType.elementType;
    }
    
    if (objectType.kind === 'tuple') {
      if (indexType.kind === 'primitive' && expr.index.kind === 'Literal') {
        const index = expr.index.value as number;
        if (index < 0 || index >= objectType.elements.length) {
          this.error(
            expr.location,
            `Tuple index ${index} out of bounds (length ${objectType.elements.length})`
          );
          return UNKNOWN_TYPE;
        }
        return objectType.elements[index];
      }
    }
    
    this.error(
      expr.location,
      `Cannot index ${typeToString(objectType)}`
    );
    return UNKNOWN_TYPE;
  }

  private analyzeIfExpression(expr: AST.IfExpression): Type {
    const condType = this.analyzeExpression(expr.condition);
    
    if (!isBoolean(condType)) {
      this.error(
        expr.condition.location,
        `Condition must be Bool, got ${typeToString(condType)}`
      );
    }
    
    const thenType = this.analyzeBlockExpression(expr.thenBranch);
    
    if (expr.elseBranch) {
      let elseType: Type;
      if (expr.elseBranch.kind === 'IfExpression') {
        elseType = this.analyzeIfExpression(expr.elseBranch);
      } else {
        elseType = this.analyzeBlockExpression(expr.elseBranch);
      }
      
      // Both branches must have compatible types
      if (!typeEquals(thenType, elseType)) {
        this.warning(
          expr.location,
          `If-else branches have different types: ${typeToString(thenType)} vs ${typeToString(elseType)}`
        );
      }
      
      return thenType;
    }
    
    return VOID_TYPE;
  }

  private analyzeMatchExpression(expr: AST.MatchExpression): Type {
    const subjectType = this.analyzeExpression(expr.subject);
    
    let resultType: Type | null = null;
    
    for (const arm of expr.arms) {
      const armType = this.analyzeMatchArm(arm, subjectType);
      
      if (resultType === null) {
        resultType = armType;
      } else if (!typeEquals(resultType, armType)) {
        this.warning(
          arm.location,
          `Match arm has different type: expected ${typeToString(resultType)}, got ${typeToString(armType)}`
        );
      }
    }
    
    return resultType || VOID_TYPE;
  }

  private analyzeBlockExpression(expr: AST.BlockExpression): Type {
    this.symbolTable.enterScope('block', 'block');
    
    for (const stmt of expr.statements) {
      this.analyzeStatement(stmt);
    }
    
    let resultType: Type = VOID_TYPE;
    if (expr.expression) {
      resultType = this.analyzeExpression(expr.expression);
    }
    
    this.symbolTable.exitScope();
    return resultType;
  }

  private analyzeLambdaExpression(expr: AST.LambdaExpression): Type {
    this.symbolTable.enterScope('lambda', 'function');
    
    const parameters: { name: string; type: Type; isMutable: boolean }[] = [];
    
    for (const param of expr.parameters) {
      const paramType = this.resolveType(param.type);
      this.symbolTable.define(
        param.name.name,
        paramType,
        'parameter',
        param.location,
        { isMutable: param.isMutable }
      );
      parameters.push({
        name: param.name.name,
        type: paramType,
        isMutable: param.isMutable,
      });
    }
    
    const bodyType = this.analyzeExpression(expr.body);
    
    this.symbolTable.exitScope();
    
    return {
      kind: 'function',
      parameters,
      returnType: expr.returnType ? this.resolveType(expr.returnType) : bodyType,
      effects: [],
      capabilities: [],
      contracts: [],
      isPure: true,
    };
  }

  private analyzeArrayExpression(expr: AST.ArrayExpression): Type {
    if (expr.elements.length === 0) {
      return { kind: 'array', elementType: UNKNOWN_TYPE, size: 0 };
    }
    
    const elementType = this.analyzeExpression(expr.elements[0]);
    
    for (let i = 1; i < expr.elements.length; i++) {
      const elemType = this.analyzeExpression(expr.elements[i]);
      if (!isAssignableTo(elemType, elementType)) {
        this.error(
          expr.elements[i].location,
          `Array element type mismatch: expected ${typeToString(elementType)}, got ${typeToString(elemType)}`
        );
      }
    }
    
    return { kind: 'array', elementType, size: null };
  }

  private analyzeTupleExpression(expr: AST.TupleExpression): Type {
    const elements = expr.elements.map(e => this.analyzeExpression(e));
    return { kind: 'tuple', elements };
  }

  private analyzeStructExpression(expr: AST.StructExpression): Type {
    const structType = this.symbolTable.lookupType(expr.type.name);
    
    if (!structType || structType.kind !== 'struct') {
      this.error(expr.location, `Unknown struct type: ${expr.type.name}`);
      return UNKNOWN_TYPE;
    }
    
    const providedFields = new Set<string>();
    
    for (const field of expr.fields) {
      providedFields.add(field.name.name);
      
      const expectedType = structType.fields.get(field.name.name);
      if (!expectedType) {
        this.error(
          field.location,
          `Unknown field ${field.name.name} in struct ${expr.type.name}`
        );
        continue;
      }
      
      const actualType = this.analyzeExpression(field.value);
      if (!isAssignableTo(actualType, expectedType)) {
        this.error(
          field.location,
          `Field ${field.name.name} expects ${typeToString(expectedType)}, got ${typeToString(actualType)}`
        );
      }
    }
    
    // Check for missing required fields
    if (!expr.spread) {
      for (const [fieldName] of structType.fields) {
        if (!providedFields.has(fieldName)) {
          this.error(
            expr.location,
            `Missing field ${fieldName} in struct ${expr.type.name}`
          );
        }
      }
    }
    
    return structType;
  }

  private analyzeOldExpression(expr: AST.OldExpression): Type {
    if (!this.inContractContext) {
      this.error(expr.location, 'old() can only be used in contract annotations');
      return UNKNOWN_TYPE;
    }
    return this.analyzeExpression(expr.expression);
  }

  private analyzeForallExpression(expr: AST.ForallExpression): Type {
    if (!this.inContractContext) {
      this.error(expr.location, 'forall can only be used in contract annotations');
    }
    
    this.symbolTable.enterScope('forall', 'block');
    
    for (const binding of expr.bindings) {
      // Infer binding type from range if provided
      let bindingType: Type = PRIMITIVES['Int'];
      if (binding.range) {
        const rangeType = this.analyzeExpression(binding.range);
        if (rangeType.kind === 'array') {
          bindingType = rangeType.elementType;
        }
      }
      this.symbolTable.define(
        binding.name.name,
        bindingType,
        'variable',
        binding.location
      );
    }
    
    const condType = this.analyzeExpression(expr.condition);
    if (!isBoolean(condType)) {
      this.error(
        expr.condition.location,
        `forall condition must be Bool, got ${typeToString(condType)}`
      );
    }
    
    this.symbolTable.exitScope();
    return PRIMITIVES['Bool'];
  }

  private analyzeExistsExpression(expr: AST.ExistsExpression): Type {
    if (!this.inContractContext) {
      this.error(expr.location, 'exists can only be used in contract annotations');
    }
    
    this.symbolTable.enterScope('exists', 'block');
    
    for (const binding of expr.bindings) {
      let bindingType: Type = PRIMITIVES['Int'];
      if (binding.range) {
        const rangeType = this.analyzeExpression(binding.range);
        if (rangeType.kind === 'array') {
          bindingType = rangeType.elementType;
        }
      }
      this.symbolTable.define(
        binding.name.name,
        bindingType,
        'variable',
        binding.location
      );
    }
    
    const condType = this.analyzeExpression(expr.condition);
    if (!isBoolean(condType)) {
      this.error(
        expr.condition.location,
        `exists condition must be Bool, got ${typeToString(condType)}`
      );
    }
    
    this.symbolTable.exitScope();
    return PRIMITIVES['Bool'];
  }

  private analyzeTryExpression(expr: AST.TryExpression): Type {
    const innerType = this.analyzeExpression(expr.expression);
    
    if (innerType.kind !== 'result') {
      this.error(
        expr.location,
        `? operator can only be used on Result types, got ${typeToString(innerType)}`
      );
      return UNKNOWN_TYPE;
    }
    
    // Check that we're in a function that returns Result
    if (this.currentFunction) {
      const returnType = this.resolveType(this.currentFunction.returnType);
      if (returnType.kind !== 'result') {
        this.error(
          expr.location,
          `Cannot use ? in function that doesn't return Result`
        );
      }
    }
    
    return innerType.okType;
  }

  private analyzeAssignmentExpression(expr: AST.AssignmentExpression): Type {
    const leftType = this.analyzeExpression(expr.left);
    const rightType = this.analyzeExpression(expr.right);
    
    // Check if target is assignable
    if (expr.left.kind === 'Identifier') {
      const symbol = this.symbolTable.lookup(expr.left.name);
      if (symbol && !symbol.isMutable) {
        this.error(expr.location, `Cannot assign to immutable variable ${expr.left.name}`);
      }
    }
    
    if (expr.operator === '=') {
      if (!isAssignableTo(rightType, leftType)) {
        this.error(
          expr.location,
          `Cannot assign ${typeToString(rightType)} to ${typeToString(leftType)}`
        );
      }
    } else {
      // Compound assignment: check both sides are compatible
      if (!isNumeric(leftType) || !isNumeric(rightType)) {
        this.error(
          expr.location,
          `Compound assignment requires numeric types`
        );
      }
    }
    
    return leftType;
  }

  // ============================================================================
  // Type Resolution
  // ============================================================================

  private resolveType(typeExpr: AST.TypeExpression): Type {
    switch (typeExpr.kind) {
      case 'PrimitiveType':
        return PRIMITIVES[typeExpr.name] || VOID_TYPE;
      
      case 'NamedType': {
        const type = this.symbolTable.lookupType(typeExpr.name.name);
        if (!type) {
          this.error(typeExpr.location, `Unknown type: ${typeExpr.name.name}`);
          return UNKNOWN_TYPE;
        }
        return type;
      }
      
      case 'GenericType': {
        const baseType = this.resolveType(typeExpr.base);
        const args = typeExpr.arguments.map(a => this.resolveType(a));
        return {
          kind: 'generic',
          base: baseType,
          arguments: args,
        };
      }
      
      case 'ArrayType':
        return {
          kind: 'array',
          elementType: this.resolveType(typeExpr.elementType),
          size: typeExpr.size,
        };
      
      case 'TupleType':
        return {
          kind: 'tuple',
          elements: typeExpr.elements.map(e => this.resolveType(e)),
        };
      
      case 'FunctionType': {
        const effects: EffectType[] = [];
        for (const eff of typeExpr.effects) {
          const effType = this.resolveType(eff);
          if (effType.kind === 'effect') {
            effects.push(effType);
          }
        }
        return {
          kind: 'function',
          parameters: typeExpr.parameters.map((p, i) => ({
            name: `_${i}`,
            type: this.resolveType(p),
            isMutable: false,
          })),
          returnType: this.resolveType(typeExpr.returnType),
          effects,
          capabilities: [],
          contracts: [],
          isPure: effects.length === 0,
        };
      }
      
      case 'ReferenceType':
        return {
          kind: 'reference',
          inner: this.resolveType(typeExpr.inner),
          isMutable: typeExpr.isMutable,
        };
      
      case 'OptionalType':
        return {
          kind: 'optional',
          inner: this.resolveType(typeExpr.inner),
        };
      
      case 'ResultType':
        return {
          kind: 'result',
          okType: this.resolveType(typeExpr.okType),
          errType: this.resolveType(typeExpr.errType),
        };
      
      case 'NeverType':
        return NEVER_TYPE;
      
      default:
        return UNKNOWN_TYPE;
    }
  }

  private createFunctionType(decl: AST.FunctionDeclaration): FunctionType {
    const parameters = decl.parameters.map(p => ({
      name: p.name.name,
      type: this.resolveType(p.type),
      isMutable: p.isMutable,
    }));
    
    const effects: EffectType[] = [];
    const capabilities: CapabilityType[] = [];
    const contracts: { name: string; genericArgs: Type[] }[] = [];
    
    for (const ann of decl.annotations) {
      switch (ann.kind) {
        case 'EffectAnnotation':
          for (const eff of ann.effects) {
            const effType = this.resolveType(eff);
            if (effType.kind === 'effect') {
              effects.push(effType);
            }
          }
          break;
        
        case 'CapabilityAnnotation':
          const capType = this.symbolTable.lookupType(ann.capability.name);
          if (capType?.kind === 'capability') {
            capabilities.push(capType);
          }
          break;
        
        case 'ContractAnnotation':
          contracts.push({
            name: ann.contract.name,
            genericArgs: ann.genericArgs.map(a => this.resolveType(a)),
          });
          break;
      }
    }
    
    return {
      kind: 'function',
      parameters,
      returnType: this.resolveType(decl.returnType),
      effects,
      capabilities,
      contracts,
      isPure: decl.isPure,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private expressionToString(expr: AST.Expression): string {
    // Simple serialization for contract conditions
    switch (expr.kind) {
      case 'Identifier':
        return expr.name;
      case 'Literal':
        return String(expr.value);
      case 'BinaryExpression':
        return `(${this.expressionToString(expr.left)} ${expr.operator} ${this.expressionToString(expr.right)})`;
      case 'UnaryExpression':
        return `${expr.operator}${this.expressionToString(expr.operand)}`;
      case 'CallExpression':
        const args = expr.arguments.map(a => this.expressionToString(a)).join(', ');
        return `${this.expressionToString(expr.callee)}(${args})`;
      case 'MemberExpression':
        return `${this.expressionToString(expr.object)}.${expr.property.name}`;
      default:
        return '<expr>';
    }
  }

  private error(location: SourceLocation, message: string): void {
    this.errors.push({ message, location, severity: 'error' });
  }

  private warning(location: SourceLocation, message: string): void {
    this.warnings.push({ message, location, severity: 'warning' });
  }
}

export function analyze(program: AST.Program): AnalysisResult {
  const analyzer = new SemanticAnalyzer();
  return analyzer.analyze(program);
}
