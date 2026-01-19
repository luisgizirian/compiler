#!/usr/bin/env node
/**
 * Intent Language - Command Line Interface
 * 
 * Usage:
 *   intent <command> [options] <file>
 * 
 * Commands:
 *   compile <file>    Compile Intent source to JavaScript
 *   check <file>      Type-check without generating code
 *   run <file>        Compile and run immediately
 *   repl              Start interactive REPL
 * 
 * Options:
 *   --target, -t      Output target: javascript, typescript (default: javascript)
 *   --output, -o      Output file path
 *   --module, -m      Module system: esm, commonjs (default: esm)
 *   --no-contracts    Disable runtime contract checking
 *   --verify          Verification level: full, runtime, trusted (default: runtime)
 *   --watch, -w       Watch mode - recompile on changes
 *   --version, -v     Show version
 *   --help, -h        Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Compiler, CompilerOptions, CompilationResult, compileIntent } from './index';

const VERSION = '1.0.0';

interface CLIOptions {
  command: 'compile' | 'check' | 'run' | 'repl' | 'help' | 'version';
  files: string[];
  output?: string;
  target: 'javascript' | 'typescript';
  moduleSystem: 'esm' | 'commonjs';
  runtimeContracts: boolean;
  verifyLevel: 'full' | 'runtime' | 'trusted';
  watch: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    command: 'help',
    files: [],
    target: 'javascript',
    moduleSystem: 'esm',
    runtimeContracts: true,
    verifyLevel: 'runtime',
    watch: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case 'compile':
      case 'check':
      case 'run':
      case 'repl':
        options.command = arg;
        break;

      case '--version':
      case '-v':
        options.command = 'version';
        break;

      case '--help':
      case '-h':
        options.command = 'help';
        break;

      case '--target':
      case '-t':
        i++;
        options.target = args[i] as 'javascript' | 'typescript';
        break;

      case '--output':
      case '-o':
        i++;
        options.output = args[i];
        break;

      case '--module':
      case '-m':
        i++;
        options.moduleSystem = args[i] as 'esm' | 'commonjs';
        break;

      case '--no-contracts':
        options.runtimeContracts = false;
        break;

      case '--verify':
        i++;
        options.verifyLevel = args[i] as 'full' | 'runtime' | 'trusted';
        break;

      case '--watch':
      case '-w':
        options.watch = true;
        break;

      default:
        if (!arg.startsWith('-')) {
          options.files.push(arg);
        }
        break;
    }
    i++;
  }

  // Default command based on file presence
  if (options.command === 'help' && options.files.length > 0) {
    options.command = 'compile';
  }

  return options;
}

function showHelp(): void {
  console.log(`
Intent Language Compiler v${VERSION}

Usage:
  intent <command> [options] <file>

Commands:
  compile <file>    Compile Intent source to JavaScript
  check <file>      Type-check without generating code
  run <file>        Compile and run immediately
  repl              Start interactive REPL

Options:
  --target, -t      Output target: javascript, typescript (default: javascript)
  --output, -o      Output file path
  --module, -m      Module system: esm, commonjs (default: esm)
  --no-contracts    Disable runtime contract checking
  --verify          Verification level: full, runtime, trusted (default: runtime)
  --watch, -w       Watch mode - recompile on changes
  --version, -v     Show version
  --help, -h        Show help

Examples:
  intent compile src/main.intent -o dist/main.js
  intent check src/main.intent
  intent run examples/hello.intent
  intent repl
`);
}

function showVersion(): void {
  console.log(`Intent Language Compiler v${VERSION}`);
}

function formatError(error: { phase: string; message: string; line: number; column: number; file?: string }): string {
  const location = error.file 
    ? `${error.file}:${error.line}:${error.column}`
    : `${error.line}:${error.column}`;
  return `[${error.phase}] ${location}: ${error.message}`;
}

function compileFile(filepath: string, options: CLIOptions): CompilationResult {
  const absolutePath = path.resolve(filepath);
  
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      errors: [{
        phase: 'codegen',
        message: `File not found: ${filepath}`,
        line: 0,
        column: 0,
        severity: 'error',
      }],
      warnings: [],
    };
  }

  const source = fs.readFileSync(absolutePath, 'utf-8');
  
  const compilerOptions: Partial<CompilerOptions> = {
    target: options.target,
    moduleSystem: options.moduleSystem,
    runtimeContracts: options.runtimeContracts,
    verifyLevel: options.verifyLevel,
  };

  return compileIntent(source, compilerOptions);
}

function handleCompile(options: CLIOptions): number {
  let exitCode = 0;

  for (const file of options.files) {
    console.log(`Compiling ${file}...`);
    
    const result = compileFile(file, options);

    // Show warnings
    for (const warning of result.warnings) {
      console.warn(`⚠ ${formatError(warning)}`);
    }

    // Show errors
    for (const error of result.errors) {
      console.error(`✗ ${formatError(error)}`);
    }

    if (result.success && result.output) {
      // Determine output path
      const outputPath = options.output || file.replace(/\.intent$/, '.js');
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      fs.writeFileSync(outputPath, result.output);
      console.log(`✓ Compiled to ${outputPath}`);
    } else {
      console.error(`✗ Compilation failed for ${file}`);
      exitCode = 1;
    }
  }

  return exitCode;
}

function handleCheck(options: CLIOptions): number {
  let exitCode = 0;
  const compiler = new Compiler({
    runtimeContracts: options.runtimeContracts,
    verifyLevel: options.verifyLevel,
  });

  for (const file of options.files) {
    console.log(`Checking ${file}...`);
    
    const absolutePath = path.resolve(file);
    if (!fs.existsSync(absolutePath)) {
      console.error(`✗ File not found: ${file}`);
      exitCode = 1;
      continue;
    }

    const source = fs.readFileSync(absolutePath, 'utf-8');
    const { ast, analysisResult, errors } = compiler.analyzeOnly(source, file);

    // Show warnings
    for (const warning of analysisResult.warnings) {
      console.warn(`⚠ ${warning.location.line}:${warning.location.column}: ${warning.message}`);
    }

    // Show errors
    for (const error of errors) {
      console.error(`✗ ${formatError(error)}`);
    }

    if (errors.filter(e => e.severity === 'error').length === 0) {
      console.log(`✓ ${file} - no errors`);
    } else {
      exitCode = 1;
    }
  }

  return exitCode;
}

async function handleRun(options: CLIOptions): Promise<number> {
  if (options.files.length === 0) {
    console.error('No file specified');
    return 1;
  }

  const file = options.files[0];
  const result = compileFile(file, options);

  // Show errors
  for (const error of result.errors) {
    console.error(`✗ ${formatError(error)}`);
  }

  if (!result.success || !result.output) {
    return 1;
  }

  // Execute the generated JavaScript
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    const fn = new AsyncFunction(result.output);
    await fn();
    return 0;
  } catch (err) {
    console.error('Runtime error:', err);
    return 1;
  }
}

async function handleRepl(): Promise<void> {
  console.log(`Intent Language REPL v${VERSION}`);
  console.log('Type .help for help, .exit to quit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'intent> ',
  });

  const compiler = new Compiler({ runtimeContracts: true });
  let multilineBuffer = '';
  let inMultiline = false;

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    // Handle commands
    if (trimmed === '.exit' || trimmed === '.quit') {
      rl.close();
      return;
    }

    if (trimmed === '.help') {
      console.log(`
Commands:
  .help     Show this help
  .exit     Exit the REPL
  .clear    Clear multiline buffer
  
Enter Intent code and press Enter to evaluate.
Use { to start multiline input, } to end.
`);
      rl.prompt();
      return;
    }

    if (trimmed === '.clear') {
      multilineBuffer = '';
      inMultiline = false;
      console.log('Buffer cleared');
      rl.prompt();
      return;
    }

    // Handle multiline input
    if (trimmed.endsWith('{') && !inMultiline) {
      inMultiline = true;
      multilineBuffer = line + '\n';
      rl.setPrompt('... ');
      rl.prompt();
      return;
    }

    if (inMultiline) {
      multilineBuffer += line + '\n';
      
      // Check for balanced braces
      const openCount = (multilineBuffer.match(/{/g) || []).length;
      const closeCount = (multilineBuffer.match(/}/g) || []).length;
      
      if (openCount <= closeCount) {
        inMultiline = false;
        line = multilineBuffer;
        multilineBuffer = '';
        rl.setPrompt('intent> ');
      } else {
        rl.prompt();
        return;
      }
    }

    // Compile and evaluate
    if (trimmed) {
      // Wrap expression in a function if it's not a declaration
      let code = line;
      if (!line.trim().startsWith('fn ') && 
          !line.trim().startsWith('let ') &&
          !line.trim().startsWith('struct ') &&
          !line.trim().startsWith('enum ')) {
        code = `fn __repl__() { return ${line} }`;
      }

      const result = compiler.compile(code);

      if (result.errors.length > 0) {
        for (const error of result.errors) {
          console.error(`Error: ${error.message}`);
        }
      } else if (result.output) {
        try {
          // Execute and show result
          const evalCode = result.output + '\nif (typeof __repl__ === "function") { console.log(__repl__()); }';
          eval(evalCode);
        } catch (err) {
          console.error('Runtime error:', err instanceof Error ? err.message : err);
        }
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nGoodbye!');
    process.exit(0);
  });
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  switch (options.command) {
    case 'help':
      showHelp();
      return 0;

    case 'version':
      showVersion();
      return 0;

    case 'compile':
      if (options.files.length === 0) {
        console.error('No input files specified');
        return 1;
      }
      return handleCompile(options);

    case 'check':
      if (options.files.length === 0) {
        console.error('No input files specified');
        return 1;
      }
      return handleCheck(options);

    case 'run':
      return await handleRun(options);

    case 'repl':
      await handleRepl();
      return 0;

    default:
      showHelp();
      return 1;
  }
}

// Run if this is the main module
main().then(code => {
  process.exit(code);
}).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
