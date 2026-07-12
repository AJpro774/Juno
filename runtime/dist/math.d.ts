/** Math helpers for WASM f32 imports. */
export declare function fr(x: number): number;
export declare function rgba(r: number, g: number, b: number, a: number): string;
export declare function mat4Identity(): Float32Array;
export declare function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array;
export declare function mat4Perspective(fovDeg: number, aspect: number, near: number, far: number): Float32Array;
export declare function mat4Translate(x: number, y: number, z: number): Float32Array;
export declare function mat4RotateXYZ(rx: number, ry: number, rz: number): Float32Array;
export declare function mat4Scale(sx: number, sy: number, sz: number): Float32Array;
export declare function mat4LookAt(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): Float32Array;
//# sourceMappingURL=math.d.ts.map