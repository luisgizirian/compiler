# Intent Language Specification

**Version:** 1.0.0  
**Status:** Draft

## Overview

Intent is a programming language designed for the LLM era, focusing on **machine-verifiable intent**, **semantic clarity**, and **long-lived system preservation**. Rather than optimizing for keystrokes, Intent optimizes for meaning.

## Design Philosophy

### Core Principles

1. **Intent Over Implementation**: Express *what* you want, with verifiable *constraints*
2. **Contracts First**: All functions have explicit contracts (preconditions, postconditions, invariants)
3. **Effect Tracking**: Side effects are explicit and tracked by the type system
4. **Semantic Preservation**: Code meaning is preserved across refactoring and generation
5. **Machine-Checkable**: All invariants can be verified statically or at runtime

### Why Intent?

In an era where LLMs generate massive amounts of code:
- **Without rails, LLMs hallucinate**
- **With rails, they amplify productivity**

Intent provides those rails through:
- Explicit contracts
- Effect systems  
- Capability-based permissions
- Invariant enforcement

## Lexical Structure

### Keywords

```
intent      # Declare an intent block
fn          # Function declaration
let         # Immutable binding
mut         # Mutable binding
type        # Type alias
struct      # Structure definition
enum        # Enumeration
trait       # Interface/trait
impl        # Implementation
contract    # Contract block
requires    # Precondition
ensures     # Postcondition
invariant   # Invariant
effect      # Effect declaration
capability  # Capability requirement
if          # Conditional
else        # Else branch
match       # Pattern matching
for         # For loop
while       # While loop
return      # Return statement
true        # Boolean true
false       # Boolean false
nil         # Null value
import      # Import module
export      # Export symbol
where       # Type constraints
pure        # Pure function marker
```

### Operators

```
Arithmetic:  +  -  *  /  %  **
Comparison:  ==  !=  <  >  <=  >=
Logical:     &&  ||  !
Bitwise:     &  |  ^  ~  <<  >>
Assignment:  =  +=  -=  *=  /=
Range:       ..  ..=
Arrow:       ->  =>
Contract:    @requires  @ensures  @invariant
Effect:      @effect  @capability
```

### Literals

```intent
// Numbers
42          // Integer
3.14        // Float
0xFF        // Hexadecimal
0b1010      // Binary

// Strings
"hello"     // String
'c'         // Character

// Collections
[1, 2, 3]   // Array
{a: 1, b: 2} // Record
```

## Type System

### Primitive Types

```intent
Int         // Signed integer (platform-sized)
Int8, Int16, Int32, Int64
UInt        // Unsigned integer
Float32, Float64
Bool        // Boolean
Char        // Unicode character
String      // UTF-8 string
Void        // No value
Never       // Never returns (bottom type)
```

### Composite Types

```intent
// Arrays
[Int]           // Dynamic array
[Int; 10]       // Fixed-size array

// Tuples
(Int, String)   // Tuple type

// Optional
Int?            // Optional Int (may be nil)

// Result
Result<T, E>    // Success or error

// Functions
fn(Int, Int) -> Int          // Pure function
fn(Int) -> Int @effect[IO]   // Function with effect
```

### User-Defined Types

```intent
// Struct
struct Point {
    x: Float64,
    y: Float64,
}

// Enum
enum Option<T> {
    Some(T),
    None,
}

// Trait
trait Numeric {
    fn add(self, other: Self) -> Self
    fn zero() -> Self
}
```

## Contracts

Contracts are first-class citizens in Intent. They specify:
- **Preconditions**: What must be true before execution
- **Postconditions**: What will be true after execution  
- **Invariants**: What remains true throughout

### Function Contracts

```intent
fn divide(a: Int, b: Int) -> Int
    @requires b != 0           // Precondition
    @ensures result * b == a   // Postcondition (approximate)
{
    return a / b
}
```

### Type Contracts

```intent
struct BankAccount {
    balance: Float64,
    
    @invariant balance >= 0    // Always non-negative
}
```

### Contract Blocks

```intent
contract TransferMoney {
    @requires source.balance >= amount
    @requires amount > 0
    @ensures source.balance == old(source.balance) - amount
    @ensures dest.balance == old(dest.balance) + amount
    @ensures source.balance + dest.balance == old(source.balance) + old(dest.balance)
}

fn transfer(source: mut BankAccount, dest: mut BankAccount, amount: Float64)
    @contract TransferMoney
{
    source.balance -= amount
    dest.balance += amount
}
```

## Effect System

Effects make side effects explicit and trackable:

```intent
// Declare effects
effect IO {
    fn read() -> String
    fn write(s: String) -> Void
}

effect State<T> {
    fn get() -> T
    fn set(value: T) -> Void
}

// Pure function - no effects
pure fn add(a: Int, b: Int) -> Int {
    return a + b
}

// Function with effects
fn greet(name: String) -> Void @effect[IO] {
    IO.write("Hello, " + name)
}

// Composing effects
fn statefulGreet(name: String) -> Void @effect[IO, State<Int>] {
    let count = State.get()
    State.set(count + 1)
    IO.write("Hello #" + count.toString() + ": " + name)
}
```

## Capability System

Capabilities restrict what code can do:

```intent
capability FileSystem {
    read: Bool,
    write: Bool,
    execute: Bool,
}

capability Network {
    connect: Bool,
    listen: Bool,
}

fn readConfig() -> Config
    @capability FileSystem { read: true }
{
    // Can only read files
}

fn saveData(data: Data) -> Void
    @capability FileSystem { read: true, write: true }
    @capability Network { connect: true }
{
    // Can read/write files and connect to network
}
```

## Intent Blocks

Intent blocks express high-level goals that the implementation must satisfy:

```intent
intent SortedOutput<T: Ord> {
    // The output is a permutation of input
    @ensures forall i, j: output.contains(input[i]) && input.contains(output[j])
    @ensures output.len() == input.len()
    
    // The output is sorted
    @ensures forall i < output.len() - 1: output[i] <= output[i + 1]
}

fn sort<T: Ord>(input: [T]) -> [T]
    @intent SortedOutput<T>
{
    // Implementation can be anything that satisfies the intent
    // LLM-generated, hand-written, or optimized
}
```

## Control Flow

### Conditionals

```intent
if condition {
    // then
} else if other {
    // else if
} else {
    // else
}

// Expression form
let value = if x > 0 { "positive" } else { "non-positive" }
```

### Pattern Matching

```intent
match value {
    Some(x) if x > 0 => handlePositive(x),
    Some(x) => handleNonPositive(x),
    None => handleMissing(),
}

// Exhaustiveness is checked at compile time
```

### Loops

```intent
for item in collection {
    process(item)
}

for i in 0..10 {
    process(i)
}

while condition {
    // body
}
```

## Modules

```intent
// math.intent
export fn add(a: Int, b: Int) -> Int {
    return a + b
}

export type Vector = struct {
    x: Float64,
    y: Float64,
}

// main.intent
import math.{add, Vector}
import io

fn main() -> Void @effect[IO] {
    let result = add(1, 2)
    io.println(result.toString())
}
```

## Error Handling

Intent uses Result types for explicit error handling:

```intent
enum Result<T, E> {
    Ok(T),
    Err(E),
}

fn parseNumber(s: String) -> Result<Int, ParseError> {
    // ...
}

fn main() -> Result<Void, Error> {
    let num = parseNumber("42")?  // Propagate error with ?
    
    match parseNumber("invalid") {
        Ok(n) => process(n),
        Err(e) => handleError(e),
    }
    
    Ok(())
}
```

## Memory Model

Intent uses a hybrid memory model:
- **Value types**: Copied by default
- **Reference types**: Explicit borrowing
- **Ownership**: Clear ownership with automatic cleanup

```intent
struct LargeData { /* ... */ }

fn process(data: &LargeData) {       // Immutable borrow
    // Read-only access
}

fn mutate(data: &mut LargeData) {    // Mutable borrow
    // Read-write access
}

fn consume(data: LargeData) {        // Ownership transfer
    // Takes ownership, will be dropped after
}
```

## Verification Levels

Intent supports different verification levels:

```intent
@verify(level: "full")     // Full static verification
@verify(level: "runtime")  // Runtime checks only
@verify(level: "trusted")  // Trusted, no checks

fn criticalOperation() -> Void
    @verify(level: "full")
{
    // Fully verified at compile time
}
```

## Interoperability

Intent can interoperate with other languages:

```intent
// FFI declarations
extern "C" {
    fn printf(format: *Char, ...) -> Int
}

// JavaScript target
extern "JS" {
    fn console_log(msg: String) -> Void as "console.log"
}
```

## Grammar (EBNF)

```ebnf
program        = statement* ;

statement      = declaration
               | expression_stmt
               | control_flow ;

declaration    = fn_decl
               | let_decl
               | type_decl
               | struct_decl
               | enum_decl
               | trait_decl
               | impl_decl
               | intent_decl
               | contract_decl
               | effect_decl
               | import_decl
               | export_decl ;

fn_decl        = "fn" IDENT generic_params? "(" params? ")" "->" type
                 annotations* block ;

annotations    = "@requires" expression
               | "@ensures" expression
               | "@invariant" expression
               | "@effect" "[" effect_list "]"
               | "@capability" capability_spec
               | "@contract" IDENT
               | "@intent" IDENT generic_args?
               | "@verify" "(" verify_opts ")" ;

expression     = literal
               | IDENT
               | binary_expr
               | unary_expr
               | call_expr
               | member_expr
               | index_expr
               | if_expr
               | match_expr
               | block_expr ;

type           = primitive_type
               | IDENT generic_args?
               | array_type
               | tuple_type
               | function_type
               | reference_type
               | optional_type ;
```

## Example Program

```intent
// banking.intent - A verified banking system

effect Database {
    fn query<T>(sql: String) -> Result<T, DbError>
    fn execute(sql: String) -> Result<Void, DbError>
}

effect Logging {
    fn log(level: LogLevel, msg: String) -> Void
}

struct Account {
    id: String,
    owner: String,
    balance: Float64,
    
    @invariant balance >= 0
}

contract SafeTransfer {
    @requires amount > 0
    @requires from.balance >= amount
    @ensures from.balance == old(from.balance) - amount
    @ensures to.balance == old(to.balance) + amount
}

intent MoneyConservation {
    @ensures sum(all_accounts.balance) == old(sum(all_accounts.balance))
}

fn transfer(
    from: mut Account,
    to: mut Account,
    amount: Float64
) -> Result<Void, TransferError>
    @contract SafeTransfer
    @intent MoneyConservation
    @effect[Database, Logging]
    @capability Database { write: true }
{
    Logging.log(Info, "Transferring " + amount.toString())
    
    from.balance -= amount
    to.balance += amount
    
    Database.execute("UPDATE accounts SET ...")?
    
    Ok(())
}

fn main() -> Result<Void, Error> @effect[IO] {
    let alice = Account { id: "1", owner: "Alice", balance: 1000.0 }
    let bob = Account { id: "2", owner: "Bob", balance: 500.0 }
    
    transfer(alice, bob, 100.0)?
    
    IO.write("Transfer complete")
    Ok(())
}
```

## Appendix: Comparison with Existing Languages

| Feature | Intent | Rust | TypeScript | Haskell |
|---------|--------|------|------------|---------|
| Contracts | ✅ First-class | ❌ | ❌ | ⚠️ Limited |
| Effect System | ✅ Built-in | ❌ | ❌ | ✅ Monads |
| Capabilities | ✅ Built-in | ❌ | ❌ | ❌ |
| Intent Blocks | ✅ Unique | ❌ | ❌ | ❌ |
| Memory Safety | ✅ | ✅ | ⚠️ GC | ✅ GC |
| Null Safety | ✅ | ✅ | ⚠️ Optional | ✅ |
| LLM-Friendly | ✅ Designed for | ⚠️ | ⚠️ | ⚠️ |
