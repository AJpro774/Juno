//! WASM code generation for Juni HIR.

mod allocator;
mod notice;

use std::cell::RefCell;
use std::collections::HashMap;

use allocator::{heap_base, heap_start};
use juni_check::hir::*;
use juni_check::types::{Builtin, Type};
pub use notice::{BUILT_WITH, REQUIRED_NOTICE};
use wasm_encoder::{
    BlockType, CodeSection, ConstExpr, CustomSection, EntityType, ExportKind, ExportSection,
    Function, FunctionSection, GlobalSection, GlobalType, ImportSection, Instruction, MemArg,
    MemorySection, MemoryType, Module, ProducersField, ProducersSection, TypeSection, ValType,
};

/// Builtin (`env`) import indices as referenced by codegen, before pruning:
/// 0 sqrt 1 stub 2-4 print 5-9 canvas 10-11 gpu
/// 12-17 sin..ceil 18-19 min/max 20 rand 21 now
/// 22 key_down 23 mouse_x 24 mouse_y 25 mouse_down
/// 26 scene3d_init 27 camera3d_perspective 28 mesh3d_box
/// 29 mesh3d_set_pose 30 mesh3d_rotate 31 scene3d_clear 32 scene3d_draw
/// 33 str_len 34 str_eq 35 clamp_f32 36 lerp_f32
/// 37 pow_f32 38 sign_f32 39 fmod_f32 40 smoothstep_f32
/// 41 deg_to_rad_f32 42 rad_to_deg_f32 43 dist2_f32 44 pi_f32
/// 45 abs_i32 46 min_i32 47 max_i32 48 clamp_i32
/// 49 len2_f32 50 dot2_f32 51 canvas_draw_line 52 canvas_stroke_rect
/// 53 asset_load_str 54 sprite_draw 55 mesh_load_obj
/// 56 scene3d_create_node 57 scene3d_set_parent 58 camera3d_look_at 59 camera3d_orbit
/// 60 mesh3d_custom 61 material3d_color 62 mesh3d_set_material
/// 63 aabb_overlap 64 aabb_resolve_x 65 audio_load 66 audio_play
/// 67 world_create 68 entity_create 69 entity_destroy 70 entity_set_tag
/// 71 entity_find_by_tag 72 transform2d_set 73 transform3d_set 74 sprite_set
/// 75 mesh3d_attach 76 world_step 77 scene_load 78 camera2d_set
/// 79 tilemap_load 80 tilemap_attach 81 world_draw 82 material3d_texture
/// 83 light3d_directional 84 light3d_point 85 mesh_load_gltf
/// 86 aabb_resolve_y 87 audio_play_loop 88 audio_set_volume
/// 89 gamepad_axis 90 gamepad_button
/// 91 collision_count 92 collision_entity_a 93 collision_entity_b
/// 94 rigidbody2d_set_vel 95 rigidbody2d_get_grounded 96 collider2d_set
/// 97 camera2d_follow 98 prefab_spawn 99 world_draw3d
/// 100 scene3d_set_ambient 101 scene3d_set_fog
/// 102 audio_stop 103 audio_set_bus_volume
/// 104 collision_is_trigger
/// 105 rigidbody3d_set_vel 106 rigidbody3d_get_grounded 107 collider3d_set
/// 108 transform3d_sync_from_2d
/// 109 anim_play 110 anim_stop
///
/// The emitted module only imports the builtins a program actually calls
/// (see [`ImportPlan`]); these numbers are the *logical* ids used inside
/// codegen and are remapped to dense WASM import indices.
const BUILTIN_IMPORT_COUNT: u32 = 111;

/// Emit a single-module program (backward compatible).
pub fn emit_wasm(hir: &HirModule) -> Vec<u8> {
    emit_wasm_inner(hir)
}

/// Emit a linked multi-module program as one WASM binary.
pub fn emit_wasm_program(program: &HirProgram) -> Vec<u8> {
    let merged = merge_program(program);
    emit_wasm_inner(&merged)
}

/// A compiled program plus the import contract a host must satisfy.
#[derive(Debug, Clone)]
pub struct EmittedModule {
    pub wasm: Vec<u8>,
    /// `env` builtins the module imports, in import order.
    pub builtins: Vec<&'static str>,
    /// `extern` host imports, in import order (right after `builtins`).
    pub externs: Vec<HirExtern>,
}

/// Emit a program and report exactly which imports it needs, so embedders
/// (native engines, the browser IDE) can link or stub precisely.
pub fn emit_program(program: &HirProgram) -> EmittedModule {
    let merged = merge_program(program);
    let plan = ImportPlan::for_module(&sorted_by_id(&merged));
    EmittedModule {
        wasm: emit_wasm_inner(&merged),
        builtins: plan.builtin_names,
        externs: plan.externs,
    }
}

fn sorted_by_id(hir: &HirModule) -> HirModule {
    let mut hir = hir.clone();
    hir.functions.sort_by_key(|f| f.id.0);
    hir
}

/// Names of the `env` builtins a module imports, in WASM import order.
/// Useful for hosts that want to provide exactly what a program needs.
pub fn builtin_imports_used(hir: &HirModule) -> Vec<&'static str> {
    let plan = ImportPlan::for_module(hir);
    plan.builtin_names
}

/// Host imports declared by `extern` blocks, in WASM import order
/// (deduplicated; `(module, name)` pairs follow the builtin imports).
pub fn extern_imports(hir: &HirModule) -> Vec<HirExtern> {
    ImportPlan::for_module(hir).externs
}

fn merge_program(program: &HirProgram) -> HirModule {
    let mut merged = HirModule::default();
    let mut all_inits = Vec::new();
    let mut total_static = 0u32;

    for module in &program.modules {
        merged.structs.extend(module.structs.clone());
        merged.statics.extend(module.statics.clone());
        all_inits.extend(module.init_globals.stmts.clone());
        merged.functions.extend(module.functions.clone());
        merged.externs.extend(module.externs.clone());
        total_static = total_static.max(module.static_region_offset + module.static_region_size);
    }

    merged.init_globals = HirBlock { stmts: all_inits };
    merged.static_region_size = align_up(total_static, 4);
    merged
}

/// WASM function index space layout for one emitted module:
/// `[used builtins][extern imports][defined functions]`.
///
/// Builtin ids inside codegen are the historical dense numbering
/// (`0..BUILTIN_IMPORT_COUNT`); `builtin_remap` turns them into the real
/// import index or `None` when the program never calls that builtin.
struct ImportPlan {
    builtin_remap: Vec<Option<u32>>,
    builtin_names: Vec<&'static str>,
    /// Deduplicated externs in import order.
    externs: Vec<HirExtern>,
    /// `(module, name, wasm signature)` -> import index.
    extern_index: HashMap<String, u32>,
    /// Index of the first defined (non-import) function.
    func_base: u32,
    /// Builtins referenced while emitting (filled during the dry run).
    used: RefCell<Vec<bool>>,
}

impl ImportPlan {
    /// Identity plan used for the dry run that discovers used builtins.
    fn discovery(hir: &HirModule) -> Self {
        let externs = dedupe_externs(&hir.externs);
        let extern_index = externs
            .iter()
            .enumerate()
            .map(|(i, x)| (extern_key(x), BUILTIN_IMPORT_COUNT + i as u32))
            .collect();
        Self {
            builtin_remap: (0..BUILTIN_IMPORT_COUNT).map(Some).collect(),
            builtin_names: Vec::new(),
            func_base: BUILTIN_IMPORT_COUNT + externs.len() as u32,
            externs,
            extern_index,
            used: RefCell::new(vec![false; BUILTIN_IMPORT_COUNT as usize]),
        }
    }

    /// Run codegen once to learn which builtins are called, then lay out the
    /// pruned import section.
    fn for_module(hir: &HirModule) -> Self {
        let discovery = Self::discovery(hir);
        for func in &hir.functions {
            let _ = emit_function(func, hir, &discovery);
        }
        let used = discovery.used.into_inner();

        let mut builtin_remap = vec![None; BUILTIN_IMPORT_COUNT as usize];
        let mut builtin_names = Vec::new();
        let mut next = 0u32;
        for (i, &is_used) in used.iter().enumerate() {
            if is_used {
                builtin_remap[i] = Some(next);
                builtin_names.push(BUILTIN_IMPORT_NAMES[i]);
                next += 1;
            }
        }
        let externs = discovery.externs;
        let extern_index = externs
            .iter()
            .enumerate()
            .map(|(i, x)| (extern_key(x), next + i as u32))
            .collect();
        Self {
            builtin_remap,
            builtin_names,
            func_base: next + externs.len() as u32,
            externs,
            extern_index,
            used: RefCell::new(used),
        }
    }

    fn builtin(&self, logical: u32) -> u32 {
        self.used.borrow_mut()[logical as usize] = true;
        self.builtin_remap[logical as usize]
            .expect("builtin import referenced but not laid out; discovery pass missed it")
    }

    fn extern_call(&self, module: &str, name: &str, params: &[ValType], ret: Option<ValType>) -> u32 {
        let key = extern_key_parts(module, name, params, ret);
        *self.extern_index.get(&key).unwrap_or_else(|| {
            panic!("extern `{module}.{name}` called with a signature that was never declared")
        })
    }
}

/// Builtin import names indexed by logical id (same order as the type table).
const BUILTIN_IMPORT_NAMES: [&str; BUILTIN_IMPORT_COUNT as usize] = [
    "sqrt_f32", "webgpu_stub", "print_str", "print_i32", "print_f32",
    "canvas_init", "canvas_clear", "canvas_fill_rect", "canvas_fill_circle", "canvas_fill_text",
    "gpu_clear", "gpu_draw_triangle",
    "sin_f32", "cos_f32", "tan_f32", "abs_f32", "floor_f32", "ceil_f32", "min_f32", "max_f32",
    "rand_f32", "now_f32", "key_down", "mouse_x", "mouse_y", "mouse_down",
    "scene3d_init", "camera3d_perspective", "mesh3d_box", "mesh3d_set_pose", "mesh3d_rotate",
    "scene3d_clear", "scene3d_draw",
    "str_len", "str_eq", "clamp_f32", "lerp_f32", "pow_f32", "sign_f32", "fmod_f32",
    "smoothstep_f32", "deg_to_rad_f32", "rad_to_deg_f32", "dist2_f32", "pi_f32",
    "abs_i32", "min_i32", "max_i32", "clamp_i32", "len2_f32", "dot2_f32",
    "canvas_draw_line", "canvas_stroke_rect", "asset_load_str", "sprite_draw", "mesh_load_obj",
    "scene3d_create_node", "scene3d_set_parent", "camera3d_look_at", "camera3d_orbit",
    "mesh3d_custom", "material3d_color", "mesh3d_set_material",
    "aabb_overlap", "aabb_resolve_x", "audio_load", "audio_play",
    "world_create", "entity_create", "entity_destroy", "entity_set_tag", "entity_find_by_tag",
    "transform2d_set", "transform3d_set", "sprite_set", "mesh3d_attach", "world_step",
    "scene_load", "camera2d_set", "tilemap_load", "tilemap_attach", "world_draw",
    "material3d_texture", "light3d_directional", "light3d_point", "mesh_load_gltf",
    "aabb_resolve_y", "audio_play_loop", "audio_set_volume", "gamepad_axis", "gamepad_button",
    "collision_count", "collision_entity_a", "collision_entity_b",
    "rigidbody2d_set_vel", "rigidbody2d_get_grounded", "collider2d_set", "camera2d_follow",
    "prefab_spawn", "world_draw3d", "scene3d_set_ambient", "scene3d_set_fog",
    "audio_stop", "audio_set_bus_volume", "collision_is_trigger",
    "rigidbody3d_set_vel", "rigidbody3d_get_grounded", "collider3d_set",
    "transform3d_sync_from_2d", "anim_play", "anim_stop",
];

fn extern_key(x: &HirExtern) -> String {
    let params: Vec<ValType> = x.params.iter().map(val_type).collect();
    let ret = if matches!(x.ret, Type::Builtin(Builtin::Void)) {
        None
    } else {
        Some(val_type(&x.ret))
    };
    extern_key_parts(&x.module, &x.name, &params, ret)
}

fn extern_key_parts(module: &str, name: &str, params: &[ValType], ret: Option<ValType>) -> String {
    format!("{module}\0{name}\0{params:?}\0{ret:?}")
}

/// Keep one import per distinct `(module, name, signature)`; declaration
/// order is preserved so hosts see a stable layout.
fn dedupe_externs(externs: &[HirExtern]) -> Vec<HirExtern> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for x in externs {
        if seen.insert(extern_key(x)) {
            out.push(x.clone());
        }
    }
    out
}

fn emit_wasm_inner(hir: &HirModule) -> Vec<u8> {
    // Function indices assume `hir.functions[i].id == FuncId(i)`; generic
    // instantiations can be pushed out of order, so sort by id first.
    let hir = &sorted_by_id(hir);
    let plan = ImportPlan::for_module(hir);

    let mut module = Module::new();
    let mut types = TypeSection::new();

    let mut add_fn = |params: &[ValType], results: &[ValType]| -> u32 {
        let idx = types.len();
        types.ty().function(params.iter().copied(), results.iter().copied());
        idx
    };

    let t_f32_f32 = add_fn(&[ValType::F32], &[ValType::F32]);
    let t_2f_f32 = add_fn(&[ValType::F32, ValType::F32], &[ValType::F32]);
    let t_void_f32 = add_fn(&[], &[ValType::F32]);
    let t_i32_void = add_fn(&[ValType::I32], &[]);
    let t_i32_i32 = add_fn(&[ValType::I32], &[ValType::I32]);
    let t_f32_void = add_fn(&[ValType::F32], &[]);
    let t_void = add_fn(&[], &[]);
    let t_2i = add_fn(&[ValType::I32, ValType::I32], &[]);
    let t_4f = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[],
    );
    let t_4f_i32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[ValType::I32],
    );
    let t_3f_i32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32],
        &[ValType::I32],
    );
    let t_i_6f = add_fn(
        &[
            ValType::I32,
            ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_i_3f = add_fn(
        &[ValType::I32, ValType::F32, ValType::F32, ValType::F32],
        &[],
    );
    let t_2i_void = add_fn(&[ValType::I32, ValType::I32], &[]);
    let t_8f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_7f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_text = add_fn(
        &[
            ValType::I32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );

    let t_3f_f32 = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32],
        &[ValType::F32],
    );
    let t_2i_i32 = add_fn(&[ValType::I32, ValType::I32], &[ValType::I32]);
    let t_2i_f32 = add_fn(
        &[ValType::I32, ValType::I32, ValType::F32],
        &[ValType::F32],
    );
    let t_3i_i32 = add_fn(
        &[ValType::I32, ValType::I32, ValType::I32],
        &[ValType::I32],
    );
    let t_4i_i32 = add_fn(
        &[ValType::I32, ValType::I32, ValType::I32, ValType::I32],
        &[ValType::I32],
    );
    let t_void_i32 = add_fn(&[], &[ValType::I32]);
    let t_4f_f32_ret = add_fn(
        &[ValType::F32, ValType::F32, ValType::F32, ValType::F32],
        &[ValType::F32],
    );
    let t_9f = add_fn(
        &[
            ValType::F32, ValType::F32, ValType::F32, ValType::F32, ValType::F32,
            ValType::F32, ValType::F32, ValType::F32, ValType::F32,
        ],
        &[],
    );
    let t_i_4f = add_fn(
        &[
            ValType::I32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
        ],
        &[],
    );
    let t_i_5f = add_fn(
        &[
            ValType::I32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
        ],
        &[],
    );
    let t_i_9f = add_fn(
        &[
            ValType::I32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
        ],
        &[],
    );
    let t_2i_2f = add_fn(
        &[ValType::I32, ValType::I32, ValType::F32, ValType::F32],
        &[],
    );
    let t_6f_i32 = add_fn(
        &[
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
        ],
        &[ValType::I32],
    );
    let t_7f_i32 = add_fn(
        &[
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
        ],
        &[ValType::I32],
    );
    let t_i_f_void = add_fn(&[ValType::I32, ValType::F32], &[]);
    let t_2i_f32_ret = add_fn(&[ValType::I32, ValType::I32], &[ValType::F32]);
    let t_i_2f_void = add_fn(&[ValType::I32, ValType::F32, ValType::F32], &[]);
    let t_2i_f_void = add_fn(&[ValType::I32, ValType::I32, ValType::F32], &[]);
    let t_i_str_2f_i32 = add_fn(
        &[ValType::I32, ValType::F32, ValType::F32],
        &[ValType::I32],
    );
    let t_collider_set = add_fn(
        &[
            ValType::I32,
            ValType::I32,
            ValType::F32,
            ValType::F32,
            ValType::F32,
            ValType::I32,
        ],
        &[],
    );
    let t_i_3f_void = add_fn(
        &[ValType::I32, ValType::F32, ValType::F32, ValType::F32],
        &[],
    );
    let t_3f_void = add_fn(&[ValType::F32, ValType::F32, ValType::F32], &[]);

    let mut func_type_indices = Vec::new();
    for func in &hir.functions {
        let params: Vec<ValType> = func.params.iter().map(|(_, t)| val_type(t)).collect();
        let results: Vec<ValType> = if matches!(func.ret, Type::Builtin(Builtin::Void)) {
            vec![]
        } else {
            vec![val_type(&func.ret)]
        };
        func_type_indices.push(add_fn(&params, &results));
    }

    // One function type per extern import (duplicate type entries are legal WASM).
    let mut extern_type_indices = Vec::with_capacity(plan.externs.len());
    for x in &plan.externs {
        let params: Vec<ValType> = x.params.iter().map(val_type).collect();
        let results: Vec<ValType> = if matches!(x.ret, Type::Builtin(Builtin::Void)) {
            vec![]
        } else {
            vec![val_type(&x.ret)]
        };
        extern_type_indices.push(add_fn(&params, &results));
    }
    module.section(&types);

    let builtin_imports: [(&str, u32); BUILTIN_IMPORT_COUNT as usize] = [
        ("sqrt_f32", t_f32_f32),
        ("webgpu_stub", t_i32_void),
        ("print_str", t_i32_void),
        ("print_i32", t_i32_void),
        ("print_f32", t_f32_void),
        ("canvas_init", t_2i),
        ("canvas_clear", t_4f),
        ("canvas_fill_rect", t_8f),
        ("canvas_fill_circle", t_7f),
        ("canvas_fill_text", t_text),
        ("gpu_clear", t_4f),
        ("gpu_draw_triangle", t_void),
        ("sin_f32", t_f32_f32),
        ("cos_f32", t_f32_f32),
        ("tan_f32", t_f32_f32),
        ("abs_f32", t_f32_f32),
        ("floor_f32", t_f32_f32),
        ("ceil_f32", t_f32_f32),
        ("min_f32", t_2f_f32),
        ("max_f32", t_2f_f32),
        ("rand_f32", t_void_f32),
        ("now_f32", t_void_f32),
        ("key_down", t_i32_i32),
        ("mouse_x", t_void_f32),
        ("mouse_y", t_void_f32),
        ("mouse_down", t_i32_i32),
        ("scene3d_init", t_2i),
        ("camera3d_perspective", t_4f_i32),
        ("mesh3d_box", t_3f_i32),
        ("mesh3d_set_pose", t_i_6f),
        ("mesh3d_rotate", t_i_3f),
        ("scene3d_clear", t_4f),
        ("scene3d_draw", t_2i_void),
        ("str_len", t_i32_i32),
        ("str_eq", t_2i_i32),
        ("clamp_f32", t_3f_f32),
        ("lerp_f32", t_3f_f32),
        ("pow_f32", t_2f_f32),
        ("sign_f32", t_f32_f32),
        ("fmod_f32", t_2f_f32),
        ("smoothstep_f32", t_3f_f32),
        ("deg_to_rad_f32", t_f32_f32),
        ("rad_to_deg_f32", t_f32_f32),
        ("dist2_f32", t_4f_f32_ret),
        ("pi_f32", t_void_f32),
        ("abs_i32", t_i32_i32),
        ("min_i32", t_2i_i32),
        ("max_i32", t_2i_i32),
        ("clamp_i32", t_3i_i32),
        ("len2_f32", t_2f_f32),
        ("dot2_f32", t_4f_f32_ret),
        ("canvas_draw_line", t_9f),
        ("canvas_stroke_rect", t_9f),
        ("asset_load_str", t_i32_i32),
        ("sprite_draw", t_i_4f),
        ("mesh_load_obj", t_i32_i32),
        ("scene3d_create_node", t_void_i32),
        ("scene3d_set_parent", t_2i_void),
        ("camera3d_look_at", t_i_6f),
        ("camera3d_orbit", t_i_6f),
        ("mesh3d_custom", t_4i_i32),
        ("material3d_color", t_4f_i32),
        ("mesh3d_set_material", t_2i_void),
        ("aabb_overlap", t_2i_i32),
        ("aabb_resolve_x", t_2i_f32),
        ("audio_load", t_i32_i32),
        ("audio_play", t_i32_void),
        ("world_create", t_void_i32),
        ("entity_create", t_void_i32),
        ("entity_destroy", t_i32_void),
        ("entity_set_tag", t_2i_void),
        ("entity_find_by_tag", t_i32_i32),
        ("transform2d_set", t_i_5f),
        ("transform3d_set", t_i_9f),
        ("sprite_set", t_2i_2f),
        ("mesh3d_attach", t_2i_void),
        ("world_step", t_f32_void),
        ("scene_load", t_i32_i32),
        ("camera2d_set", t_i_3f),
        ("tilemap_load", t_i32_i32),
        ("tilemap_attach", t_2i_void),
        ("world_draw", t_i32_void),
        ("material3d_texture", t_i32_i32),
        ("light3d_directional", t_6f_i32),
        ("light3d_point", t_7f_i32),
        ("mesh_load_gltf", t_i32_i32),
        ("aabb_resolve_y", t_2i_f32),
        ("audio_play_loop", t_i32_void),
        ("audio_set_volume", t_i_f_void),
        ("gamepad_axis", t_2i_f32_ret),
        ("gamepad_button", t_2i_i32),
        ("collision_count", t_void_i32),
        ("collision_entity_a", t_i32_i32),
        ("collision_entity_b", t_i32_i32),
        ("rigidbody2d_set_vel", t_i_2f_void),
        ("rigidbody2d_get_grounded", t_i32_i32),
        ("collider2d_set", t_collider_set),
        ("camera2d_follow", t_2i_f_void),
        ("prefab_spawn", t_i_str_2f_i32),
        ("world_draw3d", t_i32_void),
        ("scene3d_set_ambient", t_3f_void),
        ("scene3d_set_fog", t_f32_void),
        ("audio_stop", t_i32_void),
        ("audio_set_bus_volume", t_f32_void),
        ("collision_is_trigger", t_i32_i32),
        ("rigidbody3d_set_vel", t_i_3f_void),
        ("rigidbody3d_get_grounded", t_i32_i32),
        ("collider3d_set", t_collider_set),
        ("transform3d_sync_from_2d", t_i32_void),
        ("anim_play", t_2i_i32),
        ("anim_stop", t_i32_void),
    ];
    debug_assert!(builtin_imports
        .iter()
        .zip(BUILTIN_IMPORT_NAMES.iter())
        .all(|((a, _), b)| a == b));

    let mut imports = ImportSection::new();
    for (i, (name, ty)) in builtin_imports.iter().enumerate() {
        if plan.builtin_remap[i].is_some() {
            imports.import("env", name, EntityType::Function(*ty));
        }
    }
    for (x, &ty) in plan.externs.iter().zip(extern_type_indices.iter()) {
        imports.import(&x.module, &x.name, EntityType::Function(ty));
    }
    module.section(&imports);

    let mut functions = FunctionSection::new();
    for &ty_idx in &func_type_indices {
        functions.function(ty_idx);
    }
    module.section(&functions);

    let mut memories = MemorySection::new();
    memories.memory(MemoryType {
        minimum: 2,
        maximum: None,
        memory64: false,
        shared: false,
        page_size_log2: None,
    });
    module.section(&memories);

    let mut globals = GlobalSection::new();
    // Global 0: heap top pointer (after segregated freelist metadata)
    let _hbase = heap_base(hir.static_region_size);
    let hstart = heap_start(hir.static_region_size);
    globals.global(
        GlobalType {
            val_type: ValType::I32,
            mutable: true,
            shared: false,
        },
        &ConstExpr::i32_const(hstart as i32),
    );
    module.section(&globals);

    let mut exports = ExportSection::new();
    exports.export("memory", ExportKind::Memory, 0);
    for (i, func) in hir.functions.iter().enumerate() {
        if func.export || func.name == "main" {
            exports.export(&func.name, ExportKind::Func, plan.func_base + i as u32);
        }
    }
    module.section(&exports);

    let mut codes = CodeSection::new();
    for func in &hir.functions {
        codes.function(&emit_function(func, hir, &plan));
    }
    module.section(&codes);

    // Permanent provenance: producers convention + custom notice section.
    let mut processed_by = ProducersField::new();
    processed_by.value("juni", env!("CARGO_PKG_VERSION"));
    let mut producers = ProducersSection::new();
    producers.field("processed-by", &processed_by);
    let mut language = ProducersField::new();
    language.value("Juni", env!("CARGO_PKG_VERSION"));
    producers.field("language", &language);
    module.section(&producers);

    let notice = notice::notice_section_bytes();
    module.section(&CustomSection {
        name: "juni.notice".into(),
        data: notice.into(),
    });

    module.finish()
}

fn val_type(ty: &Type) -> ValType {
    match ty {
        Type::Builtin(Builtin::I32)
        | Type::Builtin(Builtin::Bool)
        | Type::Builtin(Builtin::Str) => ValType::I32,
        Type::Builtin(Builtin::I64) => ValType::I64,
        Type::Builtin(Builtin::F32) => ValType::F32,
        Type::Builtin(Builtin::F64) => ValType::F64,
        Type::Builtin(Builtin::Void) => ValType::I32,
        Type::Struct(_) | Type::Ref { .. } | Type::Array { .. } | Type::TypeParam(_) => ValType::I32,
    }
}

fn is_void_expr(expr: &HirExpr) -> bool {
    if let HirExpr::Call { ty, .. } | HirExpr::ExternCall { ty, .. } = expr {
        return matches!(ty, Type::Builtin(Builtin::Void));
    }
    matches!(
        expr,
        HirExpr::PrintStr(_)
            | HirExpr::PrintI32(_)
            | HirExpr::PrintF32(_)
            | HirExpr::CanvasInit { .. }
            | HirExpr::CanvasClear { .. }
            | HirExpr::CanvasFillRect { .. }
            | HirExpr::CanvasFillCircle { .. }
            | HirExpr::CanvasFillText { .. }
            | HirExpr::CanvasDrawLine { .. }
            | HirExpr::CanvasStrokeRect { .. }
            | HirExpr::GpuClear { .. }
            | HirExpr::GpuDrawTriangle
            | HirExpr::Mesh3dSetPose { .. }
            | HirExpr::Mesh3dRotate { .. }
            | HirExpr::Scene3dInit { .. }
            | HirExpr::Scene3dClear { .. }
            | HirExpr::Scene3dDraw { .. }
            | HirExpr::Scene3dSetParent { .. }
            | HirExpr::Camera3dLookAt { .. }
            | HirExpr::Camera3dOrbit { .. }
            | HirExpr::Mesh3dSetMaterial { .. }
            | HirExpr::SpriteDraw { .. }
            | HirExpr::AudioPlay(_)
            | HirExpr::EntityDestroy(_)
            | HirExpr::EntitySetTag { .. }
            | HirExpr::Transform2dSet { .. }
            | HirExpr::Transform3dSet { .. }
            | HirExpr::SpriteSet { .. }
            | HirExpr::Mesh3dAttach { .. }
            | HirExpr::WorldStep(_)
            | HirExpr::Camera2dSet { .. }
            | HirExpr::TilemapAttach { .. }
            | HirExpr::WorldDraw(_)
            | HirExpr::AudioPlayLoop(_)
            | HirExpr::AudioSetVolume { .. }
            | HirExpr::AudioStop(_)
            | HirExpr::AudioSetBusVolume(_)
            | HirExpr::Rigidbody2dSetVel { .. }
            | HirExpr::Collider2dSet { .. }
            | HirExpr::Rigidbody3dSetVel { .. }
            | HirExpr::Collider3dSet { .. }
            | HirExpr::Transform3dSyncFrom2d(_)
            | HirExpr::Camera2dFollow { .. }
            | HirExpr::WorldDraw3d(_)
            | HirExpr::Scene3dSetAmbient { .. }
            | HirExpr::Scene3dSetFog(_)
            | HirExpr::AnimStop(_)
    )
}

fn as_f32_expr(f: &mut Function, expr: &HirExpr, ctx: &mut EmitCtx<'_>) {
    match expr {
        HirExpr::Int(v) => {
            f.instruction(&Instruction::F32Const((*v as f32).into()));
        }
        _ => {
            ctx.emit_expr(f, expr);
            if matches!(expr_ty(expr), Type::Builtin(Builtin::I32)) {
                f.instruction(&Instruction::F32ConvertI32S);
            }
        }
    }
}

fn align_up(value: u32, align: u32) -> u32 {
    if align == 0 {
        return value;
    }
    (value + align - 1) / align * align
}

fn emit_function(func: &HirFunction, hir: &HirModule, plan: &ImportPlan) -> Function {
    let param_count = func.params.len() as u32;
    let mut local_decls: Vec<(u32, ValType)> = Vec::new();
    for ty in func.locals.iter().skip(param_count as usize) {
        local_decls.push((1, val_type(ty)));
    }
    let scratch = func.locals.len() as u32;
    local_decls.push((1, ValType::I32));
    let scratch2 = scratch + 1;
    local_decls.push((1, ValType::I32));
    let scratch3 = scratch + 2;
    local_decls.push((1, ValType::I32));
    let scratch4 = scratch + 3;
    local_decls.push((1, ValType::I32));
    let scratch5 = scratch + 4;
    local_decls.push((1, ValType::I32));

    let hbase = heap_base(hir.static_region_size);
    let local_map: Vec<u32> = (0..func.locals.len() as u32).collect();
    let mut f = Function::new(local_decls);
    let mut ctx = EmitCtx {
        local_map: &local_map,
        statics: &hir.statics,
        plan,
        heap_base: hbase,
        scratch,
        scratch2,
        scratch3,
        scratch4,
        scratch5,
    };
    if func.name == "main" && !hir.init_globals.stmts.is_empty() {
        ctx.emit_block(&mut f, &hir.init_globals);
    }
    ctx.emit_block(&mut f, &func.body);
    f.instruction(&Instruction::End);
    f
}

struct EmitCtx<'a> {
    local_map: &'a [u32],
    statics: &'a [HirStatic],
    plan: &'a ImportPlan,
    heap_base: u32,
    scratch: u32,
    scratch2: u32,
    scratch3: u32,
    scratch4: u32,
    scratch5: u32,
}

impl<'a> EmitCtx<'a> {
    fn local(&self, id: LocalId) -> u32 {
        self.local_map[id.0 as usize]
    }

    /// Call a builtin `env` import by its logical id (see the table at the top).
    fn call_builtin(&self, f: &mut Function, logical: u32) {
        f.instruction(&Instruction::Call(self.plan.builtin(logical)));
    }

    /// Call a Juni-defined function by `FuncId`.
    fn call_user(&self, f: &mut Function, func: u32) {
        f.instruction(&Instruction::Call(self.plan.func_base + func));
    }

    fn static_info(&self, id: StaticId) -> &HirStatic {
        &self.statics[id.0 as usize]
    }

    fn emit_static_addr(&self, f: &mut Function, offset: u32) {
        f.instruction(&Instruction::I32Const(offset as i32));
    }

    /// Runtime bounds check for `T[N]` indexing. Index must already be in `index_local`.
    /// On failure emits `unreachable` (WASM trap).
    fn emit_array_bounds_check(&self, f: &mut Function, index_local: u32, len: u32) {
        // index < 0
        f.instruction(&Instruction::LocalGet(index_local));
        f.instruction(&Instruction::I32Const(0));
        f.instruction(&Instruction::I32LtS);
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);
        // index >= len (unsigned after non-negative check)
        f.instruction(&Instruction::LocalGet(index_local));
        f.instruction(&Instruction::I32Const(len as i32));
        f.instruction(&Instruction::I32GeU);
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);
    }

    fn emit_heap_alloc_local(&mut self, f: &mut Function, user_size_local: u32) {
        allocator::emit_alloc(
            f,
            user_size_local,
            self.scratch,
            self.scratch2,
            self.scratch3,
            self.scratch4,
            self.heap_base,
        );
    }

    fn emit_heap_free_local(&mut self, f: &mut Function, user_ptr_local: u32) {
        allocator::emit_free(
            f,
            user_ptr_local,
            self.scratch,
            self.scratch2,
            self.scratch3,
            self.scratch4,
            self.heap_base,
        );
    }

    fn emit_str_concat(&mut self, f: &mut Function, left: &HirExpr, right: &HirExpr) {
        // scratch2 = left ptr, scratch3 = right ptr, scratch = result ptr
        self.emit_expr(f, left);
        f.instruction(&Instruction::LocalSet(self.scratch2));
        self.emit_expr(f, right);
        f.instruction(&Instruction::LocalSet(self.scratch3));
        // total_len = len(left) + len(right)
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalTee(self.scratch5));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalSet(self.scratch5));
        self.emit_heap_alloc_local(f, self.scratch5);
        f.instruction(&Instruction::LocalTee(self.scratch));
        // store total_len header
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Store(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        // copy left bytes
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        // copy right bytes after left
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        f.instruction(&Instruction::LocalGet(self.scratch));
    }

    fn emit_str_substr(
        &mut self,
        f: &mut Function,
        src: &HirExpr,
        start: &HirExpr,
        len: &HirExpr,
    ) {
        // scratch2=src, scratch3=start, scratch=sublen, scratch4=result, scratch5=temps
        self.emit_expr(f, src);
        f.instruction(&Instruction::LocalSet(self.scratch2));
        self.emit_expr(f, start);
        f.instruction(&Instruction::LocalSet(self.scratch3));
        self.emit_expr(f, len);
        f.instruction(&Instruction::LocalSet(self.scratch));

        // Bounds: start >= 0, len >= 0, start + len <= src_len (no overflow).
        // Load source byte length from string header.
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Load(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalSet(self.scratch4)); // src_len

        // start < 0
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Const(0));
        f.instruction(&Instruction::I32LtS);
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);

        // len < 0
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(0));
        f.instruction(&Instruction::I32LtS);
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);

        // sum = start + len; trap on unsigned overflow or sum > src_len
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalTee(self.scratch5)); // sum
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32LtU); // overflow if sum < start
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);
        f.instruction(&Instruction::LocalGet(self.scratch5));
        f.instruction(&Instruction::LocalGet(self.scratch4));
        f.instruction(&Instruction::I32GtU); // sum > src_len
        f.instruction(&Instruction::If(BlockType::Empty));
        f.instruction(&Instruction::Unreachable);
        f.instruction(&Instruction::End);

        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalSet(self.scratch5));
        self.emit_heap_alloc_local(f, self.scratch5);
        f.instruction(&Instruction::LocalTee(self.scratch4));
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::I32Store(MemArg {
            offset: 0,
            align: 2,
            memory_index: 0,
        }));
        f.instruction(&Instruction::LocalGet(self.scratch4));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch2));
        f.instruction(&Instruction::I32Const(4));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch3));
        f.instruction(&Instruction::I32Add);
        f.instruction(&Instruction::LocalGet(self.scratch));
        f.instruction(&Instruction::MemoryCopy {
            dst_mem: 0,
            src_mem: 0,
        });
        f.instruction(&Instruction::LocalGet(self.scratch4));
    }

    fn emit_block(&mut self, f: &mut Function, block: &HirBlock) {
        for stmt in &block.stmts {
            self.emit_stmt(f, stmt);
        }
    }

    fn emit_stmt(&mut self, f: &mut Function, stmt: &HirStmt) {
        match stmt {
            HirStmt::Let { local, init, .. } | HirStmt::AssignLocal { local, value: init, .. } => {
                self.emit_expr(f, init);
                f.instruction(&Instruction::LocalSet(self.local(*local)));
            }
            HirStmt::AssignStatic { stat, ty, value, .. } => {
                self.emit_static_addr(f, self.static_info(*stat).offset);
                self.emit_expr(f, value);
                self.emit_store(f, ty);
            }
            HirStmt::AssignField {
                base,
                offset,
                field_ty,
                value,
                ..
            } => {
                self.emit_expr(f, base);
                if *offset != 0 {
                    f.instruction(&Instruction::I32Const(*offset as i32));
                    f.instruction(&Instruction::I32Add);
                }
                self.emit_expr(f, value);
                self.emit_store(f, field_ty);
            }
            HirStmt::AssignIndex {
                base,
                index,
                elem_ty,
                elem_size,
                len,
                value,
            } => {
                self.emit_expr(f, index);
                f.instruction(&Instruction::LocalSet(self.scratch));
                self.emit_array_bounds_check(f, self.scratch, *len);
                self.emit_expr(f, base);
                f.instruction(&Instruction::LocalGet(self.scratch));
                f.instruction(&Instruction::I32Const(*elem_size as i32));
                f.instruction(&Instruction::I32Mul);
                f.instruction(&Instruction::I32Add);
                self.emit_expr(f, value);
                self.emit_store(f, elem_ty);
            }
            HirStmt::If {
                cond,
                then_block,
                else_block,
            } => {
                self.emit_expr(f, cond);
                f.instruction(&Instruction::If(BlockType::Empty));
                self.emit_block(f, then_block);
                if let Some(eb) = else_block {
                    f.instruction(&Instruction::Else);
                    self.emit_block(f, eb);
                }
                f.instruction(&Instruction::End);
            }
            HirStmt::While { cond, body } => {
                f.instruction(&Instruction::Block(BlockType::Empty));
                f.instruction(&Instruction::Loop(BlockType::Empty));
                self.emit_expr(f, cond);
                f.instruction(&Instruction::I32Eqz);
                f.instruction(&Instruction::BrIf(1));
                self.emit_block(f, body);
                f.instruction(&Instruction::Br(0));
                f.instruction(&Instruction::End);
                f.instruction(&Instruction::End);
            }
            HirStmt::Break => {
                f.instruction(&Instruction::Br(1));
            }
            HirStmt::Continue => {
                f.instruction(&Instruction::Br(0));
            }
            HirStmt::Block(b) => self.emit_block(f, b),
            HirStmt::Return(val) => {
                if let Some(v) = val {
                    self.emit_expr(f, v);
                }
                f.instruction(&Instruction::Return);
            }
            HirStmt::Delete(ptr) => {
                self.emit_expr(f, ptr);
                f.instruction(&Instruction::LocalSet(self.scratch5));
                self.emit_heap_free_local(f, self.scratch5);
            }
            HirStmt::Expr(e) => {
                self.emit_expr(f, e);
                if !is_void_expr(e) {
                    f.instruction(&Instruction::Drop);
                }
            }
        }
    }

    fn emit_expr(&mut self, f: &mut Function, expr: &HirExpr) {
        match expr {
            HirExpr::Int(v) => {
                f.instruction(&Instruction::I32Const(*v));
            }
            HirExpr::Float(v) => {
                f.instruction(&Instruction::F32Const((*v).into()));
            }
            HirExpr::Bool(v) => {
                f.instruction(&Instruction::I32Const(if *v { 1 } else { 0 }));
            }
            HirExpr::Local(id, _) => {
                f.instruction(&Instruction::LocalGet(self.local(*id)));
            }
            HirExpr::Static(id, ty) => {
                self.emit_static_addr(f, self.static_info(*id).offset);
                self.emit_load(f, ty);
            }
            HirExpr::Unary { op, expr, ty } => {
                self.emit_expr(f, expr);
                match op {
                    HirUnaryOp::Neg => {
                        if matches!(ty, Type::Builtin(Builtin::F32)) {
                            f.instruction(&Instruction::F32Neg);
                        } else {
                            f.instruction(&Instruction::I32Const(-1));
                            f.instruction(&Instruction::I32Mul);
                        }
                    }
                    HirUnaryOp::Not => {
                        f.instruction(&Instruction::I32Eqz);
                    }
                }
            }
            HirExpr::Binary {
                op,
                left,
                right,
                ty,
            } => {
                if matches!(op, HirBinaryOp::And | HirBinaryOp::Or) {
                    self.emit_expr(f, left);
                    f.instruction(&Instruction::If(BlockType::Result(ValType::I32)));
                    if *op == HirBinaryOp::And {
                        self.emit_expr(f, right);
                    } else {
                        f.instruction(&Instruction::I32Const(1));
                    }
                    f.instruction(&Instruction::Else);
                    if *op == HirBinaryOp::Or {
                        self.emit_expr(f, right);
                    } else {
                        f.instruction(&Instruction::I32Const(0));
                    }
                    f.instruction(&Instruction::End);
                } else {
                    self.emit_expr(f, left);
                    self.emit_expr(f, right);
                    let operand_ty = expr_ty(left);
                    self.emit_binop(f, *op, ty, &operand_ty);
                }
            }
            HirExpr::Call { func, args, .. } => {
                for a in args {
                    self.emit_expr(f, a);
                }
                self.call_user(f, func.0);
            }
            HirExpr::ExternCall {
                module,
                name,
                args,
                ty,
            } => {
                let mut params = Vec::with_capacity(args.len());
                for a in args {
                    self.emit_expr(f, a);
                    params.push(val_type(&expr_ty(a)));
                }
                let ret = if matches!(ty, Type::Builtin(Builtin::Void)) {
                    None
                } else {
                    Some(val_type(ty))
                };
                f.instruction(&Instruction::Call(
                    self.plan.extern_call(module, name, &params, ret),
                ));
            }
            HirExpr::Field {
                base,
                offset,
                ty,
                ..
            } => {
                self.emit_expr(f, base);
                if *offset != 0 {
                    f.instruction(&Instruction::I32Const(*offset as i32));
                    f.instruction(&Instruction::I32Add);
                }
                self.emit_load(f, ty);
            }
            HirExpr::Index {
                base,
                index,
                elem_ty,
                elem_size,
                len,
            } => {
                self.emit_expr(f, index);
                f.instruction(&Instruction::LocalSet(self.scratch));
                self.emit_array_bounds_check(f, self.scratch, *len);
                self.emit_expr(f, base);
                f.instruction(&Instruction::LocalGet(self.scratch));
                f.instruction(&Instruction::I32Const(*elem_size as i32));
                f.instruction(&Instruction::I32Mul);
                f.instruction(&Instruction::I32Add);
                self.emit_load(f, elem_ty);
            }
            HirExpr::ArrayLit {
                elem_ty,
                elem_size,
                elems,
            } => {
                let total = *elem_size * elems.len() as u32;
                f.instruction(&Instruction::I32Const(total as i32));
                f.instruction(&Instruction::LocalSet(self.scratch5));
                self.emit_heap_alloc_local(f, self.scratch5);
                f.instruction(&Instruction::LocalTee(self.scratch));
                for (i, e) in elems.iter().enumerate() {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    f.instruction(&Instruction::I32Const((*elem_size * i as u32) as i32));
                    f.instruction(&Instruction::I32Add);
                    self.emit_expr(f, e);
                    self.emit_store(f, elem_ty);
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::StructLit { size, fields } | HirExpr::New { size, fields } => {
                let alloc_size = *size;
                f.instruction(&Instruction::I32Const(alloc_size as i32));
                f.instruction(&Instruction::LocalSet(self.scratch5));
                self.emit_heap_alloc_local(f, self.scratch5);
                f.instruction(&Instruction::LocalTee(self.scratch));
                for (off, fty, val) in fields {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    if *off != 0 {
                        f.instruction(&Instruction::I32Const(*off as i32));
                        f.instruction(&Instruction::I32Add);
                    }
                    self.emit_expr(f, val);
                    self.emit_store(f, fty);
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::MathUnary { op, arg } => {
                as_f32_expr(f, arg, self);
                let idx = match op {
                    MathUnaryOp::Sqrt => 0,
                    MathUnaryOp::Sin => 12,
                    MathUnaryOp::Cos => 13,
                    MathUnaryOp::Tan => 14,
                    MathUnaryOp::Abs => 15,
                    MathUnaryOp::Floor => 16,
                    MathUnaryOp::Ceil => 17,
                };
                self.call_builtin(f, idx);
            }
            HirExpr::MathBinary { op, left, right } => {
                as_f32_expr(f, left, self);
                as_f32_expr(f, right, self);
                let idx = match op {
                    MathBinaryOp::Min => 18,
                    MathBinaryOp::Max => 19,
                };
                self.call_builtin(f, idx);
            }
            HirExpr::Rand => {
                self.call_builtin(f, 20);
            }
            HirExpr::Now => {
                self.call_builtin(f, 21);
            }
            HirExpr::AsI32(inner) => {
                as_f32_expr(f, inner, self);
                f.instruction(&Instruction::I32TruncF32S);
            }
            HirExpr::AsF32(inner) => {
                self.emit_expr(f, inner);
                f.instruction(&Instruction::F32ConvertI32S);
            }
            HirExpr::StrLen(inner) => {
                self.emit_expr(f, inner);
                self.call_builtin(f, 33);
            }
            HirExpr::StrEq { left, right } => {
                self.emit_expr(f, left);
                self.emit_expr(f, right);
                self.call_builtin(f, 34);
            }
            HirExpr::Clamp { x, lo, hi } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, lo, self);
                as_f32_expr(f, hi, self);
                self.call_builtin(f, 35);
            }
            HirExpr::Lerp { a, b, t } => {
                as_f32_expr(f, a, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, t, self);
                self.call_builtin(f, 36);
            }
            HirExpr::Pow { base, exp } => {
                as_f32_expr(f, base, self);
                as_f32_expr(f, exp, self);
                self.call_builtin(f, 37);
            }
            HirExpr::Sign(inner) => {
                as_f32_expr(f, inner, self);
                self.call_builtin(f, 38);
            }
            HirExpr::Fmod { x, y } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, y, self);
                self.call_builtin(f, 39);
            }
            HirExpr::Smoothstep { edge0, edge1, x } => {
                as_f32_expr(f, edge0, self);
                as_f32_expr(f, edge1, self);
                as_f32_expr(f, x, self);
                self.call_builtin(f, 40);
            }
            HirExpr::DegToRad(inner) => {
                as_f32_expr(f, inner, self);
                self.call_builtin(f, 41);
            }
            HirExpr::RadToDeg(inner) => {
                as_f32_expr(f, inner, self);
                self.call_builtin(f, 42);
            }
            HirExpr::Dist2 { x1, y1, x2, y2 } => {
                as_f32_expr(f, x1, self);
                as_f32_expr(f, y1, self);
                as_f32_expr(f, x2, self);
                as_f32_expr(f, y2, self);
                self.call_builtin(f, 43);
            }
            HirExpr::Pi => {
                self.call_builtin(f, 44);
            }
            HirExpr::AbsI32(inner) => {
                self.emit_expr(f, inner);
                self.call_builtin(f, 45);
            }
            HirExpr::IMin { a, b } => {
                self.emit_expr(f, a);
                self.emit_expr(f, b);
                self.call_builtin(f, 46);
            }
            HirExpr::IMax { a, b } => {
                self.emit_expr(f, a);
                self.emit_expr(f, b);
                self.call_builtin(f, 47);
            }
            HirExpr::IClamp { x, lo, hi } => {
                self.emit_expr(f, x);
                self.emit_expr(f, lo);
                self.emit_expr(f, hi);
                self.call_builtin(f, 48);
            }
            HirExpr::StrConcat { left, right } => {
                self.emit_str_concat(f, left, right);
            }
            HirExpr::StrSubstr { src, start, len } => {
                self.emit_str_substr(f, src, start, len);
            }
            HirExpr::Len2 { x, y } => {
                as_f32_expr(f, x, self);
                as_f32_expr(f, y, self);
                self.call_builtin(f, 49);
            }
            HirExpr::Dot2 { x1, y1, x2, y2 } => {
                as_f32_expr(f, x1, self);
                as_f32_expr(f, y1, self);
                as_f32_expr(f, x2, self);
                as_f32_expr(f, y2, self);
                self.call_builtin(f, 50);
            }
            HirExpr::StrLit(bytes) => {
                let alloc_size = 4 + bytes.len() as u32;
                f.instruction(&Instruction::I32Const(alloc_size as i32));
                f.instruction(&Instruction::LocalSet(self.scratch5));
                self.emit_heap_alloc_local(f, self.scratch5);
                f.instruction(&Instruction::LocalTee(self.scratch));
                f.instruction(&Instruction::I32Const(bytes.len() as i32));
                f.instruction(&Instruction::I32Store(MemArg {
                    offset: 0,
                    align: 2,
                    memory_index: 0,
                }));
                for (i, b) in bytes.iter().enumerate() {
                    f.instruction(&Instruction::LocalGet(self.scratch));
                    f.instruction(&Instruction::I32Const(*b as i32));
                    f.instruction(&Instruction::I32Store8(MemArg {
                        offset: 4 + i as u64,
                        align: 0,
                        memory_index: 0,
                    }));
                }
                f.instruction(&Instruction::LocalGet(self.scratch));
            }
            HirExpr::PrintStr(inner) => {
                self.emit_expr(f, inner);
                self.call_builtin(f, 2);
            }
            HirExpr::PrintI32(inner) => {
                self.emit_expr(f, inner);
                self.call_builtin(f, 3);
            }
            HirExpr::PrintF32(inner) => {
                as_f32_expr(f, inner, self);
                self.call_builtin(f, 4);
            }
            HirExpr::CanvasInit { w, h } => {
                self.emit_expr(f, w);
                self.emit_expr(f, h);
                self.call_builtin(f, 5);
            }
            HirExpr::CanvasClear { r, g, b, a } => {
                as_f32_expr(f, r, self);
                as_f32_expr(f, g, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, a, self);
                self.call_builtin(f, 6);
            }
            HirExpr::CanvasFillRect {
                x, y, w, h, r, g, b, a,
            } => {
                for e in [x, y, w, h, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 7);
            }
            HirExpr::CanvasFillCircle {
                x,
                y,
                radius,
                r,
                g,
                b,
                a,
            } => {
                for e in [x, y, radius, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 8);
            }
            HirExpr::CanvasFillText {
                text,
                x,
                y,
                r,
                g,
                b,
                a,
            } => {
                self.emit_expr(f, text);
                for e in [x, y, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 9);
            }
            HirExpr::CanvasDrawLine {
                x1,
                y1,
                x2,
                y2,
                width,
                r,
                g,
                b,
                a,
            } => {
                for e in [x1, y1, x2, y2, width, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 51);
            }
            HirExpr::CanvasStrokeRect {
                x,
                y,
                w,
                h,
                width,
                r,
                g,
                b,
                a,
            } => {
                for e in [x, y, w, h, width, r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 52);
            }
            HirExpr::GpuClear { r, g, b, a } => {
                as_f32_expr(f, r, self);
                as_f32_expr(f, g, self);
                as_f32_expr(f, b, self);
                as_f32_expr(f, a, self);
                self.call_builtin(f, 10);
            }
            HirExpr::GpuDrawTriangle => {
                self.call_builtin(f, 11);
            }
            HirExpr::KeyDown(code) => {
                self.emit_expr(f, code);
                self.call_builtin(f, 22);
            }
            HirExpr::MouseX => {
                self.call_builtin(f, 23);
            }
            HirExpr::MouseY => {
                self.call_builtin(f, 24);
            }
            HirExpr::MouseDown(btn) => {
                self.emit_expr(f, btn);
                self.call_builtin(f, 25);
            }
            HirExpr::Scene3dInit { w, h } => {
                self.emit_expr(f, w);
                self.emit_expr(f, h);
                self.call_builtin(f, 26);
            }
            HirExpr::Camera3dPerspective {
                fov,
                aspect,
                near,
                far,
            } => {
                for e in [fov, aspect, near, far] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 27);
            }
            HirExpr::Mesh3dBox { sx, sy, sz } => {
                for e in [sx, sy, sz] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 28);
            }
            HirExpr::Mesh3dSetPose {
                mesh,
                tx,
                ty,
                tz,
                rx,
                ry,
                rz,
            } => {
                self.emit_expr(f, mesh);
                for e in [tx, ty, tz, rx, ry, rz] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 29);
            }
            HirExpr::Mesh3dRotate {
                mesh,
                drx,
                dry,
                drz,
            } => {
                self.emit_expr(f, mesh);
                for e in [drx, dry, drz] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 30);
            }
            HirExpr::Scene3dClear { r, g, b, a } => {
                for e in [r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 31);
            }
            HirExpr::Scene3dDraw { mesh, cam } => {
                self.emit_expr(f, mesh);
                self.emit_expr(f, cam);
                self.call_builtin(f, 32);
            }
            HirExpr::AssetLoadStr { path } => {
                self.emit_expr(f, path);
                self.call_builtin(f, 53);
            }
            HirExpr::SpriteDraw { handle, x, y, w, h } => {
                self.emit_expr(f, handle);
                for e in [x, y, w, h] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 54);
            }
            HirExpr::MeshLoadObj { path } => {
                self.emit_expr(f, path);
                self.call_builtin(f, 55);
            }
            HirExpr::Scene3dCreateNode => {
                self.call_builtin(f, 56);
            }
            HirExpr::Scene3dSetParent { child, parent } => {
                self.emit_expr(f, child);
                self.emit_expr(f, parent);
                self.call_builtin(f, 57);
            }
            HirExpr::Camera3dLookAt {
                cam,
                ex,
                ey,
                ez,
                tx,
                ty,
                tz,
            } => {
                self.emit_expr(f, cam);
                for e in [ex, ey, ez, tx, ty, tz] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 58);
            }
            HirExpr::Camera3dOrbit {
                cam,
                target_x,
                target_y,
                target_z,
                yaw,
                pitch,
                distance,
            } => {
                self.emit_expr(f, cam);
                for e in [target_x, target_y, target_z, yaw, pitch, distance] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 59);
            }
            HirExpr::Mesh3dCustom {
                verts_ptr,
                vert_count,
                indices_ptr,
                index_count,
            } => {
                for e in [verts_ptr, vert_count, indices_ptr, index_count] {
                    self.emit_expr(f, e);
                }
                self.call_builtin(f, 60);
            }
            HirExpr::Material3dColor { r, g, b, a } => {
                for e in [r, g, b, a] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 61);
            }
            HirExpr::Mesh3dSetMaterial { mesh, material } => {
                self.emit_expr(f, mesh);
                self.emit_expr(f, material);
                self.call_builtin(f, 62);
            }
            HirExpr::AabbOverlap { a, b } => {
                self.emit_expr(f, a);
                self.emit_expr(f, b);
                self.call_builtin(f, 63);
            }
            HirExpr::AabbResolveX { moving, other, vel_x } => {
                self.emit_expr(f, moving);
                self.emit_expr(f, other);
                as_f32_expr(f, vel_x, self);
                self.call_builtin(f, 64);
            }
            HirExpr::AudioLoad(path) => {
                self.emit_expr(f, path);
                self.call_builtin(f, 65);
            }
            HirExpr::AudioPlay(handle) => {
                self.emit_expr(f, handle);
                self.call_builtin(f, 66);
            }
            HirExpr::WorldCreate => {
                self.call_builtin(f, 67);
            }
            HirExpr::EntityCreate => {
                self.call_builtin(f, 68);
            }
            HirExpr::EntityDestroy(id) => {
                self.emit_expr(f, id);
                self.call_builtin(f, 69);
            }
            HirExpr::EntitySetTag { id, tag } => {
                self.emit_expr(f, id);
                self.emit_expr(f, tag);
                self.call_builtin(f, 70);
            }
            HirExpr::EntityFindByTag(tag) => {
                self.emit_expr(f, tag);
                self.call_builtin(f, 71);
            }
            HirExpr::Transform2dSet {
                id,
                x,
                y,
                rot,
                sx,
                sy,
            } => {
                self.emit_expr(f, id);
                for e in [x, y, rot, sx, sy] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 72);
            }
            HirExpr::Transform3dSet {
                id,
                tx,
                ty,
                tz,
                rx,
                ry,
                rz,
                sx,
                sy,
                sz,
            } => {
                self.emit_expr(f, id);
                for e in [tx, ty, tz, rx, ry, rz, sx, sy, sz] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 73);
            }
            HirExpr::SpriteSet { id, tex, w, h } => {
                self.emit_expr(f, id);
                self.emit_expr(f, tex);
                as_f32_expr(f, w, self);
                as_f32_expr(f, h, self);
                self.call_builtin(f, 74);
            }
            HirExpr::Mesh3dAttach { id, mesh } => {
                self.emit_expr(f, id);
                self.emit_expr(f, mesh);
                self.call_builtin(f, 75);
            }
            HirExpr::WorldStep(dt) => {
                as_f32_expr(f, dt, self);
                self.call_builtin(f, 76);
            }
            HirExpr::SceneLoad(path) => {
                self.emit_expr(f, path);
                self.call_builtin(f, 77);
            }
            HirExpr::Camera2dSet { id, x, y, zoom } => {
                self.emit_expr(f, id);
                for e in [x, y, zoom] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 78);
            }
            HirExpr::TilemapLoad(path) => {
                self.emit_expr(f, path);
                self.call_builtin(f, 79);
            }
            HirExpr::TilemapAttach { entity, tilemap } => {
                self.emit_expr(f, entity);
                self.emit_expr(f, tilemap);
                self.call_builtin(f, 80);
            }
            HirExpr::WorldDraw(cam) => {
                self.emit_expr(f, cam);
                self.call_builtin(f, 81);
            }
            HirExpr::Material3dTexture(asset) => {
                self.emit_expr(f, asset);
                self.call_builtin(f, 82);
            }
            HirExpr::Light3dDirectional { dx, dy, dz, r, g, b } => {
                for e in [dx, dy, dz, r, g, b] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 83);
            }
            HirExpr::Light3dPoint {
                x,
                y,
                z,
                r,
                g,
                b,
                range,
            } => {
                for e in [x, y, z, r, g, b, range] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 84);
            }
            HirExpr::MeshLoadGltf(path) => {
                self.emit_expr(f, path);
                self.call_builtin(f, 85);
            }
            HirExpr::AabbResolveY {
                moving,
                other,
                vel_y,
            } => {
                self.emit_expr(f, moving);
                self.emit_expr(f, other);
                as_f32_expr(f, vel_y, self);
                self.call_builtin(f, 86);
            }
            HirExpr::AudioPlayLoop(handle) => {
                self.emit_expr(f, handle);
                self.call_builtin(f, 87);
            }
            HirExpr::AudioSetVolume { handle, volume } => {
                self.emit_expr(f, handle);
                as_f32_expr(f, volume, self);
                self.call_builtin(f, 88);
            }
            HirExpr::AudioStop(handle) => {
                self.emit_expr(f, handle);
                self.call_builtin(f, 102);
            }
            HirExpr::AudioSetBusVolume(volume) => {
                as_f32_expr(f, volume, self);
                self.call_builtin(f, 103);
            }
            HirExpr::GamepadAxis { pad, axis } => {
                self.emit_expr(f, pad);
                self.emit_expr(f, axis);
                self.call_builtin(f, 89);
            }
            HirExpr::GamepadButton { pad, button } => {
                self.emit_expr(f, pad);
                self.emit_expr(f, button);
                self.call_builtin(f, 90);
            }
            HirExpr::CollisionCount => {
                self.call_builtin(f, 91);
            }
            HirExpr::CollisionEntityA(i) => {
                self.emit_expr(f, i);
                self.call_builtin(f, 92);
            }
            HirExpr::CollisionEntityB(i) => {
                self.emit_expr(f, i);
                self.call_builtin(f, 93);
            }
            HirExpr::CollisionIsTrigger(i) => {
                self.emit_expr(f, i);
                self.call_builtin(f, 104);
            }
            HirExpr::Rigidbody2dSetVel { id, vx, vy } => {
                self.emit_expr(f, id);
                as_f32_expr(f, vx, self);
                as_f32_expr(f, vy, self);
                self.call_builtin(f, 94);
            }
            HirExpr::Rigidbody2dGetGrounded(id) => {
                self.emit_expr(f, id);
                self.call_builtin(f, 95);
            }
            HirExpr::Collider2dSet {
                id,
                kind,
                w,
                h,
                radius,
                solid,
            } => {
                self.emit_expr(f, id);
                self.emit_expr(f, kind);
                as_f32_expr(f, w, self);
                as_f32_expr(f, h, self);
                as_f32_expr(f, radius, self);
                self.emit_expr(f, solid);
                self.call_builtin(f, 96);
            }
            HirExpr::Rigidbody3dSetVel { id, vx, vy, vz } => {
                self.emit_expr(f, id);
                as_f32_expr(f, vx, self);
                as_f32_expr(f, vy, self);
                as_f32_expr(f, vz, self);
                self.call_builtin(f, 105);
            }
            HirExpr::Rigidbody3dGetGrounded(id) => {
                self.emit_expr(f, id);
                self.call_builtin(f, 106);
            }
            HirExpr::Collider3dSet {
                id,
                kind,
                w,
                h,
                d,
                solid,
            } => {
                self.emit_expr(f, id);
                self.emit_expr(f, kind);
                as_f32_expr(f, w, self);
                as_f32_expr(f, h, self);
                as_f32_expr(f, d, self);
                self.emit_expr(f, solid);
                self.call_builtin(f, 107);
            }
            HirExpr::Transform3dSyncFrom2d(id) => {
                self.emit_expr(f, id);
                self.call_builtin(f, 108);
            }
            HirExpr::Camera2dFollow { cam, target, smooth } => {
                self.emit_expr(f, cam);
                self.emit_expr(f, target);
                as_f32_expr(f, smooth, self);
                self.call_builtin(f, 97);
            }
            HirExpr::PrefabSpawn { path, x, y } => {
                self.emit_expr(f, path);
                as_f32_expr(f, x, self);
                as_f32_expr(f, y, self);
                self.call_builtin(f, 98);
            }
            HirExpr::WorldDraw3d(cam) => {
                self.emit_expr(f, cam);
                self.call_builtin(f, 99);
            }
            HirExpr::Scene3dSetAmbient { r, g, b } => {
                for e in [r, g, b] {
                    as_f32_expr(f, e, self);
                }
                self.call_builtin(f, 100);
            }
            HirExpr::Scene3dSetFog(d) => {
                as_f32_expr(f, d, self);
                self.call_builtin(f, 101);
            }
            HirExpr::AnimPlay { id, clip } => {
                self.emit_expr(f, id);
                self.emit_expr(f, clip);
                self.call_builtin(f, 109);
            }
            HirExpr::AnimStop(id) => {
                self.emit_expr(f, id);
                self.call_builtin(f, 110);
            }
        }
    }

    fn emit_binop(&self, f: &mut Function, op: HirBinaryOp, _result_ty: &Type, operand_ty: &Type) {
        match (op, operand_ty) {
            (HirBinaryOp::Add, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Add);
            }
            (HirBinaryOp::Sub, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Sub);
            }
            (HirBinaryOp::Mul, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Mul);
            }
            (HirBinaryOp::Div, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Div);
            }
            (HirBinaryOp::Add, _) => {
                f.instruction(&Instruction::I32Add);
            }
            (HirBinaryOp::Sub, _) => {
                f.instruction(&Instruction::I32Sub);
            }
            (HirBinaryOp::Mul, _) => {
                f.instruction(&Instruction::I32Mul);
            }
            (HirBinaryOp::Div, _) => {
                f.instruction(&Instruction::I32DivS);
            }
            (HirBinaryOp::Rem, _) => {
                f.instruction(&Instruction::I32RemS);
            }
            (HirBinaryOp::Eq, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Eq);
            }
            (HirBinaryOp::Ne, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Ne);
            }
            (HirBinaryOp::Lt, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Lt);
            }
            (HirBinaryOp::Le, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Le);
            }
            (HirBinaryOp::Gt, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Gt);
            }
            (HirBinaryOp::Ge, Type::Builtin(Builtin::F32)) => {
                f.instruction(&Instruction::F32Ge);
            }
            (HirBinaryOp::Eq, _) => {
                f.instruction(&Instruction::I32Eq);
            }
            (HirBinaryOp::Ne, _) => {
                f.instruction(&Instruction::I32Ne);
            }
            (HirBinaryOp::Lt, _) => {
                f.instruction(&Instruction::I32LtS);
            }
            (HirBinaryOp::Le, _) => {
                f.instruction(&Instruction::I32LeS);
            }
            (HirBinaryOp::Gt, _) => {
                f.instruction(&Instruction::I32GtS);
            }
            (HirBinaryOp::Ge, _) => {
                f.instruction(&Instruction::I32GeS);
            }
            (HirBinaryOp::And | HirBinaryOp::Or, _) => unreachable!(),
        }
    }

    fn emit_load(&self, f: &mut Function, ty: &Type) {
        let arg = MemArg {
            offset: 0,
            align: match ty.align() {
                8 => 3,
                4 => 2,
                _ => 0,
            },
            memory_index: 0,
        };
        match ty {
            Type::Builtin(Builtin::F32) => {
                f.instruction(&Instruction::F32Load(arg));
            }
            Type::Builtin(Builtin::F64) => {
                f.instruction(&Instruction::F64Load(arg));
            }
            Type::Builtin(Builtin::I64) => {
                f.instruction(&Instruction::I64Load(arg));
            }
            _ => {
                f.instruction(&Instruction::I32Load(arg));
            }
        }
    }

    fn emit_store(&self, f: &mut Function, ty: &Type) {
        let arg = MemArg {
            offset: 0,
            align: match ty.align() {
                8 => 3,
                4 => 2,
                _ => 0,
            },
            memory_index: 0,
        };
        match ty {
            Type::Builtin(Builtin::F32) => {
                f.instruction(&Instruction::F32Store(arg));
            }
            Type::Builtin(Builtin::F64) => {
                f.instruction(&Instruction::F64Store(arg));
            }
            Type::Builtin(Builtin::I64) => {
                f.instruction(&Instruction::I64Store(arg));
            }
            _ => {
                f.instruction(&Instruction::I32Store(arg));
            }
        }
    }
}

fn expr_ty(expr: &HirExpr) -> Type {
    match expr {
        HirExpr::Int(_) => Type::Builtin(Builtin::I32),
        HirExpr::Float(_) => Type::Builtin(Builtin::F32),
        HirExpr::Bool(_) => Type::Builtin(Builtin::Bool),
        HirExpr::Local(_, t) | HirExpr::Static(_, t) => t.clone(),
        HirExpr::Unary { ty, .. }
        | HirExpr::Binary { ty, .. }
        | HirExpr::Call { ty, .. }
        | HirExpr::ExternCall { ty, .. } => ty.clone(),
        HirExpr::Field { ty, .. } | HirExpr::Index { elem_ty: ty, .. } => ty.clone(),
        HirExpr::ArrayLit { elem_ty, elems, .. } => Type::Array {
            elem: Box::new(elem_ty.clone()),
            len: elems.len() as u32,
        },
        HirExpr::StructLit { .. } | HirExpr::New { .. } => Type::Builtin(Builtin::I32),
        HirExpr::MathUnary { .. }
        | HirExpr::MathBinary { .. }
        | HirExpr::Rand
        | HirExpr::Now
        | HirExpr::AsF32(_)
        | HirExpr::MouseX
        | HirExpr::MouseY => Type::Builtin(Builtin::F32),
        HirExpr::AsI32(_)
        | HirExpr::StrLen(_)
        | HirExpr::KeyDown(_)
        | HirExpr::MouseDown(_)
        | HirExpr::Camera3dPerspective { .. }
        | HirExpr::Mesh3dBox { .. }
        | HirExpr::Scene3dCreateNode
        | HirExpr::Mesh3dCustom { .. }
        | HirExpr::Material3dColor { .. }
        | HirExpr::AssetLoadStr { .. }
        | HirExpr::MeshLoadObj { .. }
        | HirExpr::AudioLoad(_)
        | HirExpr::WorldCreate
        | HirExpr::EntityCreate
        | HirExpr::EntityFindByTag(_)
        | HirExpr::SceneLoad(_)
        | HirExpr::TilemapLoad(_)
        | HirExpr::Material3dTexture(_)
        | HirExpr::Light3dDirectional { .. }
        | HirExpr::Light3dPoint { .. }
        | HirExpr::MeshLoadGltf(_)
        | HirExpr::GamepadButton { .. }
        | HirExpr::CollisionCount
        | HirExpr::CollisionEntityA(_)
        | HirExpr::CollisionEntityB(_)
        | HirExpr::CollisionIsTrigger(_)
        | HirExpr::Rigidbody2dGetGrounded(_)
        | HirExpr::Rigidbody3dGetGrounded(_)
        | HirExpr::PrefabSpawn { .. }
        | HirExpr::AnimPlay { .. } => Type::Builtin(Builtin::I32),
        HirExpr::AabbOverlap { .. } => Type::Builtin(Builtin::Bool),
        HirExpr::AabbResolveX { .. } | HirExpr::AabbResolveY { .. } | HirExpr::GamepadAxis { .. } => {
            Type::Builtin(Builtin::F32)
        }
        HirExpr::StrLit(_) => Type::Builtin(Builtin::Str),
        HirExpr::StrConcat { .. } | HirExpr::StrSubstr { .. } => Type::Builtin(Builtin::Str),
        HirExpr::StrEq { .. } => Type::Builtin(Builtin::Bool),
        HirExpr::Clamp { .. } | HirExpr::Lerp { .. } | HirExpr::Pow { .. } | HirExpr::Fmod { .. }
        | HirExpr::Smoothstep { .. } | HirExpr::DegToRad { .. } | HirExpr::RadToDeg { .. }
        | HirExpr::Dist2 { .. } | HirExpr::Len2 { .. } | HirExpr::Dot2 { .. } | HirExpr::Pi => {
            Type::Builtin(Builtin::F32)
        }
        HirExpr::Sign(_) => Type::Builtin(Builtin::F32),
        HirExpr::AbsI32(_) | HirExpr::IMin { .. } | HirExpr::IMax { .. } | HirExpr::IClamp { .. } => {
            Type::Builtin(Builtin::I32)
        }
        _ => Type::Builtin(Builtin::Void),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use juni_check::check_ok;
    use juni_syntax::parse;

    fn wasm_contains_lt_unreachable(wasm: &[u8]) -> bool {
        // i32.lt_s, if empty, unreachable, end
        let needle: &[u8] = &[0x48, 0x04, 0x40, 0x00, 0x0b];
        wasm.windows(needle.len()).any(|w| w == needle)
    }

    fn wasm_contains_bounds_trap_pattern(wasm: &[u8]) -> bool {
        // Array bounds: lt_s trap + ge_u trap
        let geu: &[u8] = &[0x4f, 0x04, 0x40, 0x00, 0x0b];
        wasm_contains_lt_unreachable(wasm) && wasm.windows(geu.len()).any(|w| w == geu)
    }

    #[test]
    fn dynamic_index_emits_unreachable_bounds_trap() {
        let src = r#"fn main() -> i32:
    let xs = [1, 2, 3]
    let i = 1
    return xs[i]
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        assert!(
            wasm_contains_bounds_trap_pattern(&wasm),
            "expected array bounds check with unreachable in wasm"
        );
    }

    #[test]
    fn str_substr_emits_unreachable_bounds_trap() {
        let src = r#"fn main() -> i32:
    let s = str_substr("hello", 1, 3)
    return str_len(s)
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        assert!(
            wasm_contains_lt_unreachable(&wasm),
            "expected str_substr bounds check with unreachable in wasm"
        );
        // Also overflow / src_len compare uses i32.gt_u + unreachable
        let gtu: &[u8] = &[0x4b, 0x04, 0x40, 0x00, 0x0b];
        assert!(
            wasm.windows(gtu.len()).any(|w| w == gtu),
            "expected str_substr sum > src_len trap"
        );
    }

    /// `(module, name)` of every function import, in order; also validates the module.
    fn imports_of(wasm: &[u8]) -> Vec<(String, String)> {
        wasmparser::Validator::new()
            .validate_all(wasm)
            .expect("emitted wasm must validate");
        let mut out = Vec::new();
        for payload in wasmparser::Parser::new(0).parse_all(wasm) {
            if let wasmparser::Payload::ImportSection(reader) = payload.unwrap() {
                for imp in reader {
                    let imp = imp.unwrap();
                    out.push((imp.module.to_string(), imp.name.to_string()));
                }
            }
        }
        out
    }

    fn exports_of(wasm: &[u8]) -> Vec<String> {
        let mut out = Vec::new();
        for payload in wasmparser::Parser::new(0).parse_all(wasm) {
            if let wasmparser::Payload::ExportSection(reader) = payload.unwrap() {
                for exp in reader {
                    out.push(exp.unwrap().name.to_string());
                }
            }
        }
        out
    }

    #[test]
    fn allocation_inside_if_body_keeps_operand_stack_balanced() {
        // Regression: the allocator's max/min helpers leaked operand-stack
        // values, which the validator only catches when the allocation is not
        // followed by `return` in the same block.
        let src = r#"fn main() -> i32:
    let n = 1
    if n > 0:
        let s = "x"
        print(s)
    return 0
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        let _ = imports_of(&wasm); // validates
    }

    #[test]
    fn unused_builtins_are_pruned_from_imports() {
        let src = r#"fn main() -> i32:
    print("hi")
    return 0
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        let imports = imports_of(&wasm);
        assert_eq!(imports, vec![("env".to_string(), "print_str".to_string())]);
        assert_eq!(builtin_imports_used(&hir), vec!["print_str"]);
        assert!(exports_of(&wasm).contains(&"main".to_string()));
    }

    #[test]
    fn no_imports_when_program_is_pure() {
        let src = r#"fn add(a: i32, b: i32) -> i32:
    return a + b

fn main() -> i32:
    return add(1, 2)
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        assert!(imports_of(&wasm).is_empty());
    }

    #[test]
    fn extern_block_emits_named_module_imports_after_builtins() {
        let src = r#"
extern "kerabit":
    fn entity(name: str) -> i32
    fn set_pos(e: i32, x: f32, y: f32, z: f32)
    fn key_down(name: str) -> bool

state:
    player: i32 = 0

fn main() -> i32:
    player = entity("player")
    set_pos(player, 0.0, 0.5, 0.0)
    return 0

fn frame(dt: f32) -> i32:
    if key_down("W"):
        set_pos(player, sqrt(dt), 0.5, 0.0)
    return 0
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        let imports = imports_of(&wasm);
        assert_eq!(
            imports,
            vec![
                ("env".to_string(), "sqrt_f32".to_string()),
                ("kerabit".to_string(), "entity".to_string()),
                ("kerabit".to_string(), "set_pos".to_string()),
                ("kerabit".to_string(), "key_down".to_string()),
            ]
        );
        let externs = extern_imports(&hir);
        assert_eq!(externs.len(), 3);
        assert_eq!(externs[2].name, "key_down");
        let exports = exports_of(&wasm);
        assert!(exports.contains(&"main".to_string()) && exports.contains(&"frame".to_string()));
    }

    #[test]
    fn extern_imports_dedupe_across_modules() {
        use juni_check::{check_program_ok, ProgramModule};

        let host = parse(
            r#"export extern "host":
    fn ping(x: i32) -> i32
"#,
        )
        .unwrap();
        let util = parse(
            r#"from host import ping

export fn twice(x: i32) -> i32:
    return ping(ping(x))
"#,
        )
        .unwrap();
        let main = parse(
            r#"import host
from util import twice

extern "host":
    fn ping(x: i32) -> i32

fn main() -> i32:
    return twice(host.ping(1)) + ping(2)
"#,
        )
        .unwrap();
        let modules = vec![
            ProgramModule { name: "host".into(), file: None, module: host },
            ProgramModule { name: "util".into(), file: None, module: util },
            ProgramModule { name: "main".into(), file: None, module: main },
        ];
        let program = check_program_ok(&modules, "main").unwrap();
        let wasm = emit_wasm_program(&program);
        assert_eq!(imports_of(&wasm), vec![("host".to_string(), "ping".to_string())]);
    }

    #[test]
    fn emitted_wasm_embeds_juni_notice() {
        let src = r#"fn main() -> i32:
    return 0
"#;
        let m = parse(src).unwrap();
        let hir = check_ok(&m).unwrap();
        let wasm = emit_wasm(&hir);
        let text = String::from_utf8_lossy(&wasm);
        assert!(
            text.contains("Required Notice:") && text.contains("juni.notice"),
            "expected juni.notice custom section with Required Notice"
        );
    }
}
