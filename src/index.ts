/**
 * Intent Language - Compiler Entry Point
 * 
 * Main compiler API that ties together all phases:
 * Lexer → Parser → Analyzer → Code Generator
 */

import { tokenize, Token } from './lexer';
import { parse, Program } from './parser';
import { analyze, AnalysisResult } from './analyzer';
import { generateJavaScript } from './codegen';

export interface CompilerOptions {
  // Target language
  target: 'javascript' | 'typescript';
  
  // Module system for JavaScript output
  moduleSystem: 'esm' | 'commonjs';
  
  // Enable runtime contract checking
  runtimeContracts: boolean;
  
  // Verification level
  verifyLevel: 'full' | 'runtime' | 'trusted';
  
  // Generate source maps
  sourceMap: boolean;
  
  // Minify output
  minify: boolean;
  
  // Stop on first error
  stopOnFirstError: boolean;
}

const DEFAULT_OPTIONS: CompilerOptions = {
  target: 'javascript',
  moduleSystem: 'esm',
  runtimeContracts: true,
  verifyLevel: 'runtime',
  sourceMap: false,
  minify: false,
  stopOnFirstError: false,
};

export interface CompilationResult {
  success: boolean;
  output?: string;
  errors: CompilerError[];
  warnings: CompilerError[];
  ast?: Program;
  tokens?: Token[];
  analysisResult?: AnalysisResult;
}

export interface CompilerError {
  phase: 'lexer' | 'parser' | 'analyzer' | 'codegen';
  message: string;
  file?: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
}

export class Compiler {
  private options: CompilerOptions;

  constructor(options: Partial<CompilerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  compile(source: string, filename?: string): CompilationResult {
    const errors: CompilerError[] = [];
    const warnings: CompilerError[] = [];

    // Phase 1: Lexical Analysis
    const { tokens, errors: lexerErrors } = tokenize(source, filename);
    
    for (const err of lexerErrors) {
      errors.push({
        phase: 'lexer',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: 'error',
      });
    }

    if (this.options.stopOnFirstError && errors.length > 0) {
      return { success: false, errors, warnings, tokens };
    }

    // Phase 2: Parsing
    const { program: ast, errors: parseErrors } = parse(tokens);
    
    for (const err of parseErrors) {
      errors.push({
        phase: 'parser',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: 'error',
      });
    }

    if (this.options.stopOnFirstError && errors.length > 0) {
      return { success: false, errors, warnings, tokens, ast };
    }

    // Phase 3: Semantic Analysis
    const analysisResult = analyze(ast);
    
    for (const err of analysisResult.errors) {
      errors.push({
        phase: 'analyzer',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: err.severity,
      });
    }

    for (const warn of analysisResult.warnings) {
      warnings.push({
        phase: 'analyzer',
        message: warn.message,
        file: warn.location.file,
        line: warn.location.line,
        column: warn.location.column,
        severity: 'warning',
      });
    }

    if (this.options.stopOnFirstError && errors.length > 0) {
      return { success: false, errors, warnings, tokens, ast, analysisResult };
    }

    // Phase 4: Code Generation
    try {
      const output = generateJavaScript(ast, analysisResult, {
        target: this.options.target,
        moduleSystem: this.options.moduleSystem,
        runtimeContracts: this.options.runtimeContracts,
        sourceMap: this.options.sourceMap,
        minify: this.options.minify,
      });

      return {
        success: errors.length === 0,
        output,
        errors,
        warnings,
        tokens,
        ast,
        analysisResult,
      };
    } catch (err) {
      errors.push({
        phase: 'codegen',
        message: err instanceof Error ? err.message : String(err),
        line: 0,
        column: 0,
        severity: 'error',
      });

      return { success: false, errors, warnings, tokens, ast, analysisResult };
    }
  }

  /**
   * Parse source code and return AST only (no code generation)
   */
  parseOnly(source: string, filename?: string): { ast: Program; errors: CompilerError[] } {
    const { tokens, errors: lexerErrors } = tokenize(source, filename);
    const errors: CompilerError[] = [];

    for (const err of lexerErrors) {
      errors.push({
        phase: 'lexer',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: 'error',
      });
    }

    const { program: ast, errors: parseErrors } = parse(tokens);

    for (const err of parseErrors) {
      errors.push({
        phase: 'parser',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: 'error',
      });
    }

    return { ast, errors };
  }

  /**
   * Analyze source code and return analysis result (no code generation)
   */
  analyzeOnly(source: string, filename?: string): { 
    ast: Program; 
    analysisResult: AnalysisResult; 
    errors: CompilerError[] 
  } {
    const { ast, errors } = this.parseOnly(source, filename);
    const analysisResult = analyze(ast);

    for (const err of analysisResult.errors) {
      errors.push({
        phase: 'analyzer',
        message: err.message,
        file: err.location.file,
        line: err.location.line,
        column: err.location.column,
        severity: err.severity,
      });
    }

    return { ast, analysisResult, errors };
  }

  /**
   * Get compiler options
   */
  getOptions(): CompilerOptions {
    return { ...this.options };
  }

  /**
   * Update compiler options
   */
  setOptions(options: Partial<CompilerOptions>): void {
    this.options = { ...this.options, ...options };
  }
}

// Export main APIs (avoid duplicate type names from parser/analyzer AST vs internal types)
export * from './lexer';
export type { Program, Statement, Expression, Declaration } from './parser';
export { Parser, parse, ParseError } from './parser';
export type { 
  Type, 
  StructType, 
  EnumType, 
  TraitType, 
  FunctionType as AnalyzerFunctionType,
  EffectType, 
  CapabilityType 
} from './analyzer';
export { SemanticAnalyzer, analyze, AnalysisResult, SemanticError } from './analyzer';
export * from './codegen';

// Default compiler instance
export const compiler = new Compiler();

/**
 * Compile Intent source code to JavaScript
 */
export function compileIntent(source: string, options?: Partial<CompilerOptions>): CompilationResult {
  const comp = new Compiler(options);
  return comp.compile(source);
}
