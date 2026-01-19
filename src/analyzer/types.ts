/**
 * Intent Language - Type System
 * 
 * Defines the internal type representation used during type checking.
 * Supports all Intent type features including generics, effects, and contracts.
 */

export type Type =
  | PrimitiveType
  | StructType
  | EnumType
  | TraitType
  | ArrayType
  | TupleType
  | FunctionType
  | GenericType
  | TypeVariable
  | ReferenceType
  | OptionalType
  | ResultType
  | NeverType
  | VoidType
  | UnknownType
  | ErrorType
  | EffectType
  | CapabilityType;

export interface PrimitiveType {
  kind: 'primitive';
  name: 'Int' | 'Int8' | 'Int16' | 'Int32' | 'Int64' | 'UInt' |
        'Float32' | 'Float64' | 'Bool' | 'Char' | 'String';
}

export interface StructType {
  kind: 'struct';
  name: string;
  fields: Map<string, Type>;
  genericParams: TypeVariable[];
  invariants: ContractCondition[];
  module: string;
}

export interface EnumType {
  kind: 'enum';
  name: string;
  variants: Map<string, Type[] | null>;
  genericParams: TypeVariable[];
  module: string;
}

export interface TraitType {
  kind: 'trait';
  name: string;
  methods: Map<string, FunctionType>;
  supertraits: TraitType[];
  genericParams: TypeVariable[];
  module: string;
}

export interface ArrayType {
  kind: 'array';
  elementType: Type;
  size: number | null; // null for dynamic arrays
}

export interface TupleType {
  kind: 'tuple';
  elements: Type[];
}

export interface FunctionType {
  kind: 'function';
  parameters: ParameterType[];
  returnType: Type;
  effects: EffectType[];
  capabilities: CapabilityType[];
  contracts: ContractRef[];
  isPure: boolean;
}

export interface ParameterType {
  name: string;
  type: Type;
  isMutable: boolean;
}

export interface GenericType {
  kind: 'generic';
  base: Type;
  arguments: Type[];
}

export interface TypeVariable {
  kind: 'typevar';
  name: string;
  bounds: Type[];
  id: number;
}

export interface ReferenceType {
  kind: 'reference';
  inner: Type;
  isMutable: boolean;
}

export interface OptionalType {
  kind: 'optional';
  inner: Type;
}

export interface ResultType {
  kind: 'result';
  okType: Type;
  errType: Type;
}

export interface NeverType {
  kind: 'never';
}

export interface VoidType {
  kind: 'void';
}

export interface UnknownType {
  kind: 'unknown';
}

export interface ErrorType {
  kind: 'error';
  message: string;
}

// ============================================================================
// Effects and Capabilities
// ============================================================================

export interface EffectType {
  kind: 'effect';
  name: string;
  methods: Map<string, FunctionType>;
  genericParams: TypeVariable[];
  module: string;
}

export interface CapabilityType {
  kind: 'capability';
  name: string;
  permissions: Map<string, Type>;
  module: string;
}

// ============================================================================
// Contracts
// ============================================================================

export interface ContractRef {
  name: string;
  genericArgs: Type[];
}

export interface ContractCondition {
  kind: 'requires' | 'ensures' | 'invariant';
  expression: string; // Serialized condition for verification
  location: { line: number; column: number };
}

// ============================================================================
// Type Utilities
// ============================================================================

let typeVarCounter = 0;

export function createTypeVariable(name: string, bounds: Type[] = []): TypeVariable {
  return {
    kind: 'typevar',
    name,
    bounds,
    id: typeVarCounter++,
  };
}

export function isPrimitive(type: Type): type is PrimitiveType {
  return type.kind === 'primitive';
}

export function isNumeric(type: Type): boolean {
  if (type.kind !== 'primitive') return false;
  return ['Int', 'Int8', 'Int16', 'Int32', 'Int64', 'UInt', 'Float32', 'Float64'].includes(type.name);
}

export function isInteger(type: Type): boolean {
  if (type.kind !== 'primitive') return false;
  return ['Int', 'Int8', 'Int16', 'Int32', 'Int64', 'UInt'].includes(type.name);
}

export function isFloat(type: Type): boolean {
  if (type.kind !== 'primitive') return false;
  return ['Float32', 'Float64'].includes(type.name);
}

export function isBoolean(type: Type): boolean {
  return type.kind === 'primitive' && type.name === 'Bool';
}

export function isString(type: Type): boolean {
  return type.kind === 'primitive' && type.name === 'String';
}

export function isVoid(type: Type): boolean {
  return type.kind === 'void';
}

export function isNever(type: Type): boolean {
  return type.kind === 'never';
}

export function isOptional(type: Type): type is OptionalType {
  return type.kind === 'optional';
}

export function isResult(type: Type): type is ResultType {
  return type.kind === 'result';
}

export function isFunction(type: Type): type is FunctionType {
  return type.kind === 'function';
}

export function isReference(type: Type): type is ReferenceType {
  return type.kind === 'reference';
}

export function typeEquals(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  
  switch (a.kind) {
    case 'primitive':
      return a.name === (b as PrimitiveType).name;
    
    case 'void':
    case 'never':
    case 'unknown':
      return true;
    
    case 'error':
      return (b as ErrorType).message === a.message;
    
    case 'array':
      const bArray = b as ArrayType;
      return typeEquals(a.elementType, bArray.elementType) && a.size === bArray.size;
    
    case 'tuple':
      const bTuple = b as TupleType;
      return a.elements.length === bTuple.elements.length &&
             a.elements.every((e, i) => typeEquals(e, bTuple.elements[i]));
    
    case 'optional':
      return typeEquals(a.inner, (b as OptionalType).inner);
    
    case 'result':
      const bResult = b as ResultType;
      return typeEquals(a.okType, bResult.okType) && typeEquals(a.errType, bResult.errType);
    
    case 'reference':
      const bRef = b as ReferenceType;
      return a.isMutable === bRef.isMutable && typeEquals(a.inner, bRef.inner);
    
    case 'struct':
      return a.name === (b as StructType).name && a.module === (b as StructType).module;
    
    case 'enum':
      return a.name === (b as EnumType).name && a.module === (b as EnumType).module;
    
    case 'trait':
      return a.name === (b as TraitType).name && a.module === (b as TraitType).module;
    
    case 'typevar':
      return a.id === (b as TypeVariable).id;
    
    case 'function':
      const bFunc = b as FunctionType;
      return a.parameters.length === bFunc.parameters.length &&
             a.parameters.every((p, i) => typeEquals(p.type, bFunc.parameters[i].type)) &&
             typeEquals(a.returnType, bFunc.returnType) &&
             a.isPure === bFunc.isPure;
    
    case 'generic':
      const bGen = b as GenericType;
      return typeEquals(a.base, bGen.base) &&
             a.arguments.length === bGen.arguments.length &&
             a.arguments.every((arg, i) => typeEquals(arg, bGen.arguments[i]));
    
    default:
      return false;
  }
}

export function isAssignableTo(source: Type, target: Type): boolean {
  // Never is assignable to anything
  if (source.kind === 'never') return true;
  
  // Anything is assignable to unknown
  if (target.kind === 'unknown') return true;
  
  // Error types propagate
  if (source.kind === 'error' || target.kind === 'error') return true;
  
  // Exact type match
  if (typeEquals(source, target)) return true;
  
  // Optional handling: T is assignable to T?
  if (target.kind === 'optional') {
    return isAssignableTo(source, target.inner);
  }
  
  // Reference handling
  if (source.kind === 'reference' && target.kind === 'reference') {
    // &mut T is assignable to &T
    if (!target.isMutable && source.isMutable) {
      return isAssignableTo(source.inner, target.inner);
    }
    return source.isMutable === target.isMutable && isAssignableTo(source.inner, target.inner);
  }
  
  // Numeric coercion
  if (isNumeric(source) && isNumeric(target)) {
    // Allow widening conversions
    const sourceSize = getNumericSize(source);
    const targetSize = getNumericSize(target);
    if (isInteger(source) && isInteger(target)) {
      return sourceSize <= targetSize;
    }
    if (isFloat(source) && isFloat(target)) {
      return sourceSize <= targetSize;
    }
    // Int to Float
    if (isInteger(source) && isFloat(target)) {
      return true;
    }
  }
  
  return false;
}

function getNumericSize(type: Type): number {
  if (type.kind !== 'primitive') return 0;
  switch (type.name) {
    case 'Int8': return 8;
    case 'Int16': return 16;
    case 'Int32': case 'Float32': return 32;
    case 'Int64': case 'Float64': case 'Int': case 'UInt': return 64;
    default: return 0;
  }
}

export function typeToString(type: Type): string {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'void':
      return 'Void';
    case 'never':
      return 'Never';
    case 'unknown':
      return 'unknown';
    case 'error':
      return `<error: ${type.message}>`;
    case 'array':
      return type.size !== null
        ? `[${typeToString(type.elementType)}; ${type.size}]`
        : `[${typeToString(type.elementType)}]`;
    case 'tuple':
      return `(${type.elements.map(typeToString).join(', ')})`;
    case 'optional':
      return `${typeToString(type.inner)}?`;
    case 'result':
      return `Result<${typeToString(type.okType)}, ${typeToString(type.errType)}>`;
    case 'reference':
      return type.isMutable
        ? `&mut ${typeToString(type.inner)}`
        : `&${typeToString(type.inner)}`;
    case 'struct':
    case 'enum':
    case 'trait':
      return type.name;
    case 'typevar':
      return type.name;
    case 'function':
      const params = type.parameters.map(p => typeToString(p.type)).join(', ');
      const effects = type.effects.length > 0
        ? ` @effect[${type.effects.map(e => e.name).join(', ')}]`
        : '';
      return `fn(${params}) -> ${typeToString(type.returnType)}${effects}`;
    case 'generic':
      return `${typeToString(type.base)}<${type.arguments.map(typeToString).join(', ')}>`;
    case 'effect':
      return `effect ${type.name}`;
    case 'capability':
      return `capability ${type.name}`;
    default:
      return 'unknown';
  }
}

// Built-in types
export const PRIMITIVES: Record<string, PrimitiveType> = {
  'Int': { kind: 'primitive', name: 'Int' },
  'Int8': { kind: 'primitive', name: 'Int8' },
  'Int16': { kind: 'primitive', name: 'Int16' },
  'Int32': { kind: 'primitive', name: 'Int32' },
  'Int64': { kind: 'primitive', name: 'Int64' },
  'UInt': { kind: 'primitive', name: 'UInt' },
  'Float32': { kind: 'primitive', name: 'Float32' },
  'Float64': { kind: 'primitive', name: 'Float64' },
  'Bool': { kind: 'primitive', name: 'Bool' },
  'Char': { kind: 'primitive', name: 'Char' },
  'String': { kind: 'primitive', name: 'String' },
};

export const VOID_TYPE: VoidType = { kind: 'void' };
export const NEVER_TYPE: NeverType = { kind: 'never' };
export const UNKNOWN_TYPE: UnknownType = { kind: 'unknown' };
