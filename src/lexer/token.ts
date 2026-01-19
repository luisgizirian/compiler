/**
 * Intent Language - Token Definitions
 * 
 * Tokens are the fundamental units produced by the lexer.
 * Each token has a type, value, and source location.
 */

export enum TokenType {
  // Literals
  INTEGER = 'INTEGER',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  CHAR = 'CHAR',
  BOOLEAN = 'BOOLEAN',

  // Identifiers
  IDENTIFIER = 'IDENTIFIER',

  // Keywords
  FN = 'FN',
  LET = 'LET',
  MUT = 'MUT',
  TYPE = 'TYPE',
  STRUCT = 'STRUCT',
  ENUM = 'ENUM',
  TRAIT = 'TRAIT',
  IMPL = 'IMPL',
  CONTRACT = 'CONTRACT',
  INTENT = 'INTENT',
  EFFECT = 'EFFECT',
  CAPABILITY = 'CAPABILITY',
  REQUIRES = 'REQUIRES',
  ENSURES = 'ENSURES',
  INVARIANT = 'INVARIANT',
  IF = 'IF',
  ELSE = 'ELSE',
  MATCH = 'MATCH',
  FOR = 'FOR',
  WHILE = 'WHILE',
  RETURN = 'RETURN',
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT',
  WHERE = 'WHERE',
  PURE = 'PURE',
  EXTERN = 'EXTERN',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NIL = 'NIL',
  SELF = 'SELF',
  OLD = 'OLD',
  FORALL = 'FORALL',
  EXISTS = 'EXISTS',
  IN = 'IN',
  AS = 'AS',

  // Type keywords
  INT = 'INT',
  INT8 = 'INT8',
  INT16 = 'INT16',
  INT32 = 'INT32',
  INT64 = 'INT64',
  UINT = 'UINT',
  FLOAT32 = 'FLOAT32',
  FLOAT64 = 'FLOAT64',
  BOOL = 'BOOL',
  CHAR_TYPE = 'CHAR_TYPE',
  STRING_TYPE = 'STRING_TYPE',
  VOID = 'VOID',
  NEVER = 'NEVER',
  RESULT = 'RESULT',
  OPTION = 'OPTION',

  // Arithmetic operators
  PLUS = 'PLUS',           // +
  MINUS = 'MINUS',         // -
  STAR = 'STAR',           // *
  SLASH = 'SLASH',         // /
  PERCENT = 'PERCENT',     // %
  POWER = 'POWER',         // **

  // Comparison operators
  EQ = 'EQ',               // ==
  NEQ = 'NEQ',             // !=
  LT = 'LT',               // <
  GT = 'GT',               // >
  LTE = 'LTE',             // <=
  GTE = 'GTE',             // >=

  // Logical operators
  AND = 'AND',             // &&
  OR = 'OR',               // ||
  NOT = 'NOT',             // !

  // Bitwise operators
  BIT_AND = 'BIT_AND',     // &
  BIT_OR = 'BIT_OR',       // |
  BIT_XOR = 'BIT_XOR',     // ^
  BIT_NOT = 'BIT_NOT',     // ~
  SHL = 'SHL',             // <<
  SHR = 'SHR',             // >>

  // Assignment operators
  ASSIGN = 'ASSIGN',       // =
  PLUS_ASSIGN = 'PLUS_ASSIGN',   // +=
  MINUS_ASSIGN = 'MINUS_ASSIGN', // -=
  STAR_ASSIGN = 'STAR_ASSIGN',   // *=
  SLASH_ASSIGN = 'SLASH_ASSIGN', // /=

  // Arrow operators
  ARROW = 'ARROW',         // ->
  FAT_ARROW = 'FAT_ARROW', // =>

  // Range operators
  RANGE = 'RANGE',         // ..
  RANGE_INCL = 'RANGE_INCL', // ..=

  // Delimiters
  LPAREN = 'LPAREN',       // (
  RPAREN = 'RPAREN',       // )
  LBRACE = 'LBRACE',       // {
  RBRACE = 'RBRACE',       // }
  LBRACKET = 'LBRACKET',   // [
  RBRACKET = 'RBRACKET',   // ]

  // Punctuation
  COMMA = 'COMMA',         // ,
  DOT = 'DOT',             // .
  COLON = 'COLON',         // :
  SEMICOLON = 'SEMICOLON', // ;
  QUESTION = 'QUESTION',   // ?
  AT = 'AT',               // @
  HASH = 'HASH',           // #
  UNDERSCORE = 'UNDERSCORE', // _

  // Special
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
  INVALID = 'INVALID',
}

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
  length: number;
  file?: string;
}

export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
  literal?: number | string | boolean | null;
}

export const KEYWORDS: Record<string, TokenType> = {
  // Control flow
  'fn': TokenType.FN,
  'let': TokenType.LET,
  'mut': TokenType.MUT,
  'type': TokenType.TYPE,
  'struct': TokenType.STRUCT,
  'enum': TokenType.ENUM,
  'trait': TokenType.TRAIT,
  'impl': TokenType.IMPL,
  'contract': TokenType.CONTRACT,
  'intent': TokenType.INTENT,
  'effect': TokenType.EFFECT,
  'capability': TokenType.CAPABILITY,
  'requires': TokenType.REQUIRES,
  'ensures': TokenType.ENSURES,
  'invariant': TokenType.INVARIANT,
  'if': TokenType.IF,
  'else': TokenType.ELSE,
  'match': TokenType.MATCH,
  'for': TokenType.FOR,
  'while': TokenType.WHILE,
  'return': TokenType.RETURN,
  'import': TokenType.IMPORT,
  'export': TokenType.EXPORT,
  'where': TokenType.WHERE,
  'pure': TokenType.PURE,
  'extern': TokenType.EXTERN,
  'true': TokenType.TRUE,
  'false': TokenType.FALSE,
  'nil': TokenType.NIL,
  'self': TokenType.SELF,
  'Self': TokenType.SELF,
  'old': TokenType.OLD,
  'forall': TokenType.FORALL,
  'exists': TokenType.EXISTS,
  'in': TokenType.IN,
  'as': TokenType.AS,

  // Types
  'Int': TokenType.INT,
  'Int8': TokenType.INT8,
  'Int16': TokenType.INT16,
  'Int32': TokenType.INT32,
  'Int64': TokenType.INT64,
  'UInt': TokenType.UINT,
  'Float32': TokenType.FLOAT32,
  'Float64': TokenType.FLOAT64,
  'Bool': TokenType.BOOL,
  'Char': TokenType.CHAR_TYPE,
  'String': TokenType.STRING_TYPE,
  'Void': TokenType.VOID,
  'Never': TokenType.NEVER,
  'Result': TokenType.RESULT,
  'Option': TokenType.OPTION,
};

export function createToken(
  type: TokenType,
  value: string,
  line: number,
  column: number,
  offset: number,
  literal?: number | string | boolean | null
): Token {
  return {
    type,
    value,
    location: {
      line,
      column,
      offset,
      length: value.length,
    },
    literal,
  };
}
