/**
 * Intent Language - Parser
 * 
 * Recursive descent parser that transforms tokens into an AST.
 * Supports all Intent language features including:
 * - Functions with contracts and effects
 * - Structs, enums, traits, and impls
 * - Intent and contract declarations
 * - Effect and capability systems
 * - Pattern matching
 * - Generic types
 */

import {
  Token,
  TokenType,
  SourceLocation,
} from '../lexer/token';

import * as AST from './ast';

export interface ParseError {
  message: string;
  location: SourceLocation;
  token: Token;
}

export class Parser {
  private tokens: Token[];
  private current = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    // Filter out invalid tokens
    this.tokens = tokens.filter(t => t.type !== TokenType.INVALID);
  }

  parse(): { program: AST.Program; errors: ParseError[] } {
    const statements: AST.Statement[] = [];

    while (!this.isAtEnd()) {
      try {
        const stmt = this.declaration();
        if (stmt) {
          statements.push(stmt);
        }
      } catch (e) {
        this.synchronize();
      }
    }

    const program: AST.Program = {
      kind: 'Program',
      statements,
      location: statements.length > 0
        ? statements[0].location
        : { line: 1, column: 1, offset: 0, length: 0 },
    };

    return { program, errors: this.errors };
  }

  // ============================================================================
  // Declarations
  // ============================================================================

  private declaration(): AST.Statement | null {
    if (this.match(TokenType.EXPORT)) {
      return this.exportDeclaration();
    }
    if (this.match(TokenType.IMPORT)) {
      return this.importDeclaration();
    }
    if (this.match(TokenType.FN) || this.check(TokenType.PURE)) {
      return this.functionDeclaration(false);
    }
    if (this.match(TokenType.LET)) {
      return this.variableDeclaration(false);
    }
    if (this.match(TokenType.TYPE)) {
      return this.typeAliasDeclaration(false);
    }
    if (this.match(TokenType.STRUCT)) {
      return this.structDeclaration(false);
    }
    if (this.match(TokenType.ENUM)) {
      return this.enumDeclaration(false);
    }
    if (this.match(TokenType.TRAIT)) {
      return this.traitDeclaration(false);
    }
    if (this.match(TokenType.IMPL)) {
      return this.implDeclaration();
    }
    if (this.match(TokenType.CONTRACT)) {
      return this.contractDeclaration(false);
    }
    if (this.match(TokenType.INTENT)) {
      return this.intentDeclaration(false);
    }
    if (this.match(TokenType.EFFECT)) {
      return this.effectDeclaration(false);
    }
    if (this.match(TokenType.CAPABILITY)) {
      return this.capabilityDeclaration(false);
    }

    return this.statement();
  }

  private exportDeclaration(): AST.ExportDeclaration {
    const start = this.previous();
    
    let declaration: AST.Declaration;
    
    if (this.match(TokenType.FN) || this.check(TokenType.PURE)) {
      declaration = this.functionDeclaration(true);
    } else if (this.match(TokenType.LET)) {
      declaration = this.variableDeclaration(true);
    } else if (this.match(TokenType.TYPE)) {
      declaration = this.typeAliasDeclaration(true);
    } else if (this.match(TokenType.STRUCT)) {
      declaration = this.structDeclaration(true);
    } else if (this.match(TokenType.ENUM)) {
      declaration = this.enumDeclaration(true);
    } else if (this.match(TokenType.TRAIT)) {
      declaration = this.traitDeclaration(true);
    } else if (this.match(TokenType.CONTRACT)) {
      declaration = this.contractDeclaration(true);
    } else if (this.match(TokenType.INTENT)) {
      declaration = this.intentDeclaration(true);
    } else if (this.match(TokenType.EFFECT)) {
      declaration = this.effectDeclaration(true);
    } else if (this.match(TokenType.CAPABILITY)) {
      declaration = this.capabilityDeclaration(true);
    } else {
      throw this.error(this.peek(), 'Expected declaration after export');
    }

    return {
      kind: 'ExportDeclaration',
      declaration,
      location: start.location,
    };
  }

  private importDeclaration(): AST.ImportDeclaration {
    const start = this.previous();
    const path: string[] = [];
    const imports: AST.ImportSpecifier[] = [];
    let isWildcard = false;

    // Parse module path: import module.submodule.{item1, item2}
    path.push(this.consume(TokenType.IDENTIFIER, 'Expected module name').value);
    
    while (this.match(TokenType.DOT)) {
      if (this.match(TokenType.LBRACE)) {
        // Import list
        do {
          const name = this.identifier();
          let alias: AST.Identifier | null = null;
          
          if (this.match(TokenType.AS)) {
            alias = this.identifier();
          }
          
          imports.push({
            kind: 'ImportSpecifier',
            name,
            alias,
            location: name.location,
          });
        } while (this.match(TokenType.COMMA));
        
        this.consume(TokenType.RBRACE, "Expected '}' after import list");
        break;
      } else if (this.match(TokenType.STAR)) {
        isWildcard = true;
        break;
      } else {
        path.push(this.consume(TokenType.IDENTIFIER, 'Expected module name').value);
      }
    }

    // If no explicit imports, import the whole module
    if (imports.length === 0 && !isWildcard) {
      const lastPart = path[path.length - 1];
      imports.push({
        kind: 'ImportSpecifier',
        name: { kind: 'Identifier', name: lastPart, location: start.location },
        alias: null,
        location: start.location,
      });
    }

    return {
      kind: 'ImportDeclaration',
      path,
      imports,
      isWildcard,
      location: start.location,
    };
  }

  private functionDeclaration(isExported: boolean): AST.FunctionDeclaration {
    let isPure = false;
    
    if (this.check(TokenType.PURE) || this.previous().type === TokenType.PURE) {
      if (this.check(TokenType.PURE)) this.advance();
      isPure = true;
      this.consume(TokenType.FN, "Expected 'fn' after 'pure'");
    }

    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LPAREN, "Expected '(' after function name");
    const parameters = this.parameterList();
    this.consume(TokenType.RPAREN, "Expected ')' after parameters");

    let returnType: AST.TypeExpression = this.voidType(start.location);
    if (this.match(TokenType.ARROW)) {
      returnType = this.typeExpression();
    }

    const annotations = this.annotations();

    let body: AST.BlockStatement | null = null;
    if (this.check(TokenType.LBRACE)) {
      body = this.blockStatement();
    }

    return {
      kind: 'FunctionDeclaration',
      name,
      genericParams,
      parameters,
      returnType,
      annotations,
      body,
      isPure,
      isExported,
      location: start.location,
    };
  }

  private parameterList(): AST.Parameter[] {
    const params: AST.Parameter[] = [];

    if (!this.check(TokenType.RPAREN)) {
      do {
        const isMutable = this.match(TokenType.MUT);
        const name = this.identifier();
        this.consume(TokenType.COLON, "Expected ':' after parameter name");
        const type = this.typeExpression();
        
        let defaultValue: AST.Expression | null = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.expression();
        }

        params.push({
          kind: 'Parameter',
          name,
          type,
          isMutable,
          defaultValue,
          location: name.location,
        });
      } while (this.match(TokenType.COMMA));
    }

    return params;
  }

  private variableDeclaration(isExported: boolean): AST.VariableDeclaration {
    const start = this.previous();
    const isMutable = this.match(TokenType.MUT);
    const name = this.identifier();
    
    let type: AST.TypeExpression | null = null;
    if (this.match(TokenType.COLON)) {
      type = this.typeExpression();
    }

    let initializer: AST.Expression | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.expression();
    }

    return {
      kind: 'VariableDeclaration',
      name,
      type,
      initializer,
      isMutable,
      isExported,
      location: start.location,
    };
  }

  private typeAliasDeclaration(isExported: boolean): AST.TypeAliasDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.ASSIGN, "Expected '=' after type name");
    const type = this.typeExpression();

    return {
      kind: 'TypeAliasDeclaration',
      name,
      genericParams,
      type,
      isExported,
      location: start.location,
    };
  }

  private structDeclaration(isExported: boolean): AST.StructDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LBRACE, "Expected '{' after struct name");
    
    const fields: AST.StructField[] = [];
    const invariants: AST.Annotation[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.check(TokenType.AT)) {
        invariants.push(...this.annotations());
      } else {
        const fieldName = this.identifier();
        this.consume(TokenType.COLON, "Expected ':' after field name");
        const fieldType = this.typeExpression();
        
        let defaultValue: AST.Expression | null = null;
        if (this.match(TokenType.ASSIGN)) {
          defaultValue = this.expression();
        }
        
        const fieldAnnotations = this.annotations();
        
        fields.push({
          kind: 'StructField',
          name: fieldName,
          type: fieldType,
          defaultValue,
          annotations: fieldAnnotations,
          location: fieldName.location,
        });
        
        this.match(TokenType.COMMA);
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after struct body");

    return {
      kind: 'StructDeclaration',
      name,
      genericParams,
      fields,
      invariants,
      isExported,
      location: start.location,
    };
  }

  private enumDeclaration(isExported: boolean): AST.EnumDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LBRACE, "Expected '{' after enum name");
    
    const variants: AST.EnumVariant[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const variantName = this.identifier();
      let fields: AST.TypeExpression[] | null = null;
      
      if (this.match(TokenType.LPAREN)) {
        fields = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            fields.push(this.typeExpression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')' after variant fields");
      }
      
      variants.push({
        kind: 'EnumVariant',
        name: variantName,
        fields,
        location: variantName.location,
      });
      
      this.match(TokenType.COMMA);
    }

    this.consume(TokenType.RBRACE, "Expected '}' after enum body");

    return {
      kind: 'EnumDeclaration',
      name,
      genericParams,
      variants,
      isExported,
      location: start.location,
    };
  }

  private traitDeclaration(isExported: boolean): AST.TraitDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    const supertraits: AST.TypeExpression[] = [];
    if (this.match(TokenType.COLON)) {
      do {
        supertraits.push(this.typeExpression());
      } while (this.match(TokenType.PLUS));
    }

    this.consume(TokenType.LBRACE, "Expected '{' after trait name");
    
    const methods: AST.FunctionDeclaration[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.FN) || this.check(TokenType.PURE)) {
        methods.push(this.functionDeclaration(false));
      } else {
        throw this.error(this.peek(), 'Expected method declaration in trait');
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after trait body");

    return {
      kind: 'TraitDeclaration',
      name,
      genericParams,
      supertraits,
      methods,
      isExported,
      location: start.location,
    };
  }

  private implDeclaration(): AST.ImplDeclaration {
    const start = this.previous();
    const genericParams = this.genericParameters();
    
    const firstType = this.typeExpression();
    
    let trait: AST.TypeExpression | null = null;
    let forType: AST.TypeExpression;
    
    if (this.match(TokenType.FOR)) {
      trait = firstType;
      forType = this.typeExpression();
    } else {
      forType = firstType;
    }

    let whereClause: AST.WhereClause | null = null;
    if (this.match(TokenType.WHERE)) {
      whereClause = this.whereClause();
    }

    this.consume(TokenType.LBRACE, "Expected '{' after impl");
    
    const methods: AST.FunctionDeclaration[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.FN) || this.check(TokenType.PURE)) {
        methods.push(this.functionDeclaration(false));
      } else {
        throw this.error(this.peek(), 'Expected method declaration in impl');
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after impl body");

    return {
      kind: 'ImplDeclaration',
      genericParams,
      trait,
      forType,
      methods,
      whereClause,
      location: start.location,
    };
  }

  private contractDeclaration(isExported: boolean): AST.ContractDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LBRACE, "Expected '{' after contract name");
    const annotations = this.contractBody();
    this.consume(TokenType.RBRACE, "Expected '}' after contract body");

    return {
      kind: 'ContractDeclaration',
      name,
      genericParams,
      annotations,
      isExported,
      location: start.location,
    };
  }

  private intentDeclaration(isExported: boolean): AST.IntentDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LBRACE, "Expected '{' after intent name");
    const annotations = this.contractBody();
    this.consume(TokenType.RBRACE, "Expected '}' after intent body");

    return {
      kind: 'IntentDeclaration',
      name,
      genericParams,
      annotations,
      isExported,
      location: start.location,
    };
  }

  private contractBody(): AST.Annotation[] {
    const annotations: AST.Annotation[] = [];
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      annotations.push(...this.annotations());
    }
    
    return annotations;
  }

  private effectDeclaration(isExported: boolean): AST.EffectDeclaration {
    const start = this.previous();
    const name = this.identifier();
    const genericParams = this.genericParameters();
    
    this.consume(TokenType.LBRACE, "Expected '{' after effect name");
    
    const methods: AST.FunctionDeclaration[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.FN)) {
        methods.push(this.functionDeclaration(false));
      } else {
        throw this.error(this.peek(), 'Expected method declaration in effect');
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after effect body");

    return {
      kind: 'EffectDeclaration',
      name,
      genericParams,
      methods,
      isExported,
      location: start.location,
    };
  }

  private capabilityDeclaration(isExported: boolean): AST.CapabilityDeclaration {
    const start = this.previous();
    const name = this.identifier();
    
    this.consume(TokenType.LBRACE, "Expected '{' after capability name");
    
    const fields: AST.CapabilityField[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const fieldName = this.identifier();
      this.consume(TokenType.COLON, "Expected ':' after capability field name");
      const fieldType = this.typeExpression();
      
      fields.push({
        kind: 'CapabilityField',
        name: fieldName,
        type: fieldType,
        location: fieldName.location,
      });
      
      this.match(TokenType.COMMA);
    }

    this.consume(TokenType.RBRACE, "Expected '}' after capability body");

    return {
      kind: 'CapabilityDeclaration',
      name,
      fields,
      isExported,
      location: start.location,
    };
  }

  // ============================================================================
  // Annotations
  // ============================================================================

  private annotations(): AST.Annotation[] {
    const annotations: AST.Annotation[] = [];
    
    while (this.check(TokenType.AT)) {
      this.advance();
      const annotation = this.annotation();
      if (annotation) {
        annotations.push(annotation);
      }
    }
    
    return annotations;
  }

  private annotation(): AST.Annotation | null {
    const token = this.peek();
    
    if (this.match(TokenType.REQUIRES)) {
      const condition = this.expression();
      return {
        kind: 'RequiresAnnotation',
        condition,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.ENSURES)) {
      const condition = this.expression();
      return {
        kind: 'EnsuresAnnotation',
        condition,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.INVARIANT)) {
      const condition = this.expression();
      return {
        kind: 'InvariantAnnotation',
        condition,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.EFFECT)) {
      this.consume(TokenType.LBRACKET, "Expected '[' after @effect");
      const effects: AST.TypeExpression[] = [];
      if (!this.check(TokenType.RBRACKET)) {
        do {
          effects.push(this.typeExpression());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RBRACKET, "Expected ']' after effect list");
      return {
        kind: 'EffectAnnotation',
        effects,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.CAPABILITY)) {
      const capability = this.identifier();
      this.consume(TokenType.LBRACE, "Expected '{' after capability name");
      const fields: Record<string, AST.Expression> = {};
      
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        const fieldName = this.identifier();
        this.consume(TokenType.COLON, "Expected ':' after capability field");
        const fieldValue = this.expression();
        fields[fieldName.name] = fieldValue;
        this.match(TokenType.COMMA);
      }
      
      this.consume(TokenType.RBRACE, "Expected '}' after capability spec");
      return {
        kind: 'CapabilityAnnotation',
        capability,
        fields,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.CONTRACT)) {
      const contract = this.identifier();
      const genericArgs = this.genericArguments();
      return {
        kind: 'ContractAnnotation',
        contract,
        genericArgs,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.INTENT)) {
      const intent = this.identifier();
      const genericArgs = this.genericArguments();
      return {
        kind: 'IntentAnnotation',
        intent,
        genericArgs,
        location: token.location,
      };
    }
    
    if (this.match(TokenType.IDENTIFIER)) {
      const name = this.previous().value;
      if (name === 'verify') {
        this.consume(TokenType.LPAREN, "Expected '(' after @verify");
        // Parse level: "full" | "runtime" | "trusted"
        this.consume(TokenType.IDENTIFIER, "Expected 'level'");
        this.consume(TokenType.COLON, "Expected ':'");
        const levelToken = this.consume(TokenType.STRING, "Expected level value");
        const level = levelToken.literal as 'full' | 'runtime' | 'trusted';
        this.consume(TokenType.RPAREN, "Expected ')' after @verify");
        return {
          kind: 'VerifyAnnotation',
          level,
          location: token.location,
        };
      }
    }
    
    return null;
  }

  // ============================================================================
  // Types
  // ============================================================================

  private genericParameters(): AST.GenericParameter[] {
    const params: AST.GenericParameter[] = [];
    
    if (this.match(TokenType.LT)) {
      do {
        const name = this.identifier();
        const bounds: AST.TypeExpression[] = [];
        let defaultType: AST.TypeExpression | null = null;
        
        if (this.match(TokenType.COLON)) {
          do {
            bounds.push(this.typeExpression());
          } while (this.match(TokenType.PLUS));
        }
        
        if (this.match(TokenType.ASSIGN)) {
          defaultType = this.typeExpression();
        }
        
        params.push({
          kind: 'GenericParameter',
          name,
          bounds,
          defaultType,
          location: name.location,
        });
      } while (this.match(TokenType.COMMA));
      
      this.consume(TokenType.GT, "Expected '>' after generic parameters");
    }
    
    return params;
  }

  private genericArguments(): AST.TypeExpression[] {
    const args: AST.TypeExpression[] = [];
    
    if (this.match(TokenType.LT)) {
      do {
        args.push(this.typeExpression());
      } while (this.match(TokenType.COMMA));
      
      this.consume(TokenType.GT, "Expected '>' after generic arguments");
    }
    
    return args;
  }

  private whereClause(): AST.WhereClause {
    const constraints: AST.TypeConstraint[] = [];
    
    do {
      const type = this.typeExpression();
      this.consume(TokenType.COLON, "Expected ':' in where clause");
      
      const bounds: AST.TypeExpression[] = [];
      do {
        bounds.push(this.typeExpression());
      } while (this.match(TokenType.PLUS));
      
      constraints.push({
        kind: 'TypeConstraint',
        type,
        bounds,
        location: type.location,
      });
    } while (this.match(TokenType.COMMA));
    
    return {
      kind: 'WhereClause',
      constraints,
      location: constraints[0].location,
    };
  }

  private typeExpression(): AST.TypeExpression {
    return this.optionalType();
  }

  private optionalType(): AST.TypeExpression {
    let type = this.referenceType();
    
    if (this.match(TokenType.QUESTION)) {
      type = {
        kind: 'OptionalType',
        inner: type,
        location: type.location,
      };
    }
    
    return type;
  }

  private referenceType(): AST.TypeExpression {
    if (this.match(TokenType.BIT_AND)) {
      const isMutable = this.match(TokenType.MUT);
      const inner = this.primaryType();
      return {
        kind: 'ReferenceType',
        inner,
        isMutable,
        location: inner.location,
      };
    }
    
    return this.primaryType();
  }

  private primaryType(): AST.TypeExpression {
    const token = this.peek();
    
    // Primitive types
    if (this.matchAny([
      TokenType.INT, TokenType.INT8, TokenType.INT16, TokenType.INT32, TokenType.INT64,
      TokenType.UINT, TokenType.FLOAT32, TokenType.FLOAT64,
      TokenType.BOOL, TokenType.CHAR_TYPE, TokenType.STRING_TYPE, TokenType.VOID,
    ])) {
      const name = this.previous().value as AST.PrimitiveType['name'];
      return {
        kind: 'PrimitiveType',
        name,
        location: token.location,
      };
    }
    
    // Never type
    if (this.match(TokenType.NEVER)) {
      return { kind: 'NeverType', location: token.location };
    }
    
    // Result type
    if (this.match(TokenType.RESULT)) {
      const args = this.genericArguments();
      if (args.length !== 2) {
        throw this.error(token, 'Result type requires exactly two type arguments');
      }
      return {
        kind: 'ResultType',
        okType: args[0],
        errType: args[1],
        location: token.location,
      };
    }
    
    // Array type
    if (this.match(TokenType.LBRACKET)) {
      const elementType = this.typeExpression();
      let size: number | null = null;
      
      if (this.match(TokenType.SEMICOLON)) {
        const sizeToken = this.consume(TokenType.INTEGER, 'Expected array size');
        size = sizeToken.literal as number;
      }
      
      this.consume(TokenType.RBRACKET, "Expected ']' after array type");
      
      return {
        kind: 'ArrayType',
        elementType,
        size,
        location: token.location,
      };
    }
    
    // Tuple type
    if (this.match(TokenType.LPAREN)) {
      const elements: AST.TypeExpression[] = [];
      
      if (!this.check(TokenType.RPAREN)) {
        do {
          elements.push(this.typeExpression());
        } while (this.match(TokenType.COMMA));
      }
      
      this.consume(TokenType.RPAREN, "Expected ')' after tuple type");
      
      return {
        kind: 'TupleType',
        elements,
        location: token.location,
      };
    }
    
    // Function type
    if (this.match(TokenType.FN)) {
      this.consume(TokenType.LPAREN, "Expected '(' after fn");
      
      const parameters: AST.TypeExpression[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          parameters.push(this.typeExpression());
        } while (this.match(TokenType.COMMA));
      }
      
      this.consume(TokenType.RPAREN, "Expected ')' after function parameters");
      this.consume(TokenType.ARROW, "Expected '->' after function parameters");
      
      const returnType = this.typeExpression();
      
      const effects: AST.TypeExpression[] = [];
      if (this.check(TokenType.AT) && this.peekNext()?.type === TokenType.EFFECT) {
        this.advance(); // @
        this.advance(); // effect
        this.consume(TokenType.LBRACKET, "Expected '[' after @effect");
        do {
          effects.push(this.typeExpression());
        } while (this.match(TokenType.COMMA));
        this.consume(TokenType.RBRACKET, "Expected ']' after effect list");
      }
      
      return {
        kind: 'FunctionType',
        parameters,
        returnType,
        effects,
        location: token.location,
      };
    }
    
    // Named/Generic type
    if (this.match(TokenType.IDENTIFIER)) {
      const name: AST.Identifier = {
        kind: 'Identifier',
        name: this.previous().value,
        location: token.location,
      };
      
      const path: AST.Identifier[] = [];
      while (this.match(TokenType.DOT)) {
        path.push(name);
        const nextName = this.identifier();
        Object.assign(name, nextName);
      }
      
      const genericArgs = this.genericArguments();
      
      if (genericArgs.length > 0) {
        return {
          kind: 'GenericType',
          base: { kind: 'NamedType', name, path, location: token.location },
          arguments: genericArgs,
          location: token.location,
        };
      }
      
      return {
        kind: 'NamedType',
        name,
        path,
        location: token.location,
      };
    }
    
    throw this.error(this.peek(), 'Expected type expression');
  }

  private voidType(location: SourceLocation): AST.PrimitiveType {
    return { kind: 'PrimitiveType', name: 'Void', location };
  }

  // ============================================================================
  // Statements
  // ============================================================================

  private statement(): AST.Statement {
    if (this.match(TokenType.RETURN)) {
      return this.returnStatement();
    }
    if (this.match(TokenType.IF)) {
      return this.ifStatement();
    }
    if (this.match(TokenType.WHILE)) {
      return this.whileStatement();
    }
    if (this.match(TokenType.FOR)) {
      return this.forStatement();
    }
    if (this.match(TokenType.MATCH)) {
      return this.matchStatement();
    }
    if (this.check(TokenType.LBRACE)) {
      return this.blockStatement();
    }

    return this.expressionStatement();
  }

  private returnStatement(): AST.ReturnStatement {
    const start = this.previous();
    let value: AST.Expression | null = null;
    
    if (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      value = this.expression();
    }

    return {
      kind: 'ReturnStatement',
      value,
      location: start.location,
    };
  }

  private ifStatement(): AST.IfStatement {
    const start = this.previous();
    const condition = this.expression();
    const thenBranch = this.blockStatement();
    
    let elseBranch: AST.BlockStatement | AST.IfStatement | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.match(TokenType.IF)) {
        elseBranch = this.ifStatement();
      } else {
        elseBranch = this.blockStatement();
      }
    }

    return {
      kind: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      location: start.location,
    };
  }

  private whileStatement(): AST.WhileStatement {
    const start = this.previous();
    const condition = this.expression();
    const invariants = this.annotations();
    const body = this.blockStatement();

    return {
      kind: 'WhileStatement',
      condition,
      body,
      invariants,
      location: start.location,
    };
  }

  private forStatement(): AST.ForStatement {
    const start = this.previous();
    const variable = this.identifier();
    this.consume(TokenType.IN, "Expected 'in' after for variable");
    const iterable = this.expression();
    const invariants = this.annotations();
    const body = this.blockStatement();

    return {
      kind: 'ForStatement',
      variable,
      iterable,
      body,
      invariants,
      location: start.location,
    };
  }

  private matchStatement(): AST.MatchStatement {
    const start = this.previous();
    const subject = this.expression();
    
    this.consume(TokenType.LBRACE, "Expected '{' after match expression");
    
    const arms: AST.MatchArm[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      arms.push(this.matchArm());
      this.match(TokenType.COMMA);
    }
    
    this.consume(TokenType.RBRACE, "Expected '}' after match arms");

    return {
      kind: 'MatchStatement',
      subject,
      arms,
      location: start.location,
    };
  }

  private matchArm(): AST.MatchArm {
    const pattern = this.pattern();
    
    let guard: AST.Expression | null = null;
    if (this.match(TokenType.IF)) {
      guard = this.expression();
    }
    
    this.consume(TokenType.FAT_ARROW, "Expected '=>' after match pattern");
    const body = this.expression();

    return {
      kind: 'MatchArm',
      pattern,
      guard,
      body,
      location: pattern.location,
    };
  }

  private pattern(): AST.Pattern {
    const token = this.peek();
    
    // Wildcard
    if (this.match(TokenType.UNDERSCORE)) {
      return { kind: 'WildcardPattern', location: token.location };
    }
    
    // Literal patterns
    if (this.matchAny([TokenType.INTEGER, TokenType.FLOAT, TokenType.STRING, TokenType.BOOLEAN])) {
      return {
        kind: 'LiteralPattern',
        value: this.literalFromToken(this.previous()),
        location: token.location,
      };
    }
    
    // Tuple pattern
    if (this.match(TokenType.LPAREN)) {
      const elements: AST.Pattern[] = [];
      if (!this.check(TokenType.RPAREN)) {
        do {
          elements.push(this.pattern());
        } while (this.match(TokenType.COMMA));
      }
      this.consume(TokenType.RPAREN, "Expected ')' after tuple pattern");
      return {
        kind: 'TuplePattern',
        elements,
        location: token.location,
      };
    }
    
    // Identifier or enum pattern
    if (this.match(TokenType.IDENTIFIER)) {
      const name: AST.Identifier = {
        kind: 'Identifier',
        name: this.previous().value,
        location: token.location,
      };
      
      // Check for enum variant: Type::Variant
      if (this.match(TokenType.COLON) && this.match(TokenType.COLON)) {
        const variant = this.identifier();
        
        let fields: AST.Pattern[] | null = null;
        if (this.match(TokenType.LPAREN)) {
          fields = [];
          if (!this.check(TokenType.RPAREN)) {
            do {
              fields.push(this.pattern());
            } while (this.match(TokenType.COMMA));
          }
          this.consume(TokenType.RPAREN, "Expected ')' after enum pattern");
        }
        
        return {
          kind: 'EnumPattern',
          type: name,
          variant,
          fields,
          location: token.location,
        };
      }
      
      // Check for struct pattern
      if (this.match(TokenType.LBRACE)) {
        const fields: AST.StructPatternField[] = [];
        let hasRest = false;
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          if (this.match(TokenType.RANGE)) {
            hasRest = true;
            break;
          }
          
          const fieldName = this.identifier();
          let fieldPattern: AST.Pattern = {
            kind: 'IdentifierPattern',
            name: fieldName,
            isMutable: false,
            location: fieldName.location,
          };
          
          if (this.match(TokenType.COLON)) {
            fieldPattern = this.pattern();
          }
          
          fields.push({
            kind: 'StructPatternField',
            name: fieldName,
            pattern: fieldPattern,
            location: fieldName.location,
          });
          
          this.match(TokenType.COMMA);
        }
        
        this.consume(TokenType.RBRACE, "Expected '}' after struct pattern");
        
        return {
          kind: 'StructPattern',
          type: name,
          fields,
          hasRest,
          location: token.location,
        };
      }
      
      // Simple identifier pattern
      return {
        kind: 'IdentifierPattern',
        name,
        isMutable: false,
        location: token.location,
      };
    }
    
    throw this.error(this.peek(), 'Expected pattern');
  }

  private blockStatement(): AST.BlockStatement {
    const start = this.consume(TokenType.LBRACE, "Expected '{'");
    const statements: AST.Statement[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const decl = this.declaration();
      if (decl) {
        statements.push(decl);
      }
    }

    this.consume(TokenType.RBRACE, "Expected '}' after block");

    return {
      kind: 'BlockStatement',
      statements,
      location: start.location,
    };
  }

  private expressionStatement(): AST.ExpressionStatement {
    const expr = this.expression();
    return {
      kind: 'ExpressionStatement',
      expression: expr,
      location: expr.location,
    };
  }

  // ============================================================================
  // Expressions
  // ============================================================================

  private expression(): AST.Expression {
    return this.assignment();
  }

  private assignment(): AST.Expression {
    const expr = this.logicalOr();

    if (this.matchAny([TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN, 
                       TokenType.STAR_ASSIGN, TokenType.SLASH_ASSIGN])) {
      const operator = this.previous().value as '=' | '+=' | '-=' | '*=' | '/=';
      const value = this.assignment();
      
      return {
        kind: 'AssignmentExpression',
        operator,
        left: expr,
        right: value,
        location: expr.location,
      };
    }

    return expr;
  }

  private logicalOr(): AST.Expression {
    let left = this.logicalAnd();

    while (this.match(TokenType.OR)) {
      const right = this.logicalAnd();
      left = {
        kind: 'BinaryExpression',
        operator: '||',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private logicalAnd(): AST.Expression {
    let left = this.equality();

    while (this.match(TokenType.AND)) {
      const right = this.equality();
      left = {
        kind: 'BinaryExpression',
        operator: '&&',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private equality(): AST.Expression {
    let left = this.comparison();

    while (this.matchAny([TokenType.EQ, TokenType.NEQ])) {
      const operator = this.previous().type === TokenType.EQ ? '==' : '!=';
      const right = this.comparison();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private comparison(): AST.Expression {
    let left = this.bitwiseOr();

    while (this.matchAny([TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE])) {
      const op = this.previous().type;
      const operator = op === TokenType.LT ? '<' : op === TokenType.GT ? '>' :
                       op === TokenType.LTE ? '<=' : '>=';
      const right = this.bitwiseOr();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private bitwiseOr(): AST.Expression {
    let left = this.bitwiseXor();

    while (this.match(TokenType.BIT_OR)) {
      const right = this.bitwiseXor();
      left = {
        kind: 'BinaryExpression',
        operator: '|',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private bitwiseXor(): AST.Expression {
    let left = this.bitwiseAnd();

    while (this.match(TokenType.BIT_XOR)) {
      const right = this.bitwiseAnd();
      left = {
        kind: 'BinaryExpression',
        operator: '^',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private bitwiseAnd(): AST.Expression {
    let left = this.shift();

    while (this.match(TokenType.BIT_AND)) {
      const right = this.shift();
      left = {
        kind: 'BinaryExpression',
        operator: '&',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private shift(): AST.Expression {
    let left = this.additive();

    while (this.matchAny([TokenType.SHL, TokenType.SHR])) {
      const operator = this.previous().type === TokenType.SHL ? '<<' : '>>';
      const right = this.additive();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private additive(): AST.Expression {
    let left = this.multiplicative();

    while (this.matchAny([TokenType.PLUS, TokenType.MINUS])) {
      const operator = this.previous().type === TokenType.PLUS ? '+' : '-';
      const right = this.multiplicative();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private multiplicative(): AST.Expression {
    let left = this.power();

    while (this.matchAny([TokenType.STAR, TokenType.SLASH, TokenType.PERCENT])) {
      const op = this.previous().type;
      const operator = op === TokenType.STAR ? '*' : op === TokenType.SLASH ? '/' : '%';
      const right = this.power();
      left = {
        kind: 'BinaryExpression',
        operator,
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private power(): AST.Expression {
    let left = this.unary();

    if (this.match(TokenType.POWER)) {
      const right = this.power(); // Right associative
      left = {
        kind: 'BinaryExpression',
        operator: '**',
        left,
        right,
        location: left.location,
      };
    }

    return left;
  }

  private unary(): AST.Expression {
    if (this.matchAny([TokenType.NOT, TokenType.MINUS, TokenType.BIT_NOT])) {
      const op = this.previous().type;
      const operator = op === TokenType.NOT ? '!' : op === TokenType.MINUS ? '-' : '~';
      const operand = this.unary();
      return {
        kind: 'UnaryExpression',
        operator,
        operand,
        isPrefix: true,
        location: this.previous().location,
      };
    }

    if (this.match(TokenType.BIT_AND)) {
      const isMutable = this.match(TokenType.MUT);
      const operand = this.unary();
      return {
        kind: 'UnaryExpression',
        operator: '&',
        operand,
        isPrefix: true,
        location: operand.location,
      };
    }

    if (this.match(TokenType.STAR)) {
      const operand = this.unary();
      return {
        kind: 'UnaryExpression',
        operator: '*',
        operand,
        isPrefix: true,
        location: operand.location,
      };
    }

    return this.postfix();
  }

  private postfix(): AST.Expression {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        // Function call
        const args: AST.Expression[] = [];
        if (!this.check(TokenType.RPAREN)) {
          do {
            args.push(this.expression());
          } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RPAREN, "Expected ')' after arguments");
        expr = {
          kind: 'CallExpression',
          callee: expr,
          arguments: args,
          genericArgs: [],
          location: expr.location,
        };
      } else if (this.match(TokenType.LBRACKET)) {
        // Index access
        const index = this.expression();
        this.consume(TokenType.RBRACKET, "Expected ']' after index");
        expr = {
          kind: 'IndexExpression',
          object: expr,
          index,
          location: expr.location,
        };
      } else if (this.match(TokenType.DOT)) {
        // Member access
        const property = this.identifier();
        expr = {
          kind: 'MemberExpression',
          object: expr,
          property,
          isOptional: false,
          location: expr.location,
        };
      } else if (this.match(TokenType.QUESTION)) {
        // Try expression (error propagation)
        expr = {
          kind: 'TryExpression',
          expression: expr,
          location: expr.location,
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private primary(): AST.Expression {
    const token = this.peek();

    // Literals
    if (this.matchAny([TokenType.INTEGER, TokenType.FLOAT, TokenType.STRING, 
                       TokenType.CHAR, TokenType.BOOLEAN, TokenType.NIL])) {
      return this.literalFromToken(this.previous());
    }

    // old() expression for postconditions
    if (this.match(TokenType.OLD)) {
      this.consume(TokenType.LPAREN, "Expected '(' after 'old'");
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expected ')' after old expression");
      return {
        kind: 'OldExpression',
        expression: expr,
        location: token.location,
      };
    }

    // forall expression
    if (this.match(TokenType.FORALL)) {
      return this.forallExpression(token);
    }

    // exists expression
    if (this.match(TokenType.EXISTS)) {
      return this.existsExpression(token);
    }

    // Parenthesized expression or tuple
    if (this.match(TokenType.LPAREN)) {
      const elements: AST.Expression[] = [];
      
      if (!this.check(TokenType.RPAREN)) {
        do {
          elements.push(this.expression());
        } while (this.match(TokenType.COMMA));
      }
      
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      
      if (elements.length === 1) {
        return elements[0]; // Parenthesized expression
      }
      
      return {
        kind: 'TupleExpression',
        elements,
        location: token.location,
      };
    }

    // Array literal
    if (this.match(TokenType.LBRACKET)) {
      const elements: AST.Expression[] = [];
      
      if (!this.check(TokenType.RBRACKET)) {
        do {
          elements.push(this.expression());
        } while (this.match(TokenType.COMMA));
      }
      
      this.consume(TokenType.RBRACKET, "Expected ']' after array");
      
      return {
        kind: 'ArrayExpression',
        elements,
        location: token.location,
      };
    }

    // Block expression
    if (this.check(TokenType.LBRACE)) {
      const block = this.blockStatement();
      return {
        kind: 'BlockExpression',
        statements: block.statements,
        expression: null,
        location: block.location,
      };
    }

    // If expression
    if (this.match(TokenType.IF)) {
      return this.ifExpression(token);
    }

    // Match expression
    if (this.match(TokenType.MATCH)) {
      return this.matchExpression(token);
    }

    // Lambda expression
    if (this.match(TokenType.BIT_OR)) {
      return this.lambdaExpression(token);
    }

    // Identifier
    if (this.match(TokenType.IDENTIFIER)) {
      const name = this.previous().value;
      
      // Check for struct literal
      if (this.check(TokenType.LBRACE) && !this.isAtEnd()) {
        return this.structExpression(name, token);
      }
      
      return {
        kind: 'Identifier',
        name,
        location: token.location,
      };
    }

    // Self
    if (this.match(TokenType.SELF)) {
      return {
        kind: 'Identifier',
        name: 'self',
        location: token.location,
      };
    }

    throw this.error(this.peek(), 'Expected expression');
  }

  private forallExpression(start: Token): AST.ForallExpression {
    const bindings: AST.ForallBinding[] = [];
    
    do {
      const name = this.identifier();
      let range: AST.Expression | null = null;
      
      if (this.match(TokenType.IN)) {
        range = this.expression();
      }
      
      bindings.push({
        kind: 'ForallBinding',
        name,
        range,
        location: name.location,
      });
    } while (this.match(TokenType.COMMA));
    
    this.consume(TokenType.COLON, "Expected ':' after forall bindings");
    const condition = this.expression();
    
    return {
      kind: 'ForallExpression',
      bindings,
      condition,
      location: start.location,
    };
  }

  private existsExpression(start: Token): AST.ExistsExpression {
    const bindings: AST.ForallBinding[] = [];
    
    do {
      const name = this.identifier();
      let range: AST.Expression | null = null;
      
      if (this.match(TokenType.IN)) {
        range = this.expression();
      }
      
      bindings.push({
        kind: 'ForallBinding',
        name,
        range,
        location: name.location,
      });
    } while (this.match(TokenType.COMMA));
    
    this.consume(TokenType.COLON, "Expected ':' after exists bindings");
    const condition = this.expression();
    
    return {
      kind: 'ExistsExpression',
      bindings,
      condition,
      location: start.location,
    };
  }

  private ifExpression(start: Token): AST.IfExpression {
    const condition = this.expression();
    const thenBlock = this.blockStatement();
    const thenBranch: AST.BlockExpression = {
      kind: 'BlockExpression',
      statements: thenBlock.statements,
      expression: null,
      location: thenBlock.location,
    };
    
    let elseBranch: AST.BlockExpression | AST.IfExpression | null = null;
    if (this.match(TokenType.ELSE)) {
      if (this.match(TokenType.IF)) {
        elseBranch = this.ifExpression(this.previous());
      } else {
        const elseBlock = this.blockStatement();
        elseBranch = {
          kind: 'BlockExpression',
          statements: elseBlock.statements,
          expression: null,
          location: elseBlock.location,
        };
      }
    }
    
    return {
      kind: 'IfExpression',
      condition,
      thenBranch,
      elseBranch,
      location: start.location,
    };
  }

  private matchExpression(start: Token): AST.MatchExpression {
    const subject = this.expression();
    
    this.consume(TokenType.LBRACE, "Expected '{' after match expression");
    
    const arms: AST.MatchArm[] = [];
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      arms.push(this.matchArm());
      this.match(TokenType.COMMA);
    }
    
    this.consume(TokenType.RBRACE, "Expected '}' after match arms");
    
    return {
      kind: 'MatchExpression',
      subject,
      arms,
      location: start.location,
    };
  }

  private lambdaExpression(start: Token): AST.LambdaExpression {
    const parameters: AST.Parameter[] = [];
    
    if (!this.check(TokenType.BIT_OR)) {
      do {
        const isMutable = this.match(TokenType.MUT);
        const name = this.identifier();
        
        let type: AST.TypeExpression | null = null;
        if (this.match(TokenType.COLON)) {
          type = this.typeExpression();
        }
        
        parameters.push({
          kind: 'Parameter',
          name,
          type: type || { kind: 'NamedType', name: { kind: 'Identifier', name: '_', location: name.location }, path: [], location: name.location },
          isMutable,
          defaultValue: null,
          location: name.location,
        });
      } while (this.match(TokenType.COMMA));
    }
    
    this.consume(TokenType.BIT_OR, "Expected '|' after lambda parameters");
    
    let returnType: AST.TypeExpression | null = null;
    if (this.match(TokenType.ARROW)) {
      returnType = this.typeExpression();
    }
    
    const body = this.expression();
    
    return {
      kind: 'LambdaExpression',
      parameters,
      returnType,
      body,
      location: start.location,
    };
  }

  private structExpression(name: string, start: Token): AST.StructExpression {
    this.consume(TokenType.LBRACE, "Expected '{' for struct literal");
    
    const fields: AST.StructExpressionField[] = [];
    let spread: AST.Expression | null = null;
    
    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      if (this.match(TokenType.RANGE)) {
        spread = this.expression();
        break;
      }
      
      const fieldName = this.identifier();
      this.consume(TokenType.COLON, "Expected ':' after field name");
      const fieldValue = this.expression();
      
      fields.push({
        kind: 'StructExpressionField',
        name: fieldName,
        value: fieldValue,
        location: fieldName.location,
      });
      
      this.match(TokenType.COMMA);
    }
    
    this.consume(TokenType.RBRACE, "Expected '}' after struct literal");
    
    return {
      kind: 'StructExpression',
      type: { kind: 'Identifier', name, location: start.location },
      fields,
      spread,
      location: start.location,
    };
  }

  private literalFromToken(token: Token): AST.Literal {
    let literalKind: AST.Literal['literalKind'];
    
    switch (token.type) {
      case TokenType.INTEGER:
        literalKind = 'integer';
        break;
      case TokenType.FLOAT:
        literalKind = 'float';
        break;
      case TokenType.STRING:
        literalKind = 'string';
        break;
      case TokenType.CHAR:
        literalKind = 'char';
        break;
      case TokenType.BOOLEAN:
        literalKind = 'boolean';
        break;
      case TokenType.NIL:
        literalKind = 'nil';
        break;
      default:
        literalKind = 'nil';
    }
    
    return {
      kind: 'Literal',
      value: token.literal ?? null,
      literalKind,
      location: token.location,
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private identifier(): AST.Identifier {
    const token = this.consume(TokenType.IDENTIFIER, 'Expected identifier');
    return {
      kind: 'Identifier',
      name: token.value,
      location: token.location,
    };
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private peekNext(): Token | null {
    if (this.current + 1 >= this.tokens.length) return null;
    return this.tokens[this.current + 1];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private matchAny(types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }

  private error(token: Token, message: string): ParseError {
    const error: ParseError = {
      message,
      location: token.location,
      token,
    };
    this.errors.push(error);
    return error;
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.SEMICOLON) return;

      switch (this.peek().type) {
        case TokenType.FN:
        case TokenType.LET:
        case TokenType.STRUCT:
        case TokenType.ENUM:
        case TokenType.TRAIT:
        case TokenType.IMPL:
        case TokenType.CONTRACT:
        case TokenType.INTENT:
        case TokenType.EFFECT:
        case TokenType.IMPORT:
        case TokenType.EXPORT:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.FOR:
        case TokenType.RETURN:
          return;
      }

      this.advance();
    }
  }
}

export function parse(tokens: Token[]): { program: AST.Program; errors: ParseError[] } {
  const parser = new Parser(tokens);
  return parser.parse();
}
