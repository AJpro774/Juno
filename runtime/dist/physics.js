/** AABB physics intrinsics: aabb_overlap, aabb_resolve_x. */
export function readAabb(memory, ptr) {
    const view = new DataView(memory.buffer);
    return {
        x: view.getFloat32(ptr, true),
        y: view.getFloat32(ptr + 4, true),
        w: view.getFloat32(ptr + 8, true),
        h: view.getFloat32(ptr + 12, true),
    };
}
export function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function aabbResolveX(moving, other, velX) {
    if (!aabbOverlap(moving, other))
        return velX;
    const movingRight = velX > 0;
    const movingLeft = velX < 0;
    if (movingRight && moving.x + moving.w > other.x && moving.x < other.x) {
        return 0;
    }
    if (movingLeft && moving.x < other.x + other.w && moving.x + moving.w > other.x + other.w) {
        return 0;
    }
    return velX;
}
export function createPhysicsImports(memoryRef) {
    return {
        aabb_overlap(aPtr, bPtr) {
            const memory = memoryRef.current;
            if (!memory)
                return 0;
            return aabbOverlap(readAabb(memory, aPtr), readAabb(memory, bPtr)) ? 1 : 0;
        },
        aabb_resolve_x(mPtr, oPtr, velX) {
            const memory = memoryRef.current;
            if (!memory)
                return velX;
            return aabbResolveX(readAabb(memory, mPtr), readAabb(memory, oPtr), velX);
        },
    };
}
//# sourceMappingURL=physics.js.map