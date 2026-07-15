# Memory

Juni gives you C++-style control over memory.

## No GC

Values live in WASM linear memory or as scalar locals. There is no tracing garbage collector.

## `new` and `delete`

```juni
let p = new Vec2(x=0.0, y=0.0)
delete p
```

`new` allocates from a **segregated free-list heap** and returns `mut ref T`. `delete` returns the block to the appropriate size-class freelist for reuse.

## Heap layout

Linear memory uses a fixed freelist metadata region at the start of the heap, followed by allocated blocks. Each allocation has an 8-byte header (`block_size`, `next_free`) hidden before the pointer you hold in Juni.

Size classes span 16 bytes through 512 KiB (16 buckets). Allocations round up to the next class; freed blocks are pushed onto that class list and reused before bumping the heap top.

## Struct values

```juni
let p = Vec2(x=3.0, y=4.0)
```

Also allocates in the heap region and yields a struct address (by-value semantics are copy-of-fields at the language level; representation is a pointer in WASM).

## Alignment

Fields are laid out with natural alignment (4 or 8 bytes). Struct size is rounded up.
