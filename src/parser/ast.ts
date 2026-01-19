/**
 * Intent Language - Abstract Syntax Tree Definitions
 * 
 * The AST represents the syntactic structure of Intent programs.
 * It includes all language constructs: declarations, expressions,
 * types, contracts, effects, and intent blocks.
 */

import { SourceLocation } from '../lexer/token';

// Base node interface
export interface ASTNode {
  kind: string;
  location: SourceLocation;
}

// ============================================================================
// Program Structure
// ============================================================================

export interface Program extends ASTNode {
  kind: 'Program';
  statements: Statement[];
}

export type Statement =
  | Declaration
  | ExpressionStatement
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | ForStatement
  | MatchStatement
  | BlockStatement;

export interface ExpressionStatement extends ASTNode {
  kind: 'ExpressionStatement';
  expression: Expression;
}

export interface ReturnStatement extends ASTNode {
  kind: 'ReturnStatement';
  value: Expression | null;
}

export interface BlockStatement extends ASTNode {
  kind: 'BlockStatement';
  statements: Statement[];
}

// ============================================================================
// Declarations
// ============================================================================

export type Declaration =
  | FunctionDeclaration
  | VariableDeclaration
  | TypeAliasDeclaration
  | StructDeclaration
  | EnumDeclaration
  | TraitDeclaration
  | ImplDeclaration
  | ContractDeclaration
  | IntentDeclaration
  | EffectDeclaration
  | CapabilityDeclaration
  | ImportDeclaration
  | ExportDeclaration;

export interface FunctionDeclaration extends ASTNode {
  kind: 'FunctionDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  parameters: Parameter[];
  returnType: TypeExpression;
  annotations: Annotation[];
  body: BlockStatement | null; // null for extern declarations
  isPure: boolean;
  isExported: boolean;
}

export interface Parameter extends ASTNode {
  kind: 'Parameter';
  name: Identifier;
  type: TypeExpression;
  isMutable: boolean;
  defaultValue: Expression | null;
}

export interface VariableDeclaration extends ASTNode {
  kind: 'VariableDeclaration';
  name: Identifier;
  type: TypeExpression | null;
  initializer: Expression | null;
  isMutable: boolean;
  isExported: boolean;
}

export interface TypeAliasDeclaration extends ASTNode {
  kind: 'TypeAliasDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  type: TypeExpression;
  isExported: boolean;
}

export interface StructDeclaration extends ASTNode {
  kind: 'StructDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  fields: StructField[];
  invariants: Annotation[];
  isExported: boolean;
}

export interface StructField extends ASTNode {
  kind: 'StructField';
  name: Identifier;
  type: TypeExpression;
  defaultValue: Expression | null;
  annotations: Annotation[];
}

export interface EnumDeclaration extends ASTNode {
  kind: 'EnumDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  variants: EnumVariant[];
  isExported: boolean;
}

export interface EnumVariant extends ASTNode {
  kind: 'EnumVariant';
  name: Identifier;
  fields: TypeExpression[] | null; // null for unit variants
}

export interface TraitDeclaration extends ASTNode {
  kind: 'TraitDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  supertraits: TypeExpression[];
  methods: FunctionDeclaration[];
  isExported: boolean;
}

export interface ImplDeclaration extends ASTNode {
  kind: 'ImplDeclaration';
  genericParams: GenericParameter[];
  trait: TypeExpression | null; // null for inherent impls
  forType: TypeExpression;
  methods: FunctionDeclaration[];
  whereClause: WhereClause | null;
}

export interface ContractDeclaration extends ASTNode {
  kind: 'ContractDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  annotations: Annotation[];
  isExported: boolean;
}

export interface IntentDeclaration extends ASTNode {
  kind: 'IntentDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  annotations: Annotation[];
  isExported: boolean;
}

export interface EffectDeclaration extends ASTNode {
  kind: 'EffectDeclaration';
  name: Identifier;
  genericParams: GenericParameter[];
  methods: FunctionDeclaration[];
  isExported: boolean;
}

export interface CapabilityDeclaration extends ASTNode {
  kind: 'CapabilityDeclaration';
  name: Identifier;
  fields: CapabilityField[];
  isExported: boolean;
}

export interface CapabilityField extends ASTNode {
  kind: 'CapabilityField';
  name: Identifier;
  type: TypeExpression;
}

export interface ImportDeclaration extends ASTNode {
  kind: 'ImportDeclaration';
  path: string[];
  imports: ImportSpecifier[];
  isWildcard: boolean;
}

export interface ImportSpecifier extends ASTNode {
  kind: 'ImportSpecifier';
  name: Identifier;
  alias: Identifier | null;
}

export interface ExportDeclaration extends ASTNode {
  kind: 'ExportDeclaration';
  declaration: Declaration;
}

// ============================================================================
// Generics
// ============================================================================

export interface GenericParameter extends ASTNode {
  kind: 'GenericParameter';
  name: Identifier;
  bounds: TypeExpression[];
  defaultType: TypeExpression | null;
}

export interface WhereClause extends ASTNode {
  kind: 'WhereClause';
  constraints: TypeConstraint[];
}

export interface TypeConstraint extends ASTNode {
  kind: 'TypeConstraint';
  type: TypeExpression;
  bounds: TypeExpression[];
}

// ============================================================================
// Annotations (Contracts, Effects, Capabilities)
// ============================================================================

export type Annotation =
  | RequiresAnnotation
  | EnsuresAnnotation
  | InvariantAnnotation
  | EffectAnnotation
  | CapabilityAnnotation
  | ContractAnnotation
  | IntentAnnotation
  | VerifyAnnotation;

export interface RequiresAnnotation extends ASTNode {
  kind: 'RequiresAnnotation';
  condition: Expression;
}

export interface EnsuresAnnotation extends ASTNode {
  kind: 'EnsuresAnnotation';
  condition: Expression;
}

export interface InvariantAnnotation extends ASTNode {
  kind: 'InvariantAnnotation';
  condition: Expression;
}

export interface EffectAnnotation extends ASTNode {
  kind: 'EffectAnnotation';
  effects: TypeExpression[];
}

export interface CapabilityAnnotation extends ASTNode {
  kind: 'CapabilityAnnotation';
  capability: Identifier;
  fields: Record<string, Expression>;
}

export interface ContractAnnotation extends ASTNode {
  kind: 'ContractAnnotation';
  contract: Identifier;
  genericArgs: TypeExpression[];
}

export interface IntentAnnotation extends ASTNode {
  kind: 'IntentAnnotation';
  intent: Identifier;
  genericArgs: TypeExpression[];
}

export interface VerifyAnnotation extends ASTNode {
  kind: 'VerifyAnnotation';
  level: 'full' | 'runtime' | 'trusted';
}

// ============================================================================
// Type Expressions
// ============================================================================

export type TypeExpression =
  | PrimitiveType
  | NamedType
  | GenericType
  | ArrayType
  | TupleType
  | FunctionType
  | ReferenceType
  | OptionalType
  | ResultType
  | NeverType;

export interface PrimitiveType extends ASTNode {
  kind: 'PrimitiveType';
  name: 'Int' | 'Int8' | 'Int16' | 'Int32' | 'Int64' | 'UInt' | 
        'Float32' | 'Float64' | 'Bool' | 'Char' | 'String' | 'Void';
}

export interface NamedType extends ASTNode {
  kind: 'NamedType';
  name: Identifier;
  path: Identifier[];
}

export interface GenericType extends ASTNode {
  kind: 'GenericType';
  base: TypeExpression;
  arguments: TypeExpression[];
}

export interface ArrayType extends ASTNode {
  kind: 'ArrayType';
  elementType: TypeExpression;
  size: number | null; // null for dynamic arrays
}

export interface TupleType extends ASTNode {
  kind: 'TupleType';
  elements: TypeExpression[];
}

export interface FunctionType extends ASTNode {
  kind: 'FunctionType';
  parameters: TypeExpression[];
  returnType: TypeExpression;
  effects: TypeExpression[];
}

export interface ReferenceType extends ASTNode {
  kind: 'ReferenceType';
  inner: TypeExpression;
  isMutable: boolean;
}

export interface OptionalType extends ASTNode {
  kind: 'OptionalType';
  inner: TypeExpression;
}

export interface ResultType extends ASTNode {
  kind: 'ResultType';
  okType: TypeExpression;
  errType: TypeExpression;
}

export interface NeverType extends ASTNode {
  kind: 'NeverType';
}

// ============================================================================
// Expressions
// ============================================================================

export type Expression =
  | Identifier
  | Literal
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | IndexExpression
  | IfExpression
  | MatchExpression
  | BlockExpression
  | LambdaExpression
  | ArrayExpression
  | TupleExpression
  | StructExpression
  | RangeExpression
  | CastExpression
  | OldExpression
  | ForallExpression
  | ExistsExpression
  | TryExpression
  | AssignmentExpression;

export interface Identifier extends ASTNode {
  kind: 'Identifier';
  name: string;
}

export interface Literal extends ASTNode {
  kind: 'Literal';
  value: number | string | boolean | null;
  literalKind: 'integer' | 'float' | 'string' | 'char' | 'boolean' | 'nil';
}

export interface BinaryExpression extends ASTNode {
  kind: 'BinaryExpression';
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%' | '**'
  | '==' | '!=' | '<' | '>' | '<=' | '>='
  | '&&' | '||'
  | '&' | '|' | '^' | '<<' | '>>';

export interface UnaryExpression extends ASTNode {
  kind: 'UnaryExpression';
  operator: UnaryOperator;
  operand: Expression;
  isPrefix: boolean;
}

export type UnaryOperator = '-' | '!' | '~' | '&' | '*';

export interface CallExpression extends ASTNode {
  kind: 'CallExpression';
  callee: Expression;
  arguments: Expression[];
  genericArgs: TypeExpression[];
}

export interface MemberExpression extends ASTNode {
  kind: 'MemberExpression';
  object: Expression;
  property: Identifier;
  isOptional: boolean; // for ?.
}

export interface IndexExpression extends ASTNode {
  kind: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export interface IfExpression extends ASTNode {
  kind: 'IfExpression';
  condition: Expression;
  thenBranch: BlockExpression;
  elseBranch: BlockExpression | IfExpression | null;
}

export interface MatchExpression extends ASTNode {
  kind: 'MatchExpression';
  subject: Expression;
  arms: MatchArm[];
}

export interface MatchArm extends ASTNode {
  kind: 'MatchArm';
  pattern: Pattern;
  guard: Expression | null;
  body: Expression;
}

export type Pattern =
  | WildcardPattern
  | LiteralPattern
  | IdentifierPattern
  | TuplePattern
  | StructPattern
  | EnumPattern
  | RangePattern;

export interface WildcardPattern extends ASTNode {
  kind: 'WildcardPattern';
}

export interface LiteralPattern extends ASTNode {
  kind: 'LiteralPattern';
  value: Literal;
}

export interface IdentifierPattern extends ASTNode {
  kind: 'IdentifierPattern';
  name: Identifier;
  isMutable: boolean;
}

export interface TuplePattern extends ASTNode {
  kind: 'TuplePattern';
  elements: Pattern[];
}

export interface StructPattern extends ASTNode {
  kind: 'StructPattern';
  type: Identifier;
  fields: StructPatternField[];
  hasRest: boolean;
}

export interface StructPatternField extends ASTNode {
  kind: 'StructPatternField';
  name: Identifier;
  pattern: Pattern;
}

export interface EnumPattern extends ASTNode {
  kind: 'EnumPattern';
  type: Identifier;
  variant: Identifier;
  fields: Pattern[] | null;
}

export interface RangePattern extends ASTNode {
  kind: 'RangePattern';
  start: Literal | null;
  end: Literal | null;
  isInclusive: boolean;
}

export interface BlockExpression extends ASTNode {
  kind: 'BlockExpression';
  statements: Statement[];
  expression: Expression | null; // trailing expression (implicit return)
}

export interface LambdaExpression extends ASTNode {
  kind: 'LambdaExpression';
  parameters: Parameter[];
  returnType: TypeExpression | null;
  body: Expression;
}

export interface ArrayExpression extends ASTNode {
  kind: 'ArrayExpression';
  elements: Expression[];
}

export interface TupleExpression extends ASTNode {
  kind: 'TupleExpression';
  elements: Expression[];
}

export interface StructExpression extends ASTNode {
  kind: 'StructExpression';
  type: Identifier;
  fields: StructExpressionField[];
  spread: Expression | null;
}

export interface StructExpressionField extends ASTNode {
  kind: 'StructExpressionField';
  name: Identifier;
  value: Expression;
}

export interface RangeExpression extends ASTNode {
  kind: 'RangeExpression';
  start: Expression | null;
  end: Expression | null;
  isInclusive: boolean;
}

export interface CastExpression extends ASTNode {
  kind: 'CastExpression';
  expression: Expression;
  targetType: TypeExpression;
}

export interface OldExpression extends ASTNode {
  kind: 'OldExpression';
  expression: Expression;
}

export interface ForallExpression extends ASTNode {
  kind: 'ForallExpression';
  bindings: ForallBinding[];
  condition: Expression;
}

export interface ForallBinding extends ASTNode {
  kind: 'ForallBinding';
  name: Identifier;
  range: Expression | null;
}

export interface ExistsExpression extends ASTNode {
  kind: 'ExistsExpression';
  bindings: ForallBinding[];
  condition: Expression;
}

export interface TryExpression extends ASTNode {
  kind: 'TryExpression';
  expression: Expression;
}

export interface AssignmentExpression extends ASTNode {
  kind: 'AssignmentExpression';
  operator: '=' | '+=' | '-=' | '*=' | '/=';
  left: Expression;
  right: Expression;
}

// ============================================================================
// Control Flow Statements
// ============================================================================

export interface IfStatement extends ASTNode {
  kind: 'IfStatement';
  condition: Expression;
  thenBranch: BlockStatement;
  elseBranch: BlockStatement | IfStatement | null;
}

export interface WhileStatement extends ASTNode {
  kind: 'WhileStatement';
  condition: Expression;
  body: BlockStatement;
  invariants: Annotation[];
}

export interface ForStatement extends ASTNode {
  kind: 'ForStatement';
  variable: Identifier;
  iterable: Expression;
  body: BlockStatement;
  invariants: Annotation[];
}

export interface MatchStatement extends ASTNode {
  kind: 'MatchStatement';
  subject: Expression;
  arms: MatchArm[];
}

// ============================================================================
// Utility Types
// ============================================================================

export type AnyNode =
  | Program
  | Statement
  | Declaration
  | Expression
  | TypeExpression
  | Annotation
  | Pattern
  | Parameter
  | GenericParameter
  | MatchArm
  | StructField
  | EnumVariant
  | ImportSpecifier;

export interface VisitorContext<T = void> {
  visit(node: AnyNode): T;
}

export interface Visitor<T = void> {
  visitProgram?(node: Program, ctx: VisitorContext<T>): T;
  visitFunctionDeclaration?(node: FunctionDeclaration, ctx: VisitorContext<T>): T;
  visitVariableDeclaration?(node: VariableDeclaration, ctx: VisitorContext<T>): T;
  visitIdentifier?(node: Identifier, ctx: VisitorContext<T>): T;
  visitLiteral?(node: Literal, ctx: VisitorContext<T>): T;
  visitBinaryExpression?(node: BinaryExpression, ctx: VisitorContext<T>): T;
  visitCallExpression?(node: CallExpression, ctx: VisitorContext<T>): T;
  // ... more visitor methods
}
