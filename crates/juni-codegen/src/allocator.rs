//! Segregated free-list heap allocator emitted into WASM.

use wasm_encoder::{BlockType, Function, Instruction, MemArg, ValType};

/// Number of size classes (16, 32, …, 524288 bytes).
pub const NUM_CLASSES: u32 = 16;
/// Bytes per block header: [block_size: i32][next_free: i32].
pub const HEADER_SIZE: u32 = 8;
/// Minimum block size including header.
pub const MIN_BLOCK: u32 = 16;
/// Freelist head table size in bytes.
pub const META_SIZE: u32 = NUM_CLASSES * 4;

pub fn heap_base(static_region_size: u32) -> u32 {
    let aligned = (static_region_size + 15) / 16 * 16;
    aligned.max(1024)
}

pub fn heap_start(static_region_size: u32) -> u32 {
    heap_base(static_region_size) + META_SIZE
}

fn emit_max_local_const(f: &mut Function, local: u32, const_val: i32) {
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::I32GtS);
    f.instruction(&Instruction::If(BlockType::Result(ValType::I32)));
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::Else);
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::End);
}

fn emit_min_local_const(f: &mut Function, local: u32, const_val: i32) {
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::I32LtS);
    f.instruction(&Instruction::If(BlockType::Result(ValType::I32)));
    f.instruction(&Instruction::LocalGet(local));
    f.instruction(&Instruction::Else);
    f.instruction(&Instruction::I32Const(const_val));
    f.instruction(&Instruction::End);
}

/// Emit WASM to allocate `user_size` bytes from local `user_size_local`; leaves user pointer on stack.
pub fn emit_alloc(
    f: &mut Function,
    user_size_local: u32,
    scratch: u32,
    scratch2: u32,
    scratch3: u32,
    scratch4: u32,
    heap_base_const: u32,
) {
    // block_size = max(16, align8(user_size + 8))
    f.instruction(&Instruction::LocalGet(user_size_local));
    f.instruction(&Instruction::I32Const(HEADER_SIZE as i32));
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::I32Const(7));
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::I32Const(-8));
    f.instruction(&Instruction::I32And);
    f.instruction(&Instruction::LocalSet(scratch));
    emit_max_local_const(f, scratch, MIN_BLOCK as i32);
    f.instruction(&Instruction::LocalSet(scratch));

    // class = clamp(((block_size >> 4) - 1), 0, 15)
    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::I32Const(4));
    f.instruction(&Instruction::I32ShrU);
    f.instruction(&Instruction::I32Const(1));
    f.instruction(&Instruction::I32Sub);
    f.instruction(&Instruction::LocalSet(scratch2));
    emit_max_local_const(f, scratch2, 0);
    f.instruction(&Instruction::LocalSet(scratch2));
    emit_min_local_const(f, scratch2, (NUM_CLASSES - 1) as i32);
    f.instruction(&Instruction::LocalSet(scratch2));

    // head_addr = heap_base + class * 4
    f.instruction(&Instruction::I32Const(heap_base_const as i32));
    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::I32Const(4));
    f.instruction(&Instruction::I32Mul);
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::LocalSet(scratch3));
    f.instruction(&Instruction::LocalGet(scratch3));
    f.instruction(&Instruction::I32Load(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalSet(scratch4));

    f.instruction(&Instruction::I32Const(0));
    f.instruction(&Instruction::LocalGet(scratch4));
    f.instruction(&Instruction::I32Ne);
    f.instruction(&Instruction::If(BlockType::Result(ValType::I32)));
    f.instruction(&Instruction::LocalGet(scratch4));
    f.instruction(&Instruction::LocalSet(scratch2));
    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::I32Load(MemArg {
        offset: 4,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalGet(scratch3));
    f.instruction(&Instruction::I32Store(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::I32Const(HEADER_SIZE as i32));
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::Else);
    f.instruction(&Instruction::GlobalGet(0));
    f.instruction(&Instruction::LocalSet(scratch2));
    f.instruction(&Instruction::GlobalGet(0));
    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::GlobalSet(0));
    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::I32Store(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::I32Const(HEADER_SIZE as i32));
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::End);
}

/// Emit WASM to free a user pointer stored in `user_ptr_local`.
pub fn emit_free(
    f: &mut Function,
    user_ptr_local: u32,
    scratch: u32,
    scratch2: u32,
    scratch3: u32,
    scratch4: u32,
    heap_base_const: u32,
) {
    f.instruction(&Instruction::LocalGet(user_ptr_local));
    f.instruction(&Instruction::I32Const(HEADER_SIZE as i32));
    f.instruction(&Instruction::I32Sub);
    f.instruction(&Instruction::LocalSet(scratch));

    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::I32Load(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalSet(scratch2));

    f.instruction(&Instruction::LocalGet(scratch2));
    f.instruction(&Instruction::I32Const(4));
    f.instruction(&Instruction::I32ShrU);
    f.instruction(&Instruction::I32Const(1));
    f.instruction(&Instruction::I32Sub);
    f.instruction(&Instruction::LocalSet(scratch3));
    emit_max_local_const(f, scratch3, 0);
    f.instruction(&Instruction::LocalSet(scratch3));
    emit_min_local_const(f, scratch3, (NUM_CLASSES - 1) as i32);
    f.instruction(&Instruction::LocalSet(scratch3));

    f.instruction(&Instruction::I32Const(heap_base_const as i32));
    f.instruction(&Instruction::LocalGet(scratch3));
    f.instruction(&Instruction::I32Const(4));
    f.instruction(&Instruction::I32Mul);
    f.instruction(&Instruction::I32Add);
    f.instruction(&Instruction::LocalSet(scratch4));

    f.instruction(&Instruction::LocalGet(scratch4));
    f.instruction(&Instruction::I32Load(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::I32Store(MemArg {
        offset: 4,
        align: 2,
        memory_index: 0,
    }));
    f.instruction(&Instruction::LocalGet(scratch));
    f.instruction(&Instruction::LocalGet(scratch4));
    f.instruction(&Instruction::I32Store(MemArg {
        offset: 0,
        align: 2,
        memory_index: 0,
    }));
}
