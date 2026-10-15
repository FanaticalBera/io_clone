const work = new WeakMap();
export function captureCandidates(match, p) {
    const count = match.map.cells.length;
    let scratch = work.get(match);
    if (!scratch) {
        scratch = { visited: new Uint8Array(count), blocked: new Uint8Array(count), queue: new Int32Array(count), exteriorSeeds: match.map.cells.filter(c => match.map.inset[c.id] === 0).map(c => c.id) };
        work.set(match, scratch);
    }
    const { visited, blocked, queue } = scratch;
    visited.fill(0);
    blocked.fill(0);
    for (let i = 0; i < count; i++)
        if (match.owners[i] === p.slot + 1 || p.trailCells.has(i))
            blocked[i] = 1;
    // Every unblocked boundary cell is connected to the virtual exterior.
    let head = 0, tail = 0;
    for (const id of scratch.exteriorSeeds)
        if (!blocked[id]) {
            visited[id] = 1;
            queue[tail++] = id;
        }
    while (head < tail) {
        const id = queue[head++];
        for (const n of match.map.cells[id].neighbors)
            if (n >= 0 && !blocked[n] && !visited[n]) {
                visited[n] = 1;
                queue[tail++] = n;
            }
    }
    const candidates = new Set(p.trailCells);
    for (let seed = 0; seed < count; seed++) {
        if (visited[seed] || blocked[seed])
            continue;
        head = 0;
        tail = 0;
        visited[seed] = 1;
        queue[tail++] = seed;
        let touchesCurrentTrail = false;
        while (head < tail) {
            const id = queue[head++];
            for (const n of match.map.cells[id].neighbors) {
                if (n < 0)
                    continue;
                if (p.trailCells.has(n))
                    touchesCurrentTrail = true;
                if (!blocked[n] && !visited[n]) {
                    visited[n] = 1;
                    queue[tail++] = n;
                }
            }
        }
        if (touchesCurrentTrail)
            for (let i = 0; i < tail; i++)
                candidates.add(queue[i]);
    }
    return candidates;
}
