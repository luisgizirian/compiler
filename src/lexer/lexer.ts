/**
 * Intent Language - Lexer
 * 
 * Transforms source code into a stream of tokens.
 * Handles all Intent language lexical elements including:
 * - Keywords and identifiers
 * - Numeric and string literals
 * - Operators and punctuation
 * - Comments (single and multi-line)
 * - Contract annotations (@requires, @ensures, etc.)
 */

import {
  Token,
  TokenType,
  KEYWORDS,
  createToken,
  SourceLocation,
} from './token';

export interface LexerError {
  message: string;
  location: SourceLocation;
}

export class Lexer {
  private source: string;
  private tokens: Token[] = [];
  private errors: LexerError[] = [];
  
  private start = 0;
  private current = 0;
  private line = 1;
  private column = 1;
  private lineStart = 0;
  private file?: string;

  constructor(source: string, file?: string) {
    this.source = source;
    this.file = file;
  }

  /**
   * Tokenize the entire source code
   */
  tokenize(): { tokens: Token[]; errors: LexerError[] } {
    while (!this.isAtEnd()) {
      this.start = this.current;
      this.scanToken();
    }

    this.tokens.push(
      createToken(TokenType.EOF, '', this.line, this.column, this.current)
    );

    return { tokens: this.tokens, errors: this.errors };
  }

  private scanToken(): void {
    const c = this.advance();

    switch (c) {
      // Single-character tokens
      case '(': this.addToken(TokenType.LPAREN); break;
      case ')': this.addToken(TokenType.RPAREN); break;
      case '{': this.addToken(TokenType.LBRACE); break;
      case '}': this.addToken(TokenType.RBRACE); break;
      case '[': this.addToken(TokenType.LBRACKET); break;
      case ']': this.addToken(TokenType.RBRACKET); break;
      case ',': this.addToken(TokenType.COMMA); break;
      case ';': this.addToken(TokenType.SEMICOLON); break;
      case '?': this.addToken(TokenType.QUESTION); break;
      case '@': this.addToken(TokenType.AT); break;
      case '#': this.addToken(TokenType.HASH); break;
      case '~': this.addToken(TokenType.BIT_NOT); break;
      case ':': this.addToken(TokenType.COLON); break;

      // Potentially multi-character tokens
      case '+':
        if (this.match('=')) {
          this.addToken(TokenType.PLUS_ASSIGN);
        } else {
          this.addToken(TokenType.PLUS);
        }
        break;

      case '-':
        if (this.match('>')) {
          this.addToken(TokenType.ARROW);
        } else if (this.match('=')) {
          this.addToken(TokenType.MINUS_ASSIGN);
        } else {
          this.addToken(TokenType.MINUS);
        }
        break;

      case '*':
        if (this.match('*')) {
          this.addToken(TokenType.POWER);
        } else if (this.match('=')) {
          this.addToken(TokenType.STAR_ASSIGN);
        } else {
          this.addToken(TokenType.STAR);
        }
        break;

      case '/':
        if (this.match('/')) {
          // Single-line comment
          while (this.peek() !== '\n' && !this.isAtEnd()) {
            this.advance();
          }
        } else if (this.match('*')) {
          // Multi-line comment
          this.blockComment();
        } else if (this.match('=')) {
          this.addToken(TokenType.SLASH_ASSIGN);
        } else {
          this.addToken(TokenType.SLASH);
        }
        break;

      case '%':
        this.addToken(TokenType.PERCENT);
        break;

      case '=':
        if (this.match('=')) {
          this.addToken(TokenType.EQ);
        } else if (this.match('>')) {
          this.addToken(TokenType.FAT_ARROW);
        } else {
          this.addToken(TokenType.ASSIGN);
        }
        break;

      case '!':
        if (this.match('=')) {
          this.addToken(TokenType.NEQ);
        } else {
          this.addToken(TokenType.NOT);
        }
        break;

      case '<':
        if (this.match('=')) {
          this.addToken(TokenType.LTE);
        } else if (this.match('<')) {
          this.addToken(TokenType.SHL);
        } else {
          this.addToken(TokenType.LT);
        }
        break;

      case '>':
        if (this.match('=')) {
          this.addToken(TokenType.GTE);
        } else if (this.match('>')) {
          this.addToken(TokenType.SHR);
        } else {
          this.addToken(TokenType.GT);
        }
        break;

      case '&':
        if (this.match('&')) {
          this.addToken(TokenType.AND);
        } else {
          this.addToken(TokenType.BIT_AND);
        }
        break;

      case '|':
        if (this.match('|')) {
          this.addToken(TokenType.OR);
        } else {
          this.addToken(TokenType.BIT_OR);
        }
        break;

      case '^':
        this.addToken(TokenType.BIT_XOR);
        break;

      case '.':
        if (this.match('.')) {
          if (this.match('=')) {
            this.addToken(TokenType.RANGE_INCL);
          } else {
            this.addToken(TokenType.RANGE);
          }
        } else {
          this.addToken(TokenType.DOT);
        }
        break;

      // Whitespace
      case ' ':
      case '\r':
      case '\t':
        // Ignore whitespace
        break;

      case '\n':
        this.line++;
        this.column = 1;
        this.lineStart = this.current;
        break;

      // Literals
      case '"':
        this.string();
        break;

      case "'":
        this.char();
        break;

      default:
        if (this.isDigit(c)) {
          this.number();
        } else if (this.isAlpha(c)) {
          this.identifier();
        } else if (c === '_') {
          if (this.isAlphaNumeric(this.peek())) {
            this.identifier();
          } else {
            this.addToken(TokenType.UNDERSCORE);
          }
        } else {
          this.error(`Unexpected character: '${c}'`);
        }
        break;
    }
  }

  private blockComment(): void {
    let depth = 1;
    while (depth > 0 && !this.isAtEnd()) {
      if (this.peek() === '/' && this.peekNext() === '*') {
        this.advance();
        this.advance();
        depth++;
      } else if (this.peek() === '*' && this.peekNext() === '/') {
        this.advance();
        this.advance();
        depth--;
      } else {
        if (this.peek() === '\n') {
          this.line++;
          this.column = 0;
          this.lineStart = this.current + 1;
        }
        this.advance();
      }
    }

    if (depth > 0) {
      this.error('Unterminated block comment');
    }
  }

  private string(): void {
    const startLine = this.line;
    const startColumn = this.column - 1;
    let value = '';

    while (this.peek() !== '"' && !this.isAtEnd()) {
      if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
        this.lineStart = this.current + 1;
      }
      if (this.peek() === '\\') {
        this.advance();
        value += this.escapeSequence();
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      this.error('Unterminated string');
      return;
    }

    // Closing "
    this.advance();
    this.addTokenWithLiteral(TokenType.STRING, value, startLine, startColumn);
  }

  private char(): void {
    const startColumn = this.column - 1;
    let value: string;

    if (this.peek() === '\\') {
      this.advance();
      value = this.escapeSequence();
    } else {
      value = this.advance();
    }

    if (this.peek() !== "'") {
      this.error("Unterminated character literal");
      return;
    }

    this.advance(); // Closing '
    this.addTokenWithLiteral(TokenType.CHAR, value, this.line, startColumn);
  }

  private escapeSequence(): string {
    const c = this.advance();
    switch (c) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      case '0': return '\0';
      case 'x': {
        // Hex escape \xFF
        const hex = this.advance() + this.advance();
        return String.fromCharCode(parseInt(hex, 16));
      }
      case 'u': {
        // Unicode escape \u{XXXX}
        if (this.match('{')) {
          let hex = '';
          while (this.peek() !== '}' && !this.isAtEnd()) {
            hex += this.advance();
          }
          if (!this.match('}')) {
            this.error('Unterminated unicode escape');
            return '';
          }
          return String.fromCodePoint(parseInt(hex, 16));
        }
        this.error('Invalid unicode escape');
        return '';
      }
      default:
        this.error(`Invalid escape sequence: \\${c}`);
        return c;
    }
  }

  private number(): void {
    const startColumn = this.column - 1;
    
    // Check for hex, binary, or octal
    if (this.source[this.start] === '0') {
      const next = this.peek();
      if (next === 'x' || next === 'X') {
        this.advance();
        while (this.isHexDigit(this.peek())) {
          this.advance();
        }
        const value = this.source.substring(this.start, this.current);
        this.addTokenWithLiteral(
          TokenType.INTEGER,
          parseInt(value, 16),
          this.line,
          startColumn
        );
        return;
      }
      if (next === 'b' || next === 'B') {
        this.advance();
        while (this.peek() === '0' || this.peek() === '1') {
          this.advance();
        }
        const value = this.source.substring(this.start + 2, this.current);
        this.addTokenWithLiteral(
          TokenType.INTEGER,
          parseInt(value, 2),
          this.line,
          startColumn
        );
        return;
      }
      if (next === 'o' || next === 'O') {
        this.advance();
        while (this.isOctalDigit(this.peek())) {
          this.advance();
        }
        const value = this.source.substring(this.start + 2, this.current);
        this.addTokenWithLiteral(
          TokenType.INTEGER,
          parseInt(value, 8),
          this.line,
          startColumn
        );
        return;
      }
    }

    // Regular decimal number
    while (this.isDigit(this.peek())) {
      this.advance();
    }

    // Allow underscores as separators
    while (this.peek() === '_' && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Check for float
    let isFloat = false;
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      isFloat = true;
      this.advance(); // consume '.'
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    // Scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      isFloat = true;
      this.advance();
      if (this.peek() === '+' || this.peek() === '-') {
        this.advance();
      }
      while (this.isDigit(this.peek())) {
        this.advance();
      }
    }

    const text = this.source.substring(this.start, this.current).replace(/_/g, '');
    const value = isFloat ? parseFloat(text) : parseInt(text, 10);
    
    this.addTokenWithLiteral(
      isFloat ? TokenType.FLOAT : TokenType.INTEGER,
      value,
      this.line,
      startColumn
    );
  }

  private identifier(): void {
    while (this.isAlphaNumeric(this.peek()) || this.peek() === '_') {
      this.advance();
    }

    const text = this.source.substring(this.start, this.current);
    
    // Check for keywords
    const type = KEYWORDS[text] ?? TokenType.IDENTIFIER;
    
    // Handle boolean literals
    if (type === TokenType.TRUE) {
      this.addTokenWithLiteral(TokenType.BOOLEAN, true, this.line, this.column - text.length);
    } else if (type === TokenType.FALSE) {
      this.addTokenWithLiteral(TokenType.BOOLEAN, false, this.line, this.column - text.length);
    } else if (type === TokenType.NIL) {
      this.addTokenWithLiteral(TokenType.NIL, null, this.line, this.column - text.length);
    } else {
      this.addToken(type);
    }
  }

  // Helper methods

  private isAtEnd(): boolean {
    return this.current >= this.source.length;
  }

  private advance(): string {
    const c = this.source[this.current];
    this.current++;
    this.column++;
    return c;
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.source[this.current];
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0';
    return this.source[this.current + 1];
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.source[this.current] !== expected) return false;
    this.current++;
    this.column++;
    return true;
  }

  private isDigit(c: string): boolean {
    return c >= '0' && c <= '9';
  }

  private isHexDigit(c: string): boolean {
    return (c >= '0' && c <= '9') ||
           (c >= 'a' && c <= 'f') ||
           (c >= 'A' && c <= 'F');
  }

  private isOctalDigit(c: string): boolean {
    return c >= '0' && c <= '7';
  }

  private isAlpha(c: string): boolean {
    return (c >= 'a' && c <= 'z') ||
           (c >= 'A' && c <= 'Z');
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c);
  }

  private addToken(type: TokenType): void {
    const text = this.source.substring(this.start, this.current);
    this.tokens.push(
      createToken(
        type,
        text,
        this.line,
        this.column - text.length,
        this.start
      )
    );
  }

  private addTokenWithLiteral(
    type: TokenType,
    literal: number | string | boolean | null,
    line: number,
    column: number
  ): void {
    const text = this.source.substring(this.start, this.current);
    const token = createToken(type, text, line, column, this.start, literal);
    if (this.file) {
      token.location.file = this.file;
    }
    this.tokens.push(token);
  }

  private error(message: string): void {
    this.errors.push({
      message,
      location: {
        line: this.line,
        column: this.column,
        offset: this.current,
        length: 1,
        file: this.file,
      },
    });
    this.addToken(TokenType.INVALID);
  }
}

export function tokenize(source: string, file?: string): { tokens: Token[]; errors: LexerError[] } {
  const lexer = new Lexer(source, file);
  return lexer.tokenize();
}
