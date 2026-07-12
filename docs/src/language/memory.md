# Memory

Juni gives you C++-style control over memory.

## No GC

Values live in WASM linear memory or as scalar locals. There is no tracing garbage collector.

## `new` and `delete`

```juni
let p = new Vec2(x=0.0, y=0.0)
delete p
```

`new` allocates from a bump heap and returns `mut ref T`. In v0, `delete` is accepted by the typechecker but does not reclaim memory yet (bump allocator only).

## Struct values

```juni
let p = Vec2(x=3.0, y=4.0)
```

Also allocates in the bump region and yields a struct address (by-value semantics are copy-of-fields at the language level; representation is a pointer in WASM for v0).

## Alignment

Fields are laid out with natural alignment (4 or 8 bytes). Struct size is rounded up.
