/**
 * Intent Language - Symbol Table
 * 
 * Manages symbol scopes for name resolution and type information.
 * Supports nested scopes, type definitions, and effect tracking.
 */

import {
  Type,
  TypeVariable,
} from './types';

export interface Symbol {
  name: string;
  type: Type;
  isMutable: boolean;
  isExported: boolean;
  kind: SymbolKind;
  location: { line: number; column: number };
  module: string;
}

export type SymbolKind =
  | 'variable'
  | 'parameter'
  | 'function'
  | 'type'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'effect'
  | 'capability'
  | 'contract'
  | 'intent'
  | 'typevar'
  | 'module';

export interface ContractSymbol {
  name: string;
  genericParams: TypeVariable[];
  requires: string[];
  ensures: string[];
  invariants: string[];
  module: string;
}

export interface IntentSymbol {
  name: string;
  genericParams: TypeVariable[];
  ensures: string[];
  module: string;
}

export class Scope {
  private symbols: Map<string, Symbol> = new Map();
  private types: Map<string, Type> = new Map();
  private contracts: Map<string, ContractSymbol> = new Map();
  private intents: Map<string, IntentSymbol> = new Map();
  
  constructor(
    public readonly parent: Scope | null = null,
    public readonly name: string = 'global',
    public readonly kind: 'global' | 'module' | 'function' | 'block' | 'loop' = 'block'
  ) {}

  define(symbol: Symbol): boolean {
    if (this.symbols.has(symbol.name)) {
      return false; // Already defined in this scope
    }
    this.symbols.set(symbol.name, symbol);
    return true;
  }

  defineType(name: string, type: Type): boolean {
    if (this.types.has(name)) {
      return false;
    }
    this.types.set(name, type);
    return true;
  }

  defineContract(contract: ContractSymbol): boolean {
    if (this.contracts.has(contract.name)) {
      return false;
    }
    this.contracts.set(contract.name, contract);
    return true;
  }

  defineIntent(intent: IntentSymbol): boolean {
    if (this.intents.has(intent.name)) {
      return false;
    }
    this.intents.set(intent.name, intent);
    return true;
  }

  lookup(name: string): Symbol | null {
    const symbol = this.symbols.get(name);
    if (symbol) return symbol;
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  lookupType(name: string): Type | null {
    const type = this.types.get(name);
    if (type) return type;
    if (this.parent) return this.parent.lookupType(name);
    return null;
  }

  lookupContract(name: string): ContractSymbol | null {
    const contract = this.contracts.get(name);
    if (contract) return contract;
    if (this.parent) return this.parent.lookupContract(name);
    return null;
  }

  lookupIntent(name: string): IntentSymbol | null {
    const intent = this.intents.get(name);
    if (intent) return intent;
    if (this.parent) return this.parent.lookupIntent(name);
    return null;
  }

  lookupLocal(name: string): Symbol | null {
    return this.symbols.get(name) || null;
  }

  lookupTypeLocal(name: string): Type | null {
    return this.types.get(name) || null;
  }

  getAllSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }

  getAllTypes(): Map<string, Type> {
    return new Map(this.types);
  }

  getExportedSymbols(): Symbol[] {
    return Array.from(this.symbols.values()).filter(s => s.isExported);
  }

  findEnclosingFunction(): Scope | null {
    if (this.kind === 'function') return this;
    if (this.parent) return this.parent.findEnclosingFunction();
    return null;
  }

  findEnclosingLoop(): Scope | null {
    if (this.kind === 'loop') return this;
    if (this.parent) return this.parent.findEnclosingLoop();
    return null;
  }
}

export class SymbolTable {
  private globalScope: Scope;
  private currentScope: Scope;
  private modules: Map<string, Scope> = new Map();
  
  // Track active effects in current context
  private activeEffects: Set<string> = new Set();
  
  // Track required capabilities
  private requiredCapabilities: Map<string, Map<string, boolean>> = new Map();

  constructor() {
    this.globalScope = new Scope(null, 'global', 'global');
    this.currentScope = this.globalScope;
    this.initBuiltins();
  }

  private initBuiltins(): void {
    // Built-in types are handled by the type system
    // Here we can define built-in functions if needed
  }

  enterScope(name: string, kind: 'module' | 'function' | 'block' | 'loop' = 'block'): Scope {
    const scope = new Scope(this.currentScope, name, kind);
    this.currentScope = scope;
    
    if (kind === 'module') {
      this.modules.set(name, scope);
    }
    
    return scope;
  }

  exitScope(): Scope {
    const exited = this.currentScope;
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
    return exited;
  }

  getCurrentScope(): Scope {
    return this.currentScope;
  }

  getGlobalScope(): Scope {
    return this.globalScope;
  }

  getModule(name: string): Scope | null {
    return this.modules.get(name) || null;
  }

  define(
    name: string,
    type: Type,
    kind: SymbolKind,
    location: { line: number; column: number },
    options: { isMutable?: boolean; isExported?: boolean; module?: string } = {}
  ): boolean {
    const symbol: Symbol = {
      name,
      type,
      kind,
      location,
      isMutable: options.isMutable ?? false,
      isExported: options.isExported ?? false,
      module: options.module ?? this.currentScope.name,
    };
    return this.currentScope.define(symbol);
  }

  defineType(name: string, type: Type): boolean {
    return this.currentScope.defineType(name, type);
  }

  defineContract(contract: ContractSymbol): boolean {
    return this.currentScope.defineContract(contract);
  }

  defineIntent(intent: IntentSymbol): boolean {
    return this.currentScope.defineIntent(intent);
  }

  lookup(name: string): Symbol | null {
    return this.currentScope.lookup(name);
  }

  lookupType(name: string): Type | null {
    return this.currentScope.lookupType(name);
  }

  lookupContract(name: string): ContractSymbol | null {
    return this.currentScope.lookupContract(name);
  }

  lookupIntent(name: string): IntentSymbol | null {
    return this.currentScope.lookupIntent(name);
  }

  // Effect tracking
  addEffect(effect: string): void {
    this.activeEffects.add(effect);
  }

  hasEffect(effect: string): boolean {
    return this.activeEffects.has(effect);
  }

  getActiveEffects(): Set<string> {
    return new Set(this.activeEffects);
  }

  clearEffects(): void {
    this.activeEffects.clear();
  }

  setEffects(effects: string[]): void {
    this.activeEffects = new Set(effects);
  }

  // Capability tracking
  addCapability(name: string, permissions: Map<string, boolean>): void {
    this.requiredCapabilities.set(name, permissions);
  }

  hasCapability(name: string, permission: string): boolean {
    const cap = this.requiredCapabilities.get(name);
    return cap?.get(permission) ?? false;
  }

  getRequiredCapabilities(): Map<string, Map<string, boolean>> {
    return new Map(this.requiredCapabilities);
  }

  clearCapabilities(): void {
    this.requiredCapabilities.clear();
  }
}
