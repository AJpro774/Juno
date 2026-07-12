/** Math helpers for WASM f32 imports. */
export function fr(x) {
    return Math.fround(x);
}
export function rgba(r, g, b, a) {
    const R = Math.round(Math.min(1, Math.max(0, r)) * 255);
    const G = Math.round(Math.min(1, Math.max(0, g)) * 255);
    const B = Math.round(Math.min(1, Math.max(0, b)) * 255);
    return `rgba(${R},${G},${B},${Math.min(1, Math.max(0, a))})`;
}
export function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}
export function mat4Multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[c * 4 + r] =
                a[0 * 4 + r] * b[c * 4 + 0] +
                    a[1 * 4 + r] * b[c * 4 + 1] +
                    a[2 * 4 + r] * b[c * 4 + 2] +
                    a[3 * 4 + r] * b[c * 4 + 3];
        }
    }
    return o;
}
export function mat4Perspective(fovDeg, aspect, near, far) {
    const f = 1 / Math.tan((fovDeg * Math.PI) / 180 / 2);
    const nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
}
export function mat4Translate(x, y, z) {
    const m = mat4Identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
}
export function mat4RotateXYZ(rx, ry, rz) {
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const rxM = new Float32Array([1, 0, 0, 0, 0, cx, sx, 0, 0, -sx, cx, 0, 0, 0, 0, 1]);
    const ryM = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]);
    const rzM = new Float32Array([cz, sz, 0, 0, -sz, cz, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    return mat4Multiply(mat4Multiply(rzM, ryM), rxM);
}
export function mat4Scale(sx, sy, sz) {
    const m = mat4Identity();
    m[0] = sx;
    m[5] = sy;
    m[10] = sz;
    return m;
}
export function mat4LookAt(ex, ey, ez, tx, ty, tz) {
    let zx = ex - tx;
    let zy = ey - ty;
    let zz = ez - tz;
    let len = Math.hypot(zx, zy, zz);
    if (len < 1e-6) {
        return mat4Identity();
    }
    zx /= len;
    zy /= len;
    zz /= len;
    const ux = 0;
    const uy = 1;
    const uz = 0;
    let xx = uy * zz - uz * zy;
    let xy = uz * zx - ux * zz;
    let xz = ux * zy - uy * zx;
    len = Math.hypot(xx, xy, xz);
    if (len < 1e-6) {
        return mat4Identity();
    }
    xx /= len;
    xy /= len;
    xz /= len;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx;
    m[1] = yx;
    m[2] = zx;
    m[3] = 0;
    m[4] = xy;
    m[5] = yy;
    m[6] = zy;
    m[7] = 0;
    m[8] = xz;
    m[9] = yz;
    m[10] = zz;
    m[11] = 0;
    m[12] = -(xx * ex + xy * ey + xz * ez);
    m[13] = -(yx * ex + yy * ey + yz * ez);
    m[14] = -(zx * ex + zy * ey + zz * ez);
    m[15] = 1;
    return m;
}
//# sourceMappingURL=math.js.map